# Séquestre on-chain — résolu (fonctions retirées du contrat)

**Statut : résolu.** Le risque documenté ici (les fonctions `depositEscrow`/`releaseEscrow`/`applyPenalty`, inutilisées par le produit mais toujours appelables directement sur le contrat déployé) a été tranché en choisissant l'option 1 listée plus bas : les trois fonctions, et tout le modèle d'escrow on-chain qui allait avec (`escrowAmount`, `penaltyPercent`, `isEscrowDeposited`, `escrowPayer`, `releasedAmount`), ont été **retirées** de `ContractManager.sol` lors du nouveau contrat simplifié pour correspondre exactement au périmètre du mémoire. Le contrat a été redéployé sous une nouvelle adresse ; le risque n'existe plus, par construction, sur le contrat actif.

Le séquestre reste géré entièrement hors-chaîne côté produit, sans changement (`backend/services/escrow.js`, modèle `ContractEscrow`).

Texte original de la décision conservé dans l'historique git de ce fichier.
