import { ethers } from 'ethers';

export const CONTRACT_MANAGER_ABI = [
    'function createContract(string ipfsHash, string sha256Hash, tuple(address signer, uint8 role, string customRole, bool hasSignedContract, uint40 signedAt)[] signersWithRoles, uint40 expiresAt) external returns (uint256)',
    'function signContract(uint256 contractId) external',
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
    'function getContractDetails(uint256 contractId) external view returns (tuple(uint256 id, address creator, uint40 createdAt, uint40 expiresAt, uint40 effectiveDate, uint8 status, string sha256Hash) contractData, tuple(address signer, uint8 role, string customRole, bool hasSignedContract, uint40 signedAt)[] signers, bool allSigned)',
    'event ContractCreated(uint256 indexed contractId, address indexed creator, uint40 createdAt, address[] additionalSigners)',
    'event ContractFinalized(uint256 indexed contractId, uint40 effectiveDate)',
    'event ContractPaused(address indexed pauser, string reason, uint40 timestamp)',
    'event ContractResumed(address indexed resumer, string reason, uint40 timestamp)'
];

export const getContractManager = (signerOrProvider: ethers.Signer | ethers.Provider) => {
    return new ethers.Contract(
        process.env.NEXT_PUBLIC_CONTRACT_MANAGER_ADDRESS || '',
        CONTRACT_MANAGER_ABI,
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
