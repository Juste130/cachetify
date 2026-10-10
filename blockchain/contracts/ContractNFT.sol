// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @dev EIP-5192 (Minimal Soulbound NFTs) — https://eips.ethereum.org/EIPS/eip-5192. Standardizes
 * the signal that _beforeTokenTransfer below already enforces by reverting: wallets and block
 * explorers that recognize this interface (id 0xb45a3c0e) can show "non-transferable" upfront
 * instead of a user only discovering it when a transfer attempt fails.
 */
interface IERC5192 {
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);
    function locked(uint256 tokenId) external view returns (bool);
}

/**
 * @title ContractNFT
 * @dev NFT optimisé pour polygon - Preuves de contracts signés
 * @author Sènami Juste HOUEZO <houezojuste0@gmail.com>
 */
contract ContractNFT is ERC721, Ownable, ReentrancyGuard, IERC5192 {
    uint256 private _tokenIdCounter;

    struct ContractProof {
        string ipfsHash;
        uint40 timestamp;
        bool isActive;
    }
    mapping(uint256 => ContractProof) private contractProofs;
    mapping(string  => bool) private ipfsHashExists;
    mapping(uint256 => address[]) private contractSigners;

    // tokenURI() used to point straight at ipfs://<contractProofs[tokenId].ipfsHash> — the
    // document itself, not ERC-721 metadata. No wallet, marketplace or block explorer can
    // render a PDF/text file as an NFT, so the token never showed anything. tokenURI() now
    // points at an off-chain metadata endpoint instead, which returns a proper
    // {name, description, image, attributes} JSON and generates a certificate image — while
    // the document's own IPFS hash (and its proof value) is untouched, still readable via
    // getContractProof() and still the value verified against the contract's sha256Hash.
    //
    // metadataAdmin is deliberately separate from owner() — owner() becomes the
    // ContractManager contract once ownership is transferred (see deploy script), which has
    // no function that relays an arbitrary admin call here. Without a separate admin, the
    // base URI could only ever be set once, in the constructor, with no way to fix a typo or
    // follow a domain change without a full redeploy.
    address public metadataAdmin;
    string private _baseTokenURI;

    event ContractNFTMinted(
        uint256 indexed tokenId,
        string ipfsHash,
        address[] signers
    );
    event ContractProofStatusUpdated(uint256 indexed tokenId, bool isActive);
    event BaseTokenURIUpdated(string newBaseTokenURI);
    event MetadataAdminUpdated(address indexed newAdmin);

    modifier onlyMetadataAdmin() {
        require(msg.sender == metadataAdmin, "ContractNFT: caller is not the metadata admin");
        _;
    }

    constructor(string memory baseTokenURI_) ERC721("ContractNFTProof", "CNFTP") {
        metadataAdmin = msg.sender;
        _baseTokenURI = baseTokenURI_;
    }

    /**
     * @dev Repoints tokenURI() at a new metadata backend — e.g. after a domain change —
     * without requiring a redeploy of this contract.
     * @param newBaseTokenURI Full prefix metadata requests are built from, expected to end in
     * a trailing slash (e.g. "https://api.cachetify.io/api/nft/") so that appending the
     * token id alone yields a valid URL.
     */
    function setBaseTokenURI(string calldata newBaseTokenURI) external onlyMetadataAdmin {
        _baseTokenURI = newBaseTokenURI;
        emit BaseTokenURIUpdated(newBaseTokenURI);
    }

    /**
     * @dev Hands off the metadata admin role, e.g. from a deployer EOA to a multisig.
     */
    function setMetadataAdmin(address newAdmin) external onlyMetadataAdmin {
        require(newAdmin != address(0), "ContractNFT: zero address");
        metadataAdmin = newAdmin;
        emit MetadataAdminUpdated(newAdmin);
    }

    /**
     * @dev Mint a new Contract NFT
     * @param to The address to mint the NFT to
     * @param ipfsHash The IPFS hash of the contract proof
     * @param signers The addresses of the signers
     */
    function mintContractNFT(address to, string calldata ipfsHash, address[] calldata signers) external onlyOwner returns (uint256) {
        require(!ipfsHashExists[ipfsHash], "Contract already exists");
        require(signers.length > 0 && signers.length <= 255, "Invalid signers count");
        ipfsHashExists[ipfsHash] = true;
        _tokenIdCounter++;
        uint256 newtokenId = _tokenIdCounter;
        _safeMint(to, newtokenId);
        contractProofs[newtokenId] = ContractProof({
            ipfsHash: ipfsHash, 
            timestamp: uint40(block.timestamp), 
            isActive: true
        });
        contractSigners[newtokenId] = signers;
        emit ContractNFTMinted(newtokenId, ipfsHash, signers);
        emit Locked(newtokenId);
        return newtokenId;
    }

    /**
     * @dev EIP-5192: every token minted here is soulbound from the moment it exists — there is
     * no unlock path, matching the hard revert in _beforeTokenTransfer below.
     */
    function locked(uint256 tokenId) external view override returns (bool) {
        require(_exists(tokenId), "Token does not exist");
        return true;
    }
    /**
     * @dev Get the details of a Contract NFT
     * @param tokenId The ID of the token
     * @return ipfsHash The IPFS hash of the contract proof
     * @return timestamp The timestamp when the NFT was minted
     * @return isActive Whether the contract proof is active
     * @return signers The addresses of the signers
     */
    function getContractProof(uint256 tokenId) external view returns (string memory ipfsHash, uint256 timestamp, bool isActive, address[] memory signers) {
        require(_exists(tokenId), "Token does not exist");
        ContractProof memory proof = contractProofs[tokenId];
        return (proof.ipfsHash, proof.timestamp, proof.isActive, contractSigners[tokenId]);
    }

    /**
     * @dev Keeps the on-chain proof honest once the underlying contract leaves the Active
     * state (terminated, disputed, or completed via escrow release/penalty) — without this,
     * isActive stayed permanently true from mint onward. Restricted to the owner (ContractManager),
     * the same authority that mints the proof in the first place.
     * @param tokenId The ID of the token
     * @param active The contract's current in-force state
     */
    function updateProofStatus(uint256 tokenId, bool active) external onlyOwner {
        require(_exists(tokenId), "Token does not exist");
        contractProofs[tokenId].isActive = active;
        emit ContractProofStatusUpdated(tokenId, active);
    }

    /**
     * @dev This proof is bound to whoever actually signed the contract — a transfer would let
     * the NFT change hands independently of who is legally party to the underlying document,
     * so every transfer other than the initial mint is rejected.
     */
    function _beforeTokenTransfer(address from, address to, uint256 tokenId, uint256 batchSize) internal virtual override {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
        require(from == address(0), "ContractNFT: proof is non-transferable");
    }

    /**
     * @dev Points to the off-chain metadata endpoint for this token (see the comment above
     * _baseTokenURI). The underlying document's own IPFS hash is unaffected — it stays
     * available via getContractProof() and is what the metadata endpoint links back to.
     * @param tokenId The ID of the token
     * @return The token URI
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "ERC721Metadata: URI query for nonexistent token");
        return string(abi.encodePacked(_baseTokenURI, Strings.toString(tokenId)));
    }

    /**
     * @dev Advertises IERC5192 (id 0xb45a3c0e) alongside the ERC721/ERC165 interfaces ERC721
     * already reports, so a wallet or explorer can detect soulbound-ness without guessing.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IERC5192).interfaceId || super.supportsInterface(interfaceId);
    }
}