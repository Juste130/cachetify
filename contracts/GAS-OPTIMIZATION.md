# Optimisation gaz — ContractManager / ContractNFT (historique, dépassé)

**Statut : dépassé.** `ContractManager.sol` a depuis été entièrement réécrit en une version simplifiée au périmètre du mémoire (séquestre, litige, résiliation, paiement et certificat NFT retirés ; `ContractNFT.sol` supprimé) et redéployé sous une nouvelle adresse — voir `SMART_CONTRACTS.md` pour l'état actuel. Les deux pistes reportées ci-dessous sont résolues par construction dans la nouvelle version : `ContractData` ne contient plus que des champs scalaires simples (plus de réordonnancement à coordonner), et l'événement `Notification` a été retiré. Le reste de ce document est conservé comme trace de la revue gaz du 7 septembre 2026 sur l'ancien contrat.

Revue faite avant le redéploiement du **7 septembre 2026** (voir historique git pour le commit exact). Trois catégories : appliqué maintenant (sans risque, sans coordination), et deux pistes réelles mais **volontairement reportées**, documentées ici pour ne pas être oubliées.

## Appliqué dans ce déploiement

**`memory` → `storage` pour les lectures internes en boucle** (`_isContractParticipant`, `_allSignaturesCollected`, `_getAllParticipants`) et **lecture d'un seul champ au lieu de copier toute la struct** (`_mintContractNFT`, qui ne lisait que `.creator` mais copiait `ContractData` en entier — y compris les deux structs imbriquées `TerminationInfo`/`DisputeInfo`, chacune avec plusieurs `string`).

Pourquoi c'était sûr à appliquer immédiatement : fonctions toutes `internal`, aucun changement de signature ni de comportement observable, seulement moins de données copiées de `storage` vers `memory` pour les mêmes lectures. Confirmé par la suite de tests existante (39/39 toujours au vert après coup).

## Reporté — nécessite une coordination avec le backend

**Réordonner les champs de `ContractData`** pour regrouper tous les scalaires de petite taille (`uint40`, `uint8`, `bool`, `address`) avant les champs dynamiques (`string`, structs imbriqués contenant des `string`). C'est le gain le plus important en volume — chaque champ dynamique dans la struct actuelle interrompt le compactage des slots de stockage, gaspillant plusieurs dizaines d'octets par écriture.

**Pourquoi ce n'est pas fait maintenant** : `backend/services/blockchain-sync.js` définit `CONTRACT_MANAGER_ABI` **à la main**, avec l'ordre exact des champs de `ContractData` recopié dans une chaîne. Réordonner la struct côté Solidity sans mettre à jour ce texte en même temps romprait silencieusement le décodage des données lues depuis la chaîne — pas une erreur bruyante, des champs mal alignés. À faire dans un passage dédié, contrat et ABI backend modifiés ensemble, testé de bout en bout avant tout redéploiement.

## Reporté — décision produit, pas juste technique

**L'événement `Notification` (et `_notifyAllParticipants` qui l'émet)** — vérifié : **ni le backend ni le frontend ne l'écoutent nulle part** (grep sur les deux dépôts, aucune correspondance). Il est émis pour chaque participant à chaque action significative (finalisation, résiliation, litige, dépôt/libération/pénalité d'escrow), jusqu'à 50 fois par appel selon le nombre de signataires — un vrai coût, actuellement pour rien.

**Pourquoi ce n'est pas supprimé maintenant** : contrairement aux optimisations ci-dessus, retirer tout un système d'événements est un choix de conception, pas une correction mécanique — peut-être qu'il sert de trace on-chain volontaire (consultable sur Polygonscan même sans être branché à rien), cohérent avec la philosophie du contrat (justifications, horodatage infalsifiable). Sans risque technique à le retirer (rien n'en dépend), mais c'est une décision à valider plutôt qu'à prendre en silence dans un déploiement déjà en cours. **Économie potentielle si supprimé** : significative sur les contrats à beaucoup de signataires — à évaluer.

## Contrats concernés par ce déploiement

- `ContractNFT` : `0x8ea4c421b4F39C869b6dF398cc09b9a81A9f7708` — inchangé dans ce passage, déjà déployé avant la revue gaz.
- `ContractManager` : `0xc1E55b04F694905f7c9C0bc988a89787Dd75E0B1` — inclut les optimisations ci-dessus.

**Conséquence directe du redéploiement** : les contrats déjà créés sous l'ancienne adresse (`0x4b765546c69e6Da40E36D685F83209324f9A9c44`) ne sont plus accessibles depuis l'app — `_contractIds` repart de zéro sur la nouvelle instance. Les données existent toujours on-chain à l'ancienne adresse, simplement plus référencées par la configuration actuelle.
