const { cookies } = require('next/headers');
const { NextResponse } = require('next/server');
const { PrivyClient } = require('@privy-io/server-auth');
const authService = require('./services/auth');
const logger = require('./utils/logger');
const prisma = require('./db');
const { UserRole } = require('@prisma/client');
const { AppError, UnauthorizedError, ForbiddenError } = require('./utils/errors');

/**
 * Replaces middleware/auth.js's `authenticate` — there is no Express middleware chain in
 * Next.js Route Handlers, so every handler that needs a session calls this explicitly at
 * its top (`const user = await authenticate(request)`), exactly mirroring which routes used
 * to carry the `authenticate` middleware and which didn't.
 *
 * Async and DB-backed on purpose: an access token's signature being valid only proves it
 * was ISSUED while the account was in good standing — it says nothing about whether an
 * admin suspended that account a minute later. Without this lookup, `isActive: false`
 * (the "Suspendre" action in the admin panel) had zero effect: the holder of an
 * already-issued token kept full access until it happened to expire naturally.
 */
async function authenticate(request) {
    let token = (await cookies()).get('accessToken')?.value;

    if (!token) {
        const authHeader = request.headers.get('authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }
    }

    if (!token) {
        throw new UnauthorizedError('No token provided');
    }

    let payload;
    try {
        payload = authService.verifyToken(token);
    } catch (error) {
        logger.error('Authentication error:', error);
        throw new UnauthorizedError('Invalid token');
    }

    const dbUser = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { isActive: true, role: true },
    });

    if (!dbUser || !dbUser.isActive) {
        throw new ForbiddenError('Ce compte a été suspendu');
    }

    // Same reasoning as isActive above, for role: the JWT's `role` claim is frozen at the
    // moment it was issued. Without overwriting it here, an admin demoted via
    // updateUserRole keeps requireAdmin access on every already-issued token until it
    // expires. `user.role` below always comes from this DB read, never from the token.
    return { ...payload, role: dbUser.role };
}

function requireAdmin(user) {
    if (!user) throw new UnauthorizedError('Not authenticated');
    if (user.role !== UserRole.ADMIN) throw new ForbiddenError('Admin access required');
}

function requireRole(user, roles) {
    if (!user) throw new UnauthorizedError('Not authenticated');
    if (!roles.includes(user.role)) throw new ForbiddenError('Insufficient permissions');
}

/**
 * Replaces middleware/error-handler.js. Every Route Handler wraps its body in
 * try/catch and returns `apiError(err)` from the catch block — there is no Express-style
 * app-wide error middleware to fall back on in Next.js.
 */
function apiError(err) {
    logger.error('Error:', { message: err.message, stack: err.stack });

    let statusCode = err.statusCode || 500;
    const message = err.message || 'Internal server error';

    if (statusCode === 500 && !(err instanceof AppError) && err.message) {
        if (/\bnot found\b/i.test(err.message)) statusCode = 404;
        else if (/\binvalid\b/i.test(err.message) || /\balready exists\b/i.test(err.message)) statusCode = 400;
        else if (/\bunauthorized\b/i.test(err.message) || /\binvalid token\b/i.test(err.message)) statusCode = 401;
        else if (/\bforbidden\b/i.test(err.message) || /\bpermissions\b/i.test(err.message)) statusCode = 403;
    }

    return NextResponse.json(
        { error: message, ...(process.env.NODE_ENV === 'development' && { stack: err.stack }) },
        { status: statusCode }
    );
}

/**
 * Replaces middleware/feature-flag.js's `requireFeature`. Throws instead of responding
 * directly so call sites stay consistent with every other guard in this file (caught by
 * the same try/catch -> apiError(err) pattern as everything else).
 */
function requireFeature(name) {
    const { config } = require('./config');
    if (!config.features[name]) {
        throw new (require('./utils/errors').NotFoundError)('Fonctionnalité indisponible');
    }
}

/**
 * Replaces middleware/privy-auth.js's `verifyPrivyToken`. Verifies the Privy token sent in
 * the Authorization header server-side, server-side. Returns `{ userId, verifiedEmail, ... }`
 * on success or throws. `verifiedEmail` always comes from Privy's own API
 * (client.getUserById), never from the request body — a client-supplied email is not
 * trustworthy for identity (see audit v4, account-takeover finding).
 *
 * @param {Request} request
 * @param {string|null} [devFallbackEmail] only used in the degraded dev-mode path below
 *   (no Privy keys configured, NODE_ENV !== 'production') — pass the request body's email
 *   there since Route Handlers must read the body themselves before calling this.
 */
let _privyClient;
function getPrivyClient() {
    if (_privyClient !== undefined) return _privyClient;
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || process.env.PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (!appId || !appSecret) {
        logger.warn('PRIVY_APP_ID ou PRIVY_APP_SECRET manquant — vérification Privy désactivée');
        _privyClient = null;
    } else {
        _privyClient = new PrivyClient(appId, appSecret);
    }
    return _privyClient;
}

async function verifyPrivyToken(request, devFallbackEmail) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedError('Token Privy manquant');
    }
    const token = authHeader.substring(7);
    const client = getPrivyClient();

    if (!client) {
        if (process.env.NODE_ENV !== 'production') {
            logger.warn('verifyPrivyToken: client non configuré, mode dégradé (dev uniquement, email non vérifié)');
            return { userId: 'dev-user', address: null, verifiedEmail: devFallbackEmail || null };
        }
        throw new AppError("Service d'authentification non disponible", 503);
    }

    try {
        const verifiedClaims = await client.verifyAuthToken(token);
        let verifiedEmail = null;
        try {
            const privyUserRecord = await client.getUserById(verifiedClaims.userId);
            verifiedEmail = privyUserRecord?.email?.address || null;
        } catch (fetchError) {
            logger.warn("verifyPrivyToken: échec de récupération de l'utilisateur Privy", { error: fetchError.message });
        }
        return { ...verifiedClaims, verifiedEmail };
    } catch (error) {
        logger.warn('verifyPrivyToken: Token invalide ou expiré', { error: error.message });
        throw new UnauthorizedError('Token Privy invalide ou expiré');
    }
}

/** Netlify (and most proxies) forward the real client IP via X-Forwarded-For. */
function getClientIp(request) {
    const forwarded = request.headers.get('x-forwarded-for');
    return (forwarded ? forwarded.split(',')[0].trim() : null) || null;
}

module.exports = { authenticate, requireAdmin, requireRole, apiError, requireFeature, verifyPrivyToken, getClientIp };
