const express = require('express');
const router = express.Router();
const nftController = require('../controllers/nft');

/**
 * Public by design — this is what ContractNFT.sol's tokenURI() resolves to on-chain, meant to
 * be crawled by wallets, marketplaces and block explorers that have no Cachetify session.
 * No auth middleware here on purpose.
 */

/**
 * @route   GET /api/nft/:tokenId/image.svg
 * @desc    Certificate visual for a minted contract proof NFT
 */
router.get('/:tokenId/image.svg', nftController.getImage);

/**
 * @route   GET /api/nft/:tokenId
 * @desc    ERC-721 metadata JSON for a minted contract proof NFT
 */
router.get('/:tokenId', nftController.getMetadata);

module.exports = router;
