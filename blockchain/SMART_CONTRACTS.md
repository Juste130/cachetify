# Résumé du Smart Contract — Cachetify

Ce document explique, en français simple, ce que fait chaque fonction de l'unique smart
contract du projet : **ContractManager**. Il tourne sur Polygon et ne fait que ce que le
mémoire décrit : enregistrer un contrat (empreinte SHA-256, référence de stockage, liste des
signataires), collecter les signatures, et permettre une pause d'urgence de la plateforme.
Aucune autre fonctionnalité (séquestre, litige, résiliation, paiement, certificat NFT) n'est
implémentée ici — ces sujets sont hors périmètre du mémoire et gérés, quand ils existent côté
application, entièrement hors-chaîne et masqués par des drapeaux de fonctionnalité.

---

## 1. Cycle de vie d'un contrat

```
PendingSignatures (créé, en attente des signatures)
  → Active (toutes les signatures collectées)
```

Statuts possibles (`enum ContractStatus`) : `PendingSignatures, Active`.

---

## 2. Constantes et règles globales

| Règle | Valeur |
|---|---|
| Nombre max de signataires par contrat | 50 |
| Longueur d'une raison de pause/reprise | entre 1 et 200 caractères |
| Durée min. d'une pause avant reprise normale | 1 heure |
| Durée max. d'une pause avant qu'elle soit "cassable" par n'importe qui | 30 jours |
| Nombre max de "pausers" autorisés (en plus du owner/emergencyAdmin) | 3 |

## 3. Création et signature du contrat

### `createContract(ipfsHash, sha256Hash, signersWithRoles, expiresAt)`
**Qui peut l'appeler :** n'importe qui (le créateur devient automatiquement premier signataire).
**Paramètres :**
- `ipfsHash` : référence de stockage du document (doit être **unique**, jamais utilisée avant).
- `sha256Hash` : hash SHA256 du document, pour preuve d'intégrité.
- `signersWithRoles` : liste des signataires additionnels (adresse + rôle + rôle personnalisé si "Other"). Max 50, aucun ne peut être le créateur, aucune adresse `0x0`.
- `expiresAt` : date d'expiration, doit être **dans le futur**.

**Ce qu'il se passe :**
1. Le créateur est ajouté comme signataire (rôle `Creator`) et signe automatiquement.
2. Chaque signataire additionnel est ajouté avec `hasSignedContract = false`.
3. Événements émis : `ContractCreated`, `ContractSigned` (pour le créateur).
4. **Cas particulier :** si aucun signataire additionnel n'est fourni, le contrat est finalisé immédiatement (voir `_finalizeContract`).

### `signContract(contractId)`
**Qui peut l'appeler :** uniquement un participant du contrat (créateur ou signataire déclaré).
**Contraintes :** le contrat doit être en statut `PendingSignatures` ; ne doit pas être expiré ; l'appelant ne doit pas avoir déjà signé.
**Ce qu'il se passe :** la signature est enregistrée avec l'horodatage. Si c'est la **dernière** signature manquante, le contrat passe automatiquement en `Active` (`_finalizeContract`).

### Fonctions internes
- `_finalizeContract` : passe le contrat en `Active` et fixe `effectiveDate`.
- `_allSignaturesCollected`, `_isContractParticipant`, `_addUserContract` : fonctions utilitaires internes.

## 4. Fonctions de lecture (gratuites)

| Fonction | Retourne |
|---|---|
| `getContractDetails(contractId)` | Les données du contrat + liste des signataires + `allSigned` |
| `getUserContracts(address)` | Liste des IDs de contrats liés à une adresse (créateur ou signataire) |
| `getContractSignersWithRoles(contractId)` | Détail des signataires avec rôles |
| `hasSigned(contractId, address)` | `true`/`false` |
| `getTotalContracts()` | Compteur global |

## 5. Pause d'urgence et administration

### `emergencyPause(reason)`
**Qui peut l'appeler :** `owner`, `emergencyAdmin`, ou une adresse dans `authorizedPausers` (max 3).
**Effet :** bloque **toutes** les fonctions marquées `whenNotPaused` (création, signature).

### `resumeContract(reason)`
**Qui peut l'appeler :** `owner` ou `emergencyAdmin`.
**Contrainte anti-abus :** la pause doit durer au moins **1 heure** avant reprise, sauf si c'est `emergencyAdmin` qui reprend.

### `forceResume()` — mécanisme anti-censure
**Qui peut l'appeler :** **n'importe qui**, mais seulement après **30 jours** de pause ininterrompue. Empêche qu'un owner malveillant bloque le contrat indéfiniment.

### `setEmergencyAdmin(newAdmin)`
**Qui peut l'appeler :** `owner` uniquement. Adresse valide, différente de l'owner actuel et de l'admin actuel.

### `addAuthorizedPauser(pauser)` / `revokePauser(pauser)`
**Qui peut l'appeler :** `owner` uniquement. Max 3 pausers autorisés simultanément ; ne peut pas être owner/emergencyAdmin.

### `renounceOwnership()`
**Désactivée volontairement** — retourne toujours une erreur. Ça évite qu'un appel accidentel laisse le contrat sans owner, ce qui rendrait `setEmergencyAdmin`, `addAuthorizedPauser` et `revokePauser` définitivement inutilisables.

---

## 6. Points de vigilance à retenir

- **Un hash IPFS (référence de stockage) ne peut servir qu'une seule fois** — impossible de recréer un contrat avec le même document.
- **Toutes les dates utilisent `uint40`** (secondes depuis epoch) — suffisant jusqu'à l'an ~36 812, pas un problème pratique.
- **`forceResume` est volontairement ouvert à tous** après 30 jours de pause : c'est une protection anti-censure, pas un bug.
- **Pas d'appel externe dans ce contrat** (plus de mint NFT, plus de transfert de fonds) : `ReentrancyGuard` a été retiré, il ne protégeait plus rien.
