const { config } = require('../config');
const { NotFoundError } = require('../utils/errors');

/**
 * Garde une route derrière un drapeau de config.features.* (aujourd'hui, uniquement le
 * séquestre) pour une fonctionnalité hors périmètre du mémoire : masquer le bouton côté
 * interface ne suffit pas, une requête directe à l'API resterait possible sinon. Renvoie une
 * 404 plutôt qu'une 403 pour ne pas laisser deviner que la route existe.
 */
function requireFeature(name) {
    return (req, res, next) => {
        if (!config.features[name]) {
            return next(new NotFoundError('Fonctionnalité indisponible'));
        }
        next();
    };
}

module.exports = { requireFeature };
