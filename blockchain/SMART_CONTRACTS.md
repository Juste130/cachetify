# Résumé des Smart Contracts — Cachetify

Ce document explique, en français simple, ce que fait chaque fonction des deux smart contracts du projet : **ContractManager** (le cerveau : gère les contrats, signatures, escrow, litiges...) et **ContractNFT** (le certificat : mint un NFT de preuve quand un contrat est finalisé).

Les deux contrats tournent sur Polygon. `ContractManager` est **propriétaire** de `ContractNFT` (ownership transféré au déploiement) : lui seul peut demander la création d'un NFT.

---

## 1. Vue d'ensemble du cycle de vie d'un contrat

```
Draft (jamais utilisé en pratique)
  → PendingSignatures (créé, en attente des signatures)
      → Cancelled (annulé par le créateur avant toutes les signatures)
      → Active (toutes les signatures collectées → NFT créé automatiquement)
          → Completed (escrow libéré ou pénalité appliquée)
          → Terminated (résiliation, seulement si pas de fonds en escrow)
          → Disputed (litige ouvert)
```

Statuts possibles (`enum ContractStatus`) : `Draft, PendingSignatures, Active, Completed, Cancelled, Disputed, Terminated, Resigned`.

---

## 2. ContractManager

### 2.1 Constantes et règles globales à connaître

| Règle | Valeur |
|---|---|
| Nombre max de signataires par contrat | 50 |
| Longueur d'une justification | entre 1 et 200 caractères |
| Pénalité max | 100 % |
| Durée min. d'une pause avant reprise normale | 1 heure |
| Durée max. d'une pause avant qu'elle soit "cassable" par n'importe qui | 30 jours |
| Nombre max de "pausers" autorisés (en plus du owner/emergencyAdmin) | 3 |

### 2.2 Création et signature du contrat

#### `createContract(...)` — créer un nouveau contrat
**Qui peut l'appeler :** n'importe qui (le créateur devient automatiquement premier signataire).
**Paramètres obligatoires :**
- `ipfsHash` : hash IPFS du document (doit être **unique**, jamais utilisé avant).
- `sha256Hash` : hash SHA256 du document, pour preuve d'intégrité.
- `signersWithRoles` : liste des signataires additionnels (adresse + rôle + rôle personnalisé si "Other"). Max 50, aucun ne peut être le créateur, aucune adresse `0x0`.
- `expiresAt` : date d'expiration, doit être **dans le futur**.
- `allowTermination` / `allowDispute` : booléens qui activent ou non la résiliation / le litige plus tard.
- `escrowAmount` : montant total du contrat qui devra être déposé en séquestre (en wei).
- `penaltyPercent` : pourcentage de pénalité en cas de litige (0 à 100).
- `initialJustification` : texte de justification (1 à 200 caractères).

**Contraintes :** le contrat ne doit pas être en pause ; le hash IPFS ne doit pas déjà exister ; `expiresAt` dans le futur ; `penaltyPercent <= 100` ; max 50 signataires.

**Ce qu'il se passe :**
1. Le créateur est ajouté comme signataire (rôle `Creator`) et signe automatiquement.
2. Chaque signataire additionnel est ajouté avec `hasSignedContract = false`.
3. La justification initiale est enregistrée.
4. Événements émis : `ContractCreated`, `ContractSigned` (pour le créateur), `SignatureRequired` (pour chaque autre signataire).
5. **Cas particulier :** si aucun signataire additionnel n'est fourni, le contrat est finalisé immédiatement (voir `_finalizeContract`).

#### `signContract(contractId)` — signer un contrat
**Qui peut l'appeler :** uniquement un participant du contrat (créateur ou signataire déclaré).
**Contraintes :** le contrat doit être en statut `PendingSignatures` ; ne doit pas être expiré ; l'appelant ne doit pas avoir déjà signé.
**Ce qu'il se passe :** la signature est enregistrée avec l'horodatage. Si c'est la **dernière** signature manquante, le contrat passe automatiquement en `Active` et un NFT de preuve est créé (`_finalizeContract`).

#### `cancelContract(contractId, justification)` — annuler avant finalisation
**Qui peut l'appeler :** uniquement le créateur du contrat.
**Contraintes :** contrat non expiré ; statut encore `PendingSignatures` ; toutes les signatures ne doivent **pas** être déjà collectées (sinon il faut passer par résiliation/litige, pas annulation).
**Ce qu'il se passe :** statut → `Cancelled`, justification enregistrée, tous les participants notifiés.

### 2.3 Résiliation et litiges (après activation)

#### `terminateContract(contractId, reason, customReason, proofIpfsHash, justification)`
**Qui peut l'appeler :** un participant du contrat.
**Contraintes obligatoires :**
- `allowTermination` doit avoir été activé à la création.
- Le contrat doit être `Active`.
- **Aucun fonds ne doit être en escrow** (`isEscrowDeposited == false`) — il faut d'abord `releaseEscrow` ou `applyPenalty`.
- `reason` ne peut pas être `None`.
- Contrat non expiré.

**Ce qu'il se passe :** statut → `Terminated`, infos de résiliation enregistrées (raison, preuve IPFS, justification), tous les participants notifiés.

#### `openDispute(contractId, reason, customReason, proofIpfsHash, justification)`
**Qui peut l'appeler :** un participant du contrat.
**Contraintes :** `allowDispute` doit avoir été activé à la création ; contrat `Active` ; `reason != None` ; contrat non expiré.
**Ce qu'il se passe :** statut → `Disputed`, infos du litige enregistrées. **Note :** un litige n'empêche pas ensuite d'appliquer une pénalité (`applyPenalty` accepte le statut `Disputed`).

### 2.4 Paiements (suivi hors-chaîne des jalons de paiement)

#### `addPayment(contractId, amount, currency, proofIpfsHash)`
**Qui peut l'appeler :** uniquement le créateur du contrat.
**Contraintes :** `amount > 0` et `amount <= uint88 max` (~309 sextillions).
**Ce qu'il se passe :** un nouveau paiement est créé avec le statut `Pending`. C'est un **suivi déclaratif**, ça ne transfère pas de fonds — l'escrow est le seul mécanisme qui déplace de l'argent réellement.

#### `updatePaymentStatus(contractId, paymentIndex, newStatus, justification)`
**Qui peut l'appeler :** uniquement le créateur du contrat.
**Contraintes :** `paymentIndex` doit exister.
**Ce qu'il se passe :** change le statut du paiement (`Pending, Approved, Completed, Blocked, Overdue, Refunded, Disputed`). Si le nouveau statut est `Completed`, le montant est ajouté à `releasedAmount` du contrat (compteur informatif).

### 2.5 Justifications (journal libre)

#### `addJustification(contractId, justification)`
**Qui peut l'appeler :** un participant du contrat.
**Contraintes :** texte entre 1 et 200 caractères.
**Ce qu'il se passe :** ajoute une entrée au journal des justifications du contrat (historique consultable via `getContractJustifications`).

### 2.6 Escrow — séquestre des fonds (⚠️ transferts d'argent réels)

Toutes ces fonctions sont protégées contre la ré-entrance (`nonReentrant`).

#### `depositEscrow(contractId)` *(payable)*
**Qui peut l'appeler :** un participant du contrat.
**Paramètre obligatoire :** `msg.value` (montant envoyé) doit être **exactement égal** à `escrowAmount` défini à la création.
**Contraintes :** contrat `Active` ; escrow pas déjà déposé.
**Ce qu'il se passe :** les fonds restent bloqués dans le contrat. L'appelant devient **`escrowPayer`** — c'est important : lui seul pourra ensuite libérer ou pénaliser ces fonds.

#### `releaseEscrow(contractId)`
**Qui peut l'appeler :** **uniquement** `escrowPayer` (celui qui a déposé les fonds), pas n'importe quel participant.
**Contraintes :** des fonds doivent être en escrow ; contrat `Active`.
**Ce qu'il se passe :** la totalité de l'`escrowAmount` est envoyée au **créateur** du contrat, le statut passe à `Completed`.

#### `applyPenalty(contractId)`
**Qui peut l'appeler :** **uniquement** `escrowPayer`.
**Contraintes :** des fonds doivent être en escrow ; contrat `Active` ou `Disputed`.
**Ce qu'il se passe :** le montant est divisé en deux :
- `penaltyPercent %` retourne au payeur (`escrowPayer`),
- le reste va au créateur.
Statut → `Completed`.

> **Point de sécurité important :** avant l'audit v4, n'importe quel participant pouvait libérer/pénaliser l'escrow. Maintenant seul celui qui a réellement déposé les fonds (`escrowPayer`) le peut — évite qu'un autre signataire détourne ou bloque les fonds de quelqu'un d'autre.

### 2.7 Fonctions internes (non appelables directement, déclenchées automatiquement)

- `_finalizeContract` : passe le contrat en `Active`, fixe `effectiveDate`, déclenche le mint du NFT via `_mintContractNFT`. Échoue si le contrat est expiré au moment de la finalisation.
- `_mintContractNFT` : appelle `ContractNFT.mintContractNFT` avec le créateur comme propriétaire, le hash IPFS et la liste de tous les signataires.
- `_allSignaturesCollected`, `_isContractParticipant`, `_addUserContract`, `_notifyAllParticipants`, `_getAllParticipants`, `_addJustification`, `_uintToString` : fonctions utilitaires internes.

### 2.8 Fonctions de lecture (gratuites, ne coûtent pas de gas si appelées hors transaction)

| Fonction | Retourne |
|---|---|
| `getContractDetails(contractId)` | Toutes les données du contrat + liste des signataires + `allSigned` + nombre de justifications/paiements |
| `getContractJustifications(contractId)` | Historique complet des justifications |
| `getContractPayments(contractId)` | Liste des paiements déclarés |
| `getUserContracts(address)` | Liste des IDs de contrats liés à une adresse (créateur ou signataire) |
| `getContractSignersWithRoles(contractId)` | Détail des signataires avec rôles |
| `getSignerRole(contractId, address)` | Rôle, statut de signature et date d'un signataire précis (revert si non trouvé) |
| `hasSigned(contractId, address)` | `true`/`false` |
| `getTotalContracts()` / `getTotalPayments()` | Compteurs globaux |
| `getNFTProof(contractId)` | Infos du NFT lié (hash IPFS, timestamp, actif, signataires) — revert si aucun NFT minté |

### 2.9 Pause d'urgence et administration

#### `emergencyPause(reason)`
**Qui peut l'appeler :** `owner`, `emergencyAdmin`, ou une adresse dans `authorizedPausers` (max 3).
**Contraintes :** contrat pas déjà en pause ; justification 1-200 caractères.
**Effet :** bloque **toutes** les fonctions marquées `whenNotPaused` (création, signature, escrow, litiges, etc.).

#### `resumeContract(reason)`
**Qui peut l'appeler :** `owner` ou `emergencyAdmin`.
**Contrainte anti-abus :** la pause doit durer au moins **1 heure** avant reprise, sauf si c'est `emergencyAdmin` qui reprend.

#### `forceResume()` — mécanisme anti-censure
**Qui peut l'appeler :** **n'importe qui**, mais seulement après **30 jours** de pause ininterrompue. Empêche qu'un owner malveillant bloque le contrat indéfiniment.

#### `setEmergencyAdmin(newAdmin)`
**Qui peut l'appeler :** `owner` uniquement.
**Contraintes :** adresse valide, différente de l'owner actuel et de l'admin actuel.

#### `addAuthorizedPauser(pauser)` / `revokePauser(pauser)`
**Qui peut l'appeler :** `owner` uniquement.
**Contraintes :** max 3 pausers autorisés simultanément ; ne peut pas être owner/emergencyAdmin.

#### `renounceOwnership()`
**Désactivée volontairement** — retourne toujours une erreur. Ça évite qu'un appel accidentel laisse le contrat sans owner, ce qui rendrait `setEmergencyAdmin`, `addAuthorizedPauser` et `revokePauser` définitivement inutilisables.

---

## 3. ContractNFT

Ce contrat est un simple ERC-721 dont **seul le owner (= ContractManager)** peut mint des tokens. C'est le "certificat" on-chain d'un contrat finalisé.

#### `mintContractNFT(to, ipfsHash, signers)`
**Qui peut l'appeler :** uniquement le `owner` (donc en pratique, uniquement `ContractManager`).
**Contraintes :** le `ipfsHash` ne doit pas déjà avoir été utilisé pour un autre NFT ; entre 1 et 255 signataires.
**Ce qu'il se passe :** mint un nouveau tokenId à l'adresse `to` (le créateur du contrat), enregistre le hash IPFS, l'horodatage et la liste des signataires.

#### `getContractProof(tokenId)`
**Retourne :** hash IPFS, timestamp de mint, `isActive` (toujours `true`, pas de mécanisme de désactivation actuellement), liste des signataires.
**Contrainte :** le token doit exister.

#### `tokenURI(tokenId)`
Retourne `ipfs://<hash>` — standard ERC-721 metadata, pointe directement vers le document sur IPFS.
**Contrainte :** le token doit exister.

---

## 4. Points de vigilance à retenir

- **`escrowPayer` est central** : seul celui qui a déposé les fonds peut les libérer ou déclencher la pénalité. Un autre signataire (même le créateur) ne peut pas y toucher.
- **`terminateContract` bloque si des fonds sont en escrow** : il faut d'abord `releaseEscrow` ou `applyPenalty`.
- **Un hash IPFS ne peut servir qu'une seule fois**, aussi bien côté `ContractManager` (par contrat) que côté `ContractNFT` (par mint) — impossible de recréer un contrat avec le même document.
- **Toutes les dates utilisent `uint40`** (secondes depuis epoch) — suffisant jusqu'à l'an ~36 812, pas un problème pratique.
- **Les montants (`escrowAmount`, `releasedAmount`) utilisent `uint88`** — largement suffisant pour des montants en wei sur Polygon, mais à garder en tête si jamais on manipule des très gros montages en dehors du wei.
- **`forceResume` est volontairement ouvert à tous** après 30 jours de pause : c'est une protection anti-censure, pas un bug.
