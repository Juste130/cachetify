// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ContractManager
 * @dev Enregistrement et signature de contrats. Seules les informations suivantes sont
 * écrites sur la chaîne : l'empreinte SHA-256 du document, sa référence de stockage, les
 * adresses des signataires et la date de chaque signature (voir mémoire, chapitre 2,
 * section Architecture). Inclut une pause d'urgence plateforme (chapitre 3).
 * @author Sènami Juste HOUEZO <houezojuste0@gmail.com>
 */
contract ContractManager is Ownable {
    uint256 private _contractIds;
    address public emergencyAdmin;
    uint8 private _authorizedPauserCount;

    // Pause d'urgence — voir addAuthorizedPauser/removeAuthorizedPauser plus bas pour les
    // règles d'autorisation, et emergencyPause/resumeContract pour leur usage.
    bool public paused;
    uint40 public pausedAt;
    uint40 public constant MAX_PAUSE_DURATION = 30 days;
    uint8 public constant MAX_PAUSERS = 3;

    enum ContractStatus { PendingSignatures, Active }
    enum SignerRole { Creator, CoSigner, Witness, LegalRepresentative, Other }

    struct SignerInfo {
        address signer;
        SignerRole role;
        string customRole; // Si "Other" est sélectionné
        bool hasSignedContract;
        uint40 signedAt;
    }

    struct ContractData {
        uint256 id;
        address creator;
        uint40 createdAt;
        uint40 expiresAt;
        uint40 effectiveDate;
        ContractStatus status;
        string sha256Hash;
    }

    mapping(uint256 => ContractData) public contracts;
    mapping(uint256 => string) public contractIpfsHashes; // contractId => référence de stockage
    mapping(uint256 => SignerInfo[]) public contractSigners;
    mapping(uint256 => mapping(address => bool)) public signatures;
    mapping(address => uint256[]) public userContracts;
    mapping(string => bool) public ipfsHashUsed;
    mapping(address => bool) public authorizedPausers;

    event ContractCreated(
        uint256 indexed contractId,
        address indexed creator,
        uint40 createdAt,
        address[] additionalSigners
    );
    event ContractSigned(
        uint256 indexed contractId,
        address indexed signer,
        SignerRole role
    );
    event ContractFinalized(
        uint256 indexed contractId,
        uint40 effectiveDate
    );
    event ContractPaused(
        address indexed pauser,
        string reason,
        uint40 timestamp
    );
    event ContractResumed(
        address indexed resumer,
        string reason,
        uint40 timestamp
    );
    event EmergencyAdminUpdated(
        address indexed oldAdmin,
        address indexed newAdmin
    );
    event PauserAuthorizationUpdated(
        address indexed pauser,
        bool authorized
    );
    event ForceResumeExecuted(
        address indexed executor,
        string reason
    );

    modifier validContractId(uint256 contractId) {
        require(contractId > 0 && contractId <= _contractIds, "Invalid contract ID");
        _;
    }
    modifier onlyParticipant(uint256 contractId) {
        require(_isContractParticipant(contractId, msg.sender), "Not a participant");
        _;
    }
    modifier validReason(string calldata reason) {
        require(bytes(reason).length > 0 && bytes(reason).length <= 200, "Invalid reason length: 1-200 chars");
        _;
    }
    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    modifier whenPaused() {
        require(paused, "Contract is not paused");
        _;
    }

    modifier onlyAuthorizedPauser() {
        require(
            msg.sender == owner() ||
            msg.sender == emergencyAdmin ||
            authorizedPausers[msg.sender],
            "Not authorized to pause"
        );
        _;
    }

    modifier onlyOwnerOrEmergencyAdmin() {
        require(
            msg.sender == owner() ||
            msg.sender == emergencyAdmin,
            "Not authorized for this action"
        );
        _;
    }

    constructor() Ownable() {
        // Configuration initiale de sécurité
        emergencyAdmin = msg.sender; // Par défaut, le déployeur est emergencyAdmin
        paused = false;
    }

    /**
     * @dev Crée un nouveau contrat avec rôles des signataires
     * @param ipfsHash Référence de stockage du document de contrat
     * @param sha256Hash Hash SHA256 du document (preuve d'intégrité)
     * @param signersWithRoles Tableau des signataires avec leurs rôles
     * @param expiresAt Date d'expiration du contrat
     */
    function createContract(
        string calldata ipfsHash,
        string calldata sha256Hash,
        SignerInfo[] calldata signersWithRoles,
        uint40 expiresAt
    ) external whenNotPaused returns (uint256) {
        require(!ipfsHashUsed[ipfsHash], "IPFS hash already used");
        require(expiresAt > uint40(block.timestamp), "Invalid expiration time");
        require(signersWithRoles.length <= 50, "Too many signers"); // Limite raisonnable

        _contractIds++;
        uint256 newContractId = _contractIds;

        ContractData storage newContract = contracts[newContractId];
        newContract.id = newContractId;
        newContract.creator = msg.sender;
        newContract.createdAt = uint40(block.timestamp);
        newContract.expiresAt = expiresAt;
        newContract.status = ContractStatus.PendingSignatures;
        newContract.sha256Hash = sha256Hash;

        contractIpfsHashes[newContractId] = ipfsHash;
        ipfsHashUsed[ipfsHash] = true;

        // Ajout du créateur comme premier signataire
        contractSigners[newContractId].push(SignerInfo({
            signer: msg.sender,
            role: SignerRole.Creator,
            customRole: "",
            hasSignedContract: true,
            signedAt: uint40(block.timestamp)
        }));

        signatures[newContractId][msg.sender] = true;
        _addUserContract(msg.sender, newContractId);

        // Ajout des signataires additionnels avec leurs rôles
        address[] memory additionalSigners = new address[](signersWithRoles.length);
        for (uint256 i = 0; i < signersWithRoles.length; i++) {
            require(signersWithRoles[i].signer != msg.sender, "Creator cannot be additional signer");
            require(signersWithRoles[i].signer != address(0), "Invalid signer address");

            contractSigners[newContractId].push(SignerInfo({
                signer: signersWithRoles[i].signer,
                role: signersWithRoles[i].role,
                customRole: signersWithRoles[i].customRole,
                hasSignedContract: false,
                signedAt: 0
            }));

            additionalSigners[i] = signersWithRoles[i].signer;
            _addUserContract(signersWithRoles[i].signer, newContractId);
        }

        emit ContractCreated(newContractId, msg.sender, expiresAt, additionalSigners);
        emit ContractSigned(newContractId, msg.sender, SignerRole.Creator);

        // Finalisation immédiate si aucun signataire additionnel
        if (signersWithRoles.length == 0) {
            _finalizeContract(newContractId);
        }

        return newContractId;
    }

    /**
     * @dev Signature d'un contrat par un participant.
     */
    function signContract(uint256 contractId)
        external
        whenNotPaused
        validContractId(contractId)
        onlyParticipant(contractId)
    {
        ContractData storage contractData = contracts[contractId];
        require(contractData.status == ContractStatus.PendingSignatures, "Invalid status");
        require(uint40(block.timestamp) <= contractData.expiresAt, "Contract expired");
        require(!signatures[contractId][msg.sender], "Already signed");

        signatures[contractId][msg.sender] = true;

        // Mise à jour du statut de signature avec timestamp
        SignerInfo[] storage signers = contractSigners[contractId];
        for (uint256 i = 0; i < signers.length; i++) {
            if (signers[i].signer == msg.sender) {
                signers[i].hasSignedContract = true;
                signers[i].signedAt = uint40(block.timestamp);
                emit ContractSigned(contractId, msg.sender, signers[i].role);
                break;
            }
        }

        if (_allSignaturesCollected(contractId)) {
            _finalizeContract(contractId);
        }
    }

    /**
     * @dev Finalisation automatique du contrat une fois toutes les signatures collectées.
     */
    function _finalizeContract(uint256 contractId) internal {
        ContractData storage contractData = contracts[contractId];
        contractData.status = ContractStatus.Active;
        contractData.effectiveDate = uint40(block.timestamp);

        emit ContractFinalized(contractId, contractData.effectiveDate);
    }

    /**
     * @dev Vérifie si toutes les signatures sont collectées
     */
    function _allSignaturesCollected(uint256 contractId) internal view returns (bool) {
        SignerInfo[] storage signers = contractSigners[contractId];

        for (uint256 i = 0; i < signers.length; i++) {
            if (!signers[i].hasSignedContract) {
                return false;
            }
        }
        return true;
    }

    /**
     * @dev Vérifie si l'adresse est un participant
     */
    function _isContractParticipant(uint256 contractId, address user) internal view returns (bool) {
        SignerInfo[] storage signers = contractSigners[contractId];

        for (uint256 i = 0; i < signers.length; i++) {
            if (signers[i].signer == user) {
                return true;
            }
        }
        return false;
    }

    /**
     * @dev Ajout d'un contrat à la liste des utilisateurs
     */
    function _addUserContract(address user, uint256 contractId) internal {
        userContracts[user].push(contractId);
    }

    // ==================== FONCTIONS DE LECTURE ====================

    function getContractDetails(uint256 contractId)
        external
        view
        validContractId(contractId)
        returns (
            ContractData memory contractData,
            SignerInfo[] memory signers,
            bool allSigned
        )
    {
        contractData = contracts[contractId];
        signers = contractSigners[contractId];
        allSigned = _allSignaturesCollected(contractId);
    }

    function getUserContracts(address user) external view returns (uint256[] memory) {
        return userContracts[user];
    }

    /**
     * @dev Récupère les détails des signataires avec leurs rôles
     */
    function getContractSignersWithRoles(uint256 contractId)
        external
        view
        validContractId(contractId)
        returns (SignerInfo[] memory)
    {
        return contractSigners[contractId];
    }

    function hasSigned(uint256 contractId, address signer)
        external
        view
        validContractId(contractId)
        returns (bool)
    {
        return signatures[contractId][signer];
    }

    function getTotalContracts() external view returns (uint256) {
        return _contractIds;
    }

    // ==================== FONCTIONS DE PAUSE ====================
    /**
     * @dev Pause d'urgence avec raison détaillée
     * @param reason Justification transparente de la pause
     */
    function emergencyPause(string calldata reason)
        external
        onlyAuthorizedPauser
        whenNotPaused
        validReason(reason)
    {
        paused = true;
        pausedAt = uint40(block.timestamp);

        emit ContractPaused(msg.sender, reason, pausedAt);
    }
    /**
     * @dev Reprise du contrat après résolution
     * @param reason Explication de la reprise
     */
    function resumeContract(string calldata reason)
        external
        onlyOwnerOrEmergencyAdmin
        whenPaused
        validReason(reason)
    {
        // Empêche un owner malveillant de mettre en pause puis de reprendre aussitôt pour
        // gêner les utilisateurs par a-coups — l'emergencyAdmin reste exempté de ce délai
        // minimum pour pouvoir réagir vite à un vrai incident.
        require(
            block.timestamp >= pausedAt + 1 hours ||
            msg.sender == emergencyAdmin,
            "Minimum pause duration not reached (1 hour)"
        );

        paused = false;

        emit ContractResumed(msg.sender, reason, uint40(block.timestamp));
    }
    /**
     * @dev Reprise forcée après durée maximale - ANTI-CENSURE
     * N'importe qui peut appeler après la durée maximale de pause
     */
    function forceResume() external whenPaused {
        require(
            block.timestamp > pausedAt + MAX_PAUSE_DURATION,
            "Max pause duration not reached"
        );

        paused = false;

        emit ForceResumeExecuted(
            msg.sender,
            "Community force resume after max pause duration"
        );
    }

    /**
     * @dev Mise à jour de l'emergency admin - DOUBLE CONTRÔLE
     * @param newAdmin Nouvel administrateur d'urgence
     */
    function setEmergencyAdmin(address newAdmin) external onlyOwner {
        require(newAdmin != address(0), "Invalid address");
        require(newAdmin != owner(), "Cannot be same as owner");
        require(newAdmin != emergencyAdmin, "Already set to this address");

        address oldAdmin = emergencyAdmin;
        emergencyAdmin = newAdmin;

        emit EmergencyAdminUpdated(oldAdmin, newAdmin);
    }
    /**
     * @dev Ajout d'un pauser autorisé - LIMITÉ À 3
     * @param pauser Adresse à autoriser
     */
    function addAuthorizedPauser(address pauser) external onlyOwner {
        require(pauser != address(0), "Invalid address");
        require(!authorizedPausers[pauser], "Already authorized");
        require(pauser != owner() && pauser != emergencyAdmin, "Cannot add owner/emergencyAdmin as pauser");

        // Plafonné volontairement bas — chaque pauser supplémentaire est un compte de plus
        // capable de geler toute la plateforme, pas une fonctionnalité à distribuer largement.
        require(_authorizedPauserCount < MAX_PAUSERS, "Maximum pausers reached");

        authorizedPausers[pauser] = true;
        _authorizedPauserCount++;
        emit PauserAuthorizationUpdated(pauser, true);
    }

    /**
     * @dev Révocation immédiate d'un pauser
     */
    function revokePauser(address pauser) external onlyOwner {
        require(authorizedPausers[pauser], "Not an authorized pauser");

        authorizedPausers[pauser] = false;
        _authorizedPauserCount--;
        emit PauserAuthorizationUpdated(pauser, false);
    }

    /**
     * @dev Désactive renounceOwnership() : un appel accidentel figerait owner() à address(0)
     * et rendrait setEmergencyAdmin/addAuthorizedPauser/revokePauser définitivement inutilisables.
     */
    function renounceOwnership() public view override onlyOwner {
        revert("ContractManager: renounceOwnership disabled");
    }

}
