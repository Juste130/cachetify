import { NextResponse } from 'next/server';
import authService from '../../../../server/services/auth';
import logger from '../../../../server/utils/logger';
import { verifyPrivyToken, apiError, getClientIp } from '../../../../server/http';
import { checkRateLimit } from '../../../../server/rate-limit';

const isProd = process.env.NODE_ENV === 'production';

/** Mirrors the old setAuthCookies() in controllers/auth.js, applied to a NextResponse. */
function setAuthCookies(response, token, refreshToken) {
    const base = { httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax', path: '/' };
    response.cookies.set('accessToken', token, { ...base, maxAge: 60 * 60 });
    response.cookies.set('refreshToken', refreshToken, { ...base, maxAge: 7 * 24 * 60 * 60 });
}

/**
 * POST /api/auth/privy — vérifié côté serveur via SDK Privy.
 * L'email utilisé pour l'identité vient de privyUser.verifiedEmail (vérifié côté serveur
 * par verifyPrivyToken), jamais du body — un email fourni par le client ne doit pas être
 * trusted pour l'identité (voir audit v4).
 */
export async function POST(request) {
    try {
        checkRateLimit(request, 'auth');

        const body = await request.json().catch(() => ({}));
        const { walletAddress, profileData, email: bodyEmail } = body;

        if (bodyEmail !== undefined && bodyEmail !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(bodyEmail))) {
            return NextResponse.json({ errors: [{ msg: 'Invalid email', path: 'email' }] }, { status: 400 });
        }

        const privyUser = await verifyPrivyToken(request, bodyEmail);
        const privyId = privyUser?.userId;
        const email = privyUser?.verifiedEmail;

        if (!privyId) {
            return NextResponse.json({ error: 'Token Privy invalide' }, { status: 400 });
        }
        if (!email) {
            return NextResponse.json({ error: 'Email non vérifié par Privy' }, { status: 400 });
        }
        if (bodyEmail && bodyEmail.toLowerCase() !== email.toLowerCase()) {
            logger.warn("privyAuth: email du body différent de l'email vérifié par Privy", {
                privyId, bodyEmail, verifiedEmail: email,
            });
        }

        const result = await authService.privyAuth(privyId, email, walletAddress, profileData, {
            ip: getClientIp(request),
            ua: request.headers.get('user-agent'),
        });

        const response = NextResponse.json({ message: 'Privy authentication successful', user: result.user });
        setAuthCookies(response, result.token, result.refreshToken);
        return response;
    } catch (error) {
        return apiError(error);
    }
}
