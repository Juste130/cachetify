const { config } = require('./config');
const { AppError } = require('./utils/errors');

/**
 * Best-effort, in-memory, per-process rate limiting — replaces express-rate-limit, which
 * relied on the same in-memory store but under a model (one long-lived Express process)
 * where that store actually persisted across every request. On Netlify Functions there is
 * no such guarantee: concurrent invocations may land on different warm instances, each with
 * its own Map. This still blocks a tight loop hitting the SAME warm instance (the common
 * case for a single abusive client in a short burst), but is not a substitute for a
 * distributed limiter under real adversarial load. Accepted trade-off: matches the
 * simplification goal of this migration (no new infra/Redis/Blobs just for this).
 */
const buckets = new Map();

function getClientKey(request) {
    const forwarded = request.headers.get('x-forwarded-for');
    return (forwarded ? forwarded.split(',')[0].trim() : null) || 'unknown';
}

/**
 * @param {Request} request
 * @param {{ windowMs: number, max: number, message: string }} options
 * @param {string} [keyOverride] e.g. an authenticated user id, when the limiter should be
 *   scoped per-account rather than per-IP (see resendLimiter below).
 */
function consume(request, name, options, keyOverride) {
    const key = `${name}:${keyOverride || getClientKey(request)}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now - bucket.windowStart >= options.windowMs) {
        buckets.set(key, { windowStart: now, count: 1 });
        return;
    }

    bucket.count += 1;
    if (bucket.count > options.max) {
        throw new AppError(options.message, 429);
    }
}

const LIMITERS = {
    general: { windowMs: config.rateLimit.windowMs, max: config.rateLimit.maxRequests, message: 'Too many requests, please try again later' },
    ai: { windowMs: config.rateLimit.windowMs, max: config.rateLimit.aiMaxRequests, message: 'Too many AI requests, please try again later' },
    wallet: { windowMs: config.rateLimit.windowMs, max: config.rateLimit.walletMaxRequests, message: 'Too many wallet operations, please try again later' },
    auth: { windowMs: config.rateLimit.windowMs, max: config.rateLimit.authMaxRequests, message: 'Too many authentication requests, please try again later' },
    invite: { windowMs: config.rateLimit.windowMs, max: config.rateLimit.inviteMaxRequests, message: 'Too many invitations sent, please try again later' },
    // Scoped per authenticated user (keyOverride), not per IP — a contract creator can
    // legitimately share an IP with teammates, but shouldn't be able to spam a signatory's
    // inbox in a loop from their own account.
    resend: { windowMs: config.rateLimit.resendWindowMs, max: config.rateLimit.resendMaxRequests, message: 'Too many signature reminders sent, please wait before retrying' },
    // Public, unauthenticated endpoint (contract verification) — the natural target of
    // automated enumeration even with a non-guessable token (mémoire, chapitre 2, section
    // Sécurité et protection des données). Stricter than the general limiter.
    verify: { windowMs: config.rateLimit.windowMs, max: config.rateLimit.verifyMaxRequests, message: 'Trop de vérifications, réessayez plus tard' },
};

/** Call at the top of a Route Handler; throws (429) if the caller is over the limit. */
function checkRateLimit(request, name, keyOverride) {
    consume(request, name, LIMITERS[name], keyOverride);
}

module.exports = { checkRateLimit };
