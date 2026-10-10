const { ethers } = require('ethers');
const prisma = require('../models/prisma');
const logger = require('../utils/logger');
const { config } = require('../config');
const { BadRequestError, NotFoundError } = require('../utils/errors');
const { renderCertificateSvg } = require('../utils/nftCertificateSvg');
const { formatReference } = require('../utils/contract-naming');

/**
 * This is what ContractNFT.sol's tokenURI() now points to on-chain (see the constructor
 * comment there) — hit by wallets, marketplaces and block explorers that have no Cachetify
 * session at all, so every route in this file is deliberately public: no auth middleware, no
 * assumption that the caller is a logged-in user.
 */
const CONTRACT_NFT_ABI = [
    'function getContractProof(uint256 tokenId) external view returns (string memory ipfsHash, uint256 timestamp, bool isActive, address[] memory signers)',
];

let _contractNft = null;

function getContractNft() {
    if (_contractNft) return _contractNft;
    if (!ethers.isAddress(config.contractNftAddress)) {
        logger.warn(`NFT metadata: invalid CONTRACT_NFT_ADDRESS (${config.contractNftAddress}) — endpoint disabled.`);
        return null;
    }
    const provider = new ethers.JsonRpcProvider(config.polygonRpcUrl);
    _contractNft = new ethers.Contract(config.contractNftAddress, CONTRACT_NFT_ABI, provider);
    return _contractNft;
}

function parseTokenId(raw) {
    if (!/^\d+$/.test(String(raw || ''))) return null;
    const n = Number(raw);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * The contract's human title (and its own on-chain contractId, a different id space from the
 * NFT's tokenId) live only in our DB, never on-chain — a lookup failure here must never break
 * the metadata/image response itself, only fall back to a generic name and no external link.
 */
async function findContractForToken(tokenId) {
    try {
        return await prisma.contractCache.findFirst({
            where: { metadata: { path: ['nftTokenId'], equals: String(tokenId) } },
            select: { contractId: true, id: true, title: true, reference: true },
        });
    } catch (err) {
        logger.warn(`NFT metadata: contract lookup failed for token ${tokenId}: ${err.message}`);
        return null;
    }
}

async function loadProof(tokenId) {
    const contractNft = getContractNft();
    if (!contractNft) throw new NotFoundError("Registre NFT indisponible pour le moment");
    try {
        return await contractNft.getContractProof(tokenId);
    } catch {
        throw new NotFoundError("Aucun certificat trouvé pour ce token");
    }
}

exports.getMetadata = async (req, res, next) => {
    try {
        const tokenId = parseTokenId(req.params.tokenId);
        if (!tokenId) throw new BadRequestError("Identifiant de token invalide");

        const [ipfsHash, timestamp, isActive, signers] = await loadProof(tokenId);
        const contractRow = await findContractForToken(tokenId);
        const mintedAtSeconds = Number(timestamp);
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const verifyId = contractRow?.contractId ?? contractRow?.id ?? null;

        res.json({
            name: contractRow?.title
                ? `Cachetify — ${contractRow.title} · ${formatReference(contractRow.reference)}`
                : `Cachetify — Certificat #${tokenId}`,
            description:
                "Preuve de signature horodatée et infalsifiable, ancrée sur le réseau Polygon. " +
                "Ce certificat atteste qu'un contrat a été finalisé par l'ensemble de ses signataires ; " +
                "il ne remplace pas les formalités légales éventuellement requises pour l'acte sous-jacent (voir le document source).",
            image: `${baseUrl}/api/nft/${tokenId}/image.svg`,
            external_url: verifyId ? `${config.frontendUrl}/verify/${verifyId}` : undefined,
            document: `ipfs://${ipfsHash}`,
            attributes: [
                { trait_type: 'Statut', value: isActive ? 'Actif' : 'Clos ou résilié' },
                { trait_type: 'Signataires', value: signers.length },
                { trait_type: 'Ancré le', display_type: 'date', value: mintedAtSeconds },
            ],
        });
    } catch (err) {
        next(err);
    }
};

exports.getImage = async (req, res, next) => {
    try {
        const tokenId = parseTokenId(req.params.tokenId);
        if (!tokenId) throw new BadRequestError("Identifiant de token invalide");

        const [ipfsHash, timestamp, isActive, signers] = await loadProof(tokenId);
        const contractRow = await findContractForToken(tokenId);

        const svg = renderCertificateSvg({
            tokenId,
            title: contractRow?.title,
            timestamp: Number(timestamp),
            isActive,
            signerCount: signers.length,
            ipfsHash,
        });

        res.set('Content-Type', 'image/svg+xml');
        res.set('Cache-Control', 'public, max-age=3600');
        res.send(svg);
    } catch (err) {
        next(err);
    }
};
