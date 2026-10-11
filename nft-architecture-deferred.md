# Architecture des certificats NFT — résolu (NFT retiré du contrat)

**Statut : résolu.** Le certificat NFT (`ContractNFT.sol`, mint automatique à la finalisation via `ContractManager._mintContractNFT`) a été entièrement **retiré** lors de la simplification du smart contract pour correspondre exactement au périmètre du mémoire — le mémoire ne décrit aucun certificat NFT parmi les informations écrites sur la blockchain (empreinte SHA-256, référence de stockage, adresses des signataires, date de signature uniquement). `ContractNFT.sol` a été supprimé, ainsi que l'interface `IContractNFT`, `nftTokenId` et tout le code associé (routes/contrôleur publics de métadonnées, composants `NFTViewer`/`NFTCard`/`NFTGallery`).

Les décisions de design documentées ici (ERC-5192, NFT unique par contrat plutôt qu'un par signataire) restent exactes comme trace historique de ce qui avait été construit, mais ne s'appliquent plus à du code existant.

Texte original (pistes 1/2, discussion détaillée) conservé dans l'historique git de ce fichier.
