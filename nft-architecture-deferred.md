# Architecture des certificats NFT — pistes documentées

**Statut : Piste 1 (ERC-5192) implémentée et testée en code, déploiement volontairement reporté. "Piste 2" telle que documentée initialement (un certificat par signataire) a été construite puis ANNULÉE — ce n'était pas le bon modèle, voir plus bas.**

## Constat

Chaque contrat finalisé mint un NFT ERC-721 unique via `_mintContractNFT()` (`ContractManager.sol`), rendu non-transférable par un `revert` dans `_beforeTokenTransfer` (`ContractNFT.sol`) et signalé comme tel via ERC-5192 (Piste 1). Ce certificat unique porte le hash du document et un lien vers l'historique du contrat.

Comparé à ce que le grand public entend par « NFT » (un objet collectionnable, transférable, dont la valeur ou l'usage repose sur la rareté et l'échange), l'écart a été jugé volontaire et cohérent avec la fonction réelle de l'objet : **l'identité on-chain d'un contrat, pas un actif spéculatif** — un contrat, un NFT, pas un NFT par personne.

## Déjà fait : le vocabulaire

Commit `fix(ui): renomme "NFT" en "Certificat"...` — `NFTCard.tsx`, `NFTViewer.tsx`, `NFTGallery.tsx` n'affichent plus le terme « NFT » ni « Propriétaire », remplacés par « Certificat » et « Créateur du contrat ». Toujours exact aujourd'hui : le NFT reste unique par contrat, minté au créateur.

## Piste 1 : ERC-5192 (Minimal Soulbound NFTs) — fait, déploiement en attente

Le contrat bloquait déjà les transferts par un simple `revert`, sans exposer de signal standard permettant à un wallet ou un explorateur (MetaMask, OpenSea, Polygonscan) de savoir *à l'avance* que le token est verrouillé.

[EIP-5192](https://eips.ethereum.org/EIPS/eip-5192) standardise ce signal : `locked(uint256 tokenId) external view returns (bool)` + événement `Locked(uint256 tokenId)` au mint. `ContractNFT.sol` implémente désormais l'interface `IERC5192` (déclarée inline, même pattern que `IContractNFT` dans `ContractManager.sol`) : `locked()` retourne toujours `true`, `Locked(tokenId)` est émis à chaque mint, `supportsInterface()` avertit l'id `0xb45a3c0e`. Le `_beforeTokenTransfer` existant reste le seul mécanisme d'application réel — `locked()` n'est qu'un signal déclaratif standardisé.

**Coût, non encore payé — déploiement volontairement reporté :** `contractNFT` est référencé dans `ContractManager` via une variable d'état fixée une seule fois au constructeur, sans setter — pointer `ContractManager` vers la nouvelle version de `ContractNFT` exige donc de redéployer les deux contrats ensemble (comme `deploy.ts` le fait), pas seulement `ContractNFT`. Ce redéploiement rendrait les contrats actuellement actifs sous les adresses en place aujourd'hui inaccessibles depuis l'app, exactement comme lors du redéploiement gas-optimization du 7 septembre. Décision explicite du porteur de projet : le code reste prêt, committé et testé, mais le déploiement se fera à sa demande plus tard.

## "Piste 2" — construite puis annulée : le bon modèle est un NFT UNIQUE, visible par tous les signataires

**Ce qui s'est passé :** une lecture initiale mal calibrée du problème ("un signataire qui n'est pas le créateur n'a aucun certificat à *lui*") a conduit à faire minter un token ERC-721 séparé par participant — un contrat à 3 signataires produisait 3 NFT distincts, chacun possédé par une adresse différente. Implémenté, testé (44/44), puis **entièrement annulé** (commits `eb3dc2c`/`8a249b5`, revert de `36e7e16`/`31d84c3`) une fois le porteur de projet a précisé son intention réelle :

> « pour un contrat, il y a un unique nft auquel les signataires sont associés et c'est ce nft qui est visible chez eux tous. »

Un NFT par contrat, pas un NFT par personne — le token représente l'identité du CONTRAT (comme énoncé dès la toute première critique NFT de cette conversation : « l'identité d'un contrat qui trace son historique sur la blockchain »), pas une preuve de participation individuelle à collectionner par chaque partie.

**Ce qui existe déjà et satisfait cette description, vérifié dans le code actuel :** le NFT reste unique (`ContractData.nftTokenId`, un seul par contrat), et sa fiche de preuve (`getNFTProof(contractId)`/`getContractProof(tokenId)`) est une fonction `view` interrogeable par n'importe qui, pas réservée au propriétaire. Côté app, `contract.metadata.nftTokenId` fait partie du cache (`ContractCache`) lu via `hasContractAccess` — vrai pour le créateur, **et pour chaque signataire, et pour un admin**. Résultat déjà vérifié : sur `contract-details-page.tsx`, chaque signataire qui ouvre le contrat voit exactement le même composant `NFTViewer`/`NFTCard`, pointant vers le même tokenId, affichant les mêmes données de preuve. C'est déjà "ce NFT visible chez eux tous," dans l'application.

**Tranché avec le porteur de projet :** "visible chez eux tous" veut dire visible dans l'app Cachetify — déjà vrai, vérifié ci-dessus, rien à construire. La visibilité dans le portefeuille externe de chaque signataire (MetaMask, etc.) aurait nécessité un passage à ERC-1155 (jeton semi-fongible : un même id, un solde par adresse) ; explicitement écartée pour l'instant.

## Décision

- **Piste 1 (ERC-5192) : code fait et testé, déploiement reporté à la demande explicite du porteur de projet.**
- **Le modèle "un certificat par signataire" est rejeté** — remplacé par la confirmation que le modèle "un NFT unique, visible par tous les signataires dans l'app" fonctionne déjà tel quel.
- **Tranché** : la visibilité dans l'app suffit. Pas de passage à ERC-1155, sujet clos.

Origine du constat : critique NFT/certificat menée sous les trois casquettes (génie logiciel, juridique, UI/UX) à la demande du porteur de projet, qui a confirmé la lecture du NFT comme « l'identité d'un contrat qui trace son historique sur la blockchain » plutôt que comme un actif spéculatif classique — précision reconfirmée et affinée après l'implémentation ratée de la Piste 2 initiale.
