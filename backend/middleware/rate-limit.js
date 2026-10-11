const rateLimit = require('express-rate-limit');
const { config } = require('../config');

// General rate limiter
const generalLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

// AI endpoints rate limiter (stricter)
const aiLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.aiMaxRequests,
    message: 'Too many AI requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

// Wallet operations rate limiter (very strict)
const walletLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.walletMaxRequests,
    message: 'Too many wallet operations, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

// Auth endpoints rate limiter (strict — anti-bruteforce sur /api/auth/privy)
const authLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.authMaxRequests,
    message: 'Too many authentication requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

// Invitation rate limiter — the endpoint already throttles repeat invites to the SAME
// email (see inviteUser), but this caps how many DIFFERENT addresses one account can
// spam invitations to.
const inviteLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.inviteMaxRequests,
    message: 'Too many invitations sent, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

// Signature-reminder rate limiter — scoped per authenticated user (not per IP): a contract
// creator can legitimately share an IP with teammates, but shouldn't be able to spam a
// signatory's inbox in a loop from their own account. Falls back to req.ip only if somehow
// unauthenticated (the route itself requires `authenticate` first, so this is defensive).
const resendLimiter = rateLimit({
    windowMs: config.rateLimit.resendWindowMs,
    max: config.rateLimit.resendMaxRequests,
    message: 'Too many signature reminders sent, please wait before retrying',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.userId || req.ip,
});

// Vérification publique — endpoint public, sans authentification, donc la cible naturelle
// d'une énumération automatisée même avec un jeton non devinable (mémoire, chapitre 2,
// section Sécurité et protection des données). Plus strict que le limiteur général.
const verifyLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.verifyMaxRequests,
    message: 'Trop de vérifications, réessayez plus tard',
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    generalLimiter,
    aiLimiter,
    walletLimiter,
    authLimiter,
    inviteLimiter,
    resendLimiter,
    verifyLimiter,
};
