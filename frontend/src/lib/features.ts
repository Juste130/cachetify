/**
 * Reflet côté client du drapeau serveur (backend/config/index.js, features.*) : le mémoire
 * ne décrit que le fil Rédiger → Signer → Prouver, le séquestre est hors périmètre (voir
 * mémoire, chapitre 2, section recentrage). Le code reste en place (composants, routes,
 * champs) — seul l'affichage est masqué ici, jamais supprimé. Le certificat NFT, lui, a été
 * retiré du smart contract lui-même (plus de code à masquer).
 *
 * KYC reste volontairement actif malgré `FEATURE_KYC` côté serveur : décision explicite de
 * ne pas le masquer, contrairement au séquestre.
 *
 * Un drapeau à `true` ici sans l'équivalent serveur activé (`FEATURE_ESCROW`) réaffiche une
 * UI dont les appels API échoueront (404) — les deux doivent être activés ensemble.
 */
export const FEATURES = {
  escrow: process.env.NEXT_PUBLIC_FEATURE_ESCROW === "true",
};
