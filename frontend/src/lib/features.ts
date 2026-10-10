/**
 * Reflet côté client des drapeaux serveur (backend/config/index.js, features.*) : le mémoire
 * ne décrit que le fil Rédiger → Signer → Prouver, séquestre et NFT sont hors périmètre (voir
 * mémoire, chapitre 2, section recentrage). Le code reste en place (composants, routes,
 * champs) — seul l'affichage est masqué ici, jamais supprimé.
 *
 * KYC reste volontairement actif malgré `FEATURE_KYC` côté serveur : décision explicite de
 * ne pas le masquer, contrairement à séquestre et NFT.
 *
 * Un drapeau à `true` ici sans l'équivalent serveur activé (`FEATURE_ESCROW`/`FEATURE_NFT`)
 * réaffiche une UI dont les appels API échoueront (404) — les deux doivent être activés
 * ensemble.
 */
export const FEATURES = {
  escrow: process.env.NEXT_PUBLIC_FEATURE_ESCROW === "true",
  nft: process.env.NEXT_PUBLIC_FEATURE_NFT === "true",
};
