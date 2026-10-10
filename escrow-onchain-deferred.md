# Séquestre on-chain — legacy documenté, désactivation reportée

**Statut : décision prise, action reportée à une prochaine version. Rien à faire dans l'immédiat.**

## Constat

`ContractManager.sol` expose toujours trois fonctions de séquestre on-chain, pleinement actives sur le contrat déployé :

- `depositEscrow(uint256 contractId)` — dépôt de MATIC natif en séquestre
- `releaseEscrow(uint256 contractId)` — libération des fonds
- `applyPenalty(uint256 contractId)` — application d'une pénalité

Le produit réel **ne les appelle plus jamais**. Le séquestre est passé entièrement hors-chaîne, en FCFA (voir `backend/services/escrow.js` et le commentaire du modèle `ContractEscrow` dans `backend/prisma/schema.prisma`) — la cible de la plateforme n'est pas censée gérer un portefeuille crypto, et un montant fiat détenu plusieurs semaines ne doit pas dériver en valeur face à un token volatil.

## Le risque, tel qu'il est aujourd'hui

Ces trois fonctions restent appelables directement par n'importe quel `onlyParticipant` d'un contrat actif — via Polygonscan, un script, ou un ancien tutoriel obsolète — en dehors de toute interface Cachetify. Concrètement : un participant pourrait envoyer de vrais MATIC dans `depositEscrow` sans que ni l'app ni le support n'en aient connaissance ou ne sachent y répondre. Le risque est jugé **faible** (il faut le vouloir, ou suivre une documentation périmée) mais **réel**.

## Décision

- **Ne pas désactiver ni retirer ces fonctions maintenant.** Ça exigerait un nouveau déploiement du contrat (`whenNotPaused` seul ne suffit pas — il faudrait un flag de désactivation dédié, donc une modification de logique, pas juste un paramètre), et ce n'est pas la priorité de cette version.
- **Traiter le sujet dans une prochaine version du contrat**, quand le séquestre on-chain sera soit réellement intégré au produit, soit formellement retiré du code.
- **En attendant** : ce document sert de trace explicite de la décision et du risque accepté, pour qu'aucune ambiguïté ne subsiste sur "est-ce oublié ou choisi ?" — c'est choisi, en connaissance de cause.

## Quand ce sujet sera repris

À évaluer à ce moment-là, deux directions possibles :
1. **Retirer** ces fonctions dans un nouveau contrat (la version la plus simple, si le séquestre reste fiat à long terme).
2. **Les intégrer réellement** au produit (un vrai second mode "séquestre crypto natif", si la demande le justifie un jour) — auquel cas elles ont déjà l'essentiel de la logique nécessaire.

Origine du constat : `audit-cachetify-justedev-v6-complet.md`, module « Smart contracts — dérive entre le code et le produit réel ».
