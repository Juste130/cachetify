const { config } = require('../config');

/**
 * Defense against CSRF on cookie-authenticated requests. Auth here relies on an httpOnly
 * cookie sent automatically by the browser — including cross-site, since production uses
 * `sameSite: 'none'` to support a frontend and API on different domains (see
 * controllers/auth.js). CORS alone does NOT stop this: it only gates whether cross-origin
 * JavaScript can READ a response, not whether a state-changing request is sent with cookies
 * attached in the first place.
 *
 * A browser always sends the `Origin` header on a cross-site fetch/XHR/form POST, and an
 * attacker's page cannot forge or suppress it — so rejecting a mismatched Origin on every
 * unsafe method blocks exactly that attack. A request with NO Origin header is let through
 * unchanged: real browser calls from this app's own frontend always carry one, so the only
 * callers affected are non-browser clients (the Smile ID webhook, Bearer-token API
 * consumers) that were never relying on the cookie for auth to begin with.
 */
const verifyOrigin = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

    const origin = req.headers.origin;
    if (origin && origin !== config.frontendUrl) {
        return res.status(403).json({ error: 'Origin non autorisée' });
    }

    next();
};

module.exports = { verifyOrigin };
