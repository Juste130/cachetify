import { ethers } from 'ethers';

export const CONTRACT_MANAGER_ABI = [
    'function createContract(string ipfsHash, string sha256Hash, tuple(address signer, uint8 role, string customRole, bool hasSignedContract, uint40 signedAt)[] signersWithRoles, uint40 expiresAt, bool allowTermination, bool allowDispute, uint88 escrowAmount, uint8 penaltyPercent, string initialJustification) external returns (uint256)',
    'function depositEscrow(uint256 contractId) external payable',
    'function releaseEscrow(uint256 contractId) external',
    'function applyPenalty(uint256 contractId) external',
    'function signContract(uint256 contractId) external',
    // terminateContract() is a genuine terminal action (Active -> Terminated, requires no
    // funds in escrow) with no dead-end problem — unlike openDispute(), which has no exit
    // once the crypto escrow it depends on is never deposited (see contract-incidents.ts /
    // the dispute service for why disputes are handled off-chain instead).
    'function terminateContract(uint256 contractId, uint8 reason, string customReason, string proofIpfsHash, string justification) external',
    // Generic on-chain attestation, reused to anchor off-chain dispute/hold events (see
    // lib/api/incidents.ts) without depending on the dead-ended openDispute/escrow path.
    'function addJustification(uint256 contractId, string justification) external',
    // Platform-wide emergency pause — read state + trigger, gated on-chain by
    // onlyAuthorizedPauser/onlyOwnerOrEmergencyAdmin. The frontend only decides whether to
    // show the controls (ADMIN role); the real access control is enforced by the contract
    // itself, so an unauthorized wallet simply reverts.
    'function emergencyPause(string reason) external',
    'function resumeContract(string reason) external',
    'function paused() external view returns (bool)',
    'function pausedAt() external view returns (uint40)',
    'function owner() external view returns (address)',
    'function emergencyAdmin() external view returns (address)',
    'function getUserContracts(address user) external view returns (uint256[])',
    // Read-only NFT proof lookup — lets the UI show genuine on-chain data (mint timestamp,
    // active flag, signer addresses) instead of just re-displaying props the caller already
    // had, which made "Détails du NFT" feel like nothing more than another link to IPFS.
    'function getNFTProof(uint256 contractId) external view returns (string ipfsHash, uint256 timestamp, bool isActive, address[] signers)',
    'function getContractDetails(uint256 contractId) external view returns (tuple(uint256 id, address creator, uint40 createdAt, uint40 expiresAt, uint40 effectiveDate, uint8 status, bool allowTermination, bool allowDispute, tuple(uint8 reason, string customReason, string proofIpfsHash, tuple(string justification, uint40 timestamp, address updatedBy) justification) terminationInfo, tuple(uint8 reason, string customReason, string proofIpfsHash, tuple(string justification, uint40 timestamp, address updatedBy) justification) disputeInfo, uint88 escrowAmount, uint8 penaltyPercent, string sha256Hash, uint88 releasedAmount, uint256 nftTokenId, bool isEscrowDeposited, address escrowPayer) contractData, tuple(address signer, uint8 role, string customRole, bool hasSignedContract, uint40 signedAt)[] signers, bool allSigned, uint256 justificationCount, uint256 paymentCount)',
    'event ContractCreated(uint256 indexed contractId, address indexed creator, uint40 createdAt, address[] additionalSigners)',
    'event ContractFinalized(uint256 indexed contractId, uint256 nftTokenId, uint40 effectiveDate)',
    'event ContractStatusUpdated(uint256 indexed contractId, uint8 oldStatus, uint8 newStatus, string justification, address updatedBy)',
    'event ContractTerminated(uint256 indexed contractId, uint8 reason, string customReason, string proofIpfsHash, string justification, address updatedBy)',
    'event ContractPaused(address indexed pauser, string reason, uint40 timestamp)',
    'event ContractResumed(address indexed resumer, string reason, uint40 timestamp)'
];

export const CONTRACT_NFT_ABI = [
    'function ownerOf(uint256 tokenId) external view returns (address)',
    'function tokenURI(uint256 tokenId) external view returns (string)',
    'function getContractProof(uint256 tokenId) external view returns (string ipfsHash, uint256 timestamp, bool isActive, address[] signers)',
];

export const getContractManager = (signerOrProvider: ethers.Signer | ethers.Provider) => {
    return new ethers.Contract(
        process.env.NEXT_PUBLIC_CONTRACT_MANAGER_ADDRESS || '',
        CONTRACT_MANAGER_ABI,
        signerOrProvider
    );
};

export const getContractNFT = (signerOrProvider: ethers.Signer | ethers.Provider) => {
    return new ethers.Contract(
        process.env.NEXT_PUBLIC_CONTRACT_NFT_ADDRESS || '',
        CONTRACT_NFT_ABI,
        signerOrProvider
    );
};

// Fournisseur en lecture seule, sans portefeuille connecté : c'est ce que la page publique de
// vérification (/verify/[token]) utilise pour relire l'empreinte et les signatures
// directement sur la blockchain depuis le navigateur, sans passer par notre serveur — voir
// mémoire, chapitre 3. N'importe qui peut faire de même avec le RPC public et l'identifiant
// du contrat, sans dépendre de ce site.
export const getReadOnlyProvider = () => {
    const rpcUrl = process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://rpc-amoy.polygon.technology';
    return new ethers.JsonRpcProvider(rpcUrl);
};
