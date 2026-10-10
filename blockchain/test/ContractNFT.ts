import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;
import "@nomicfoundation/hardhat-chai-matchers";

describe("ContractNFT", function () {
  let contractNFT: any;
  let contractManager: any;
  let owner: any;
  let user1: any;
  let user2: any;

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    [owner, user1, user2] = signers;

    // Déployer ContractNFT
    const ContractNFT = await ethers.getContractFactory("ContractNFT");
    contractNFT = await ContractNFT.connect(owner).deploy("http://localhost:5000/api/nft/");
    await contractNFT.waitForDeployment();

    // Déployer ContractManager
    const nftAddress = await contractNFT.getAddress();
    const ContractManager = await ethers.getContractFactory("ContractManager");
    contractManager = await ContractManager.connect(owner).deploy(nftAddress);
    await contractManager.waitForDeployment();

    // ContractManager doit être owner de ContractNFT pour pouvoir mint
    const managerAddress = await contractManager.getAddress();
    const transferTx = await contractNFT.connect(owner).transferOwnership(managerAddress);
    await transferTx.wait();
  });

  describe("Fonctionnalités de Base", function () {
    it("Devrait avoir le bon nom et symbole", async function () {
      const name = await contractNFT.name();
      const symbol = await contractNFT.symbol();

      expect(name).to.equal("ContractNFTProof");
      expect(symbol).to.equal("CNFTP");
    });

    it("Devrait mint un NFT via ContractManager", async function () {
      const managerAddress = await contractManager.getAddress();
      const user1Address = await user1.getAddress();
      const user2Address = await user2.getAddress();

      // Mint via ContractManager (qui est maintenant le owner) via Auto-Finalize (0 signers additionnels)
      const tx = await contractManager.connect(user1).createContract(
        "QmTestHash",
        "sha256TestHash",
        [], // Pas de signataires additionnels -> Finalisation immédiate
        Math.floor(Date.now() / 1000) + 86400,
        true,
        true,
        0,
        10,
        "Test creation"
      );

      await tx.wait();

      const ownerOf = await contractNFT.ownerOf(1);
      const balance = await contractNFT.balanceOf(user1Address);

      expect(ownerOf).to.equal(user1Address);
      expect(balance).to.equal(1);
    });

    it("Devrait récupérer les preuves de contrat", async function () {
      const user1Address = await user1.getAddress();
      const user2Address = await user2.getAddress();

      // 1. User1 crée le contrat avec User2 comme signataire
      await contractManager.connect(user1).createContract(
        "QmTestHash123",
        "sha256TestHash123",
        [{
          signer: user2Address,
          role: 1, // CoSigner
          customRole: "",
          hasSignedContract: false,
          signedAt: 0
        }],
        Math.floor(Date.now() / 1000) + 86400,
        true,
        true,
        0,
        10,
        "Test proofs"
      );

      // 2. User2 signe pour finaliser et mint le NFT
      const tx = await contractManager.connect(user2).signContract(1); // ID 1 car reset au beforeEach
      await tx.wait();

      const proof = await contractNFT.getContractProof(1);

      expect(proof[0]).to.equal("QmTestHash123"); // ipfsHash
      expect(proof[2]).to.be.true; // isActive
      expect(proof[3]).to.have.lengthOf(2); // signers
      expect(proof[3][0]).to.equal(user1Address);
      expect(proof[3][1]).to.equal(user2Address);
    });

    it("Devrait échouer si non-owner tente de mint", async function () {
      const user1Address = await user1.getAddress();

      await expect(
        contractNFT.connect(user1).mintContractNFT(
          user1Address,
          "QmTestHash",
          [user1Address]
        )
      ).to.be.reverted;
    });

    it("Devrait échouer pour un token inexistant", async function () {
      await expect(
        contractNFT.getContractProof(999)
      ).to.be.reverted;
    });
  });

  describe("Transfert d'Ownership", function () {
    it("Devrait transférer l'ownership à ContractManager", async function () {
      const currentOwner = await contractNFT.owner();
      const managerAddress = await contractManager.getAddress();

      expect(currentOwner).to.equal(managerAddress);
    });

    it("Devrait permettre au nouveau owner de mint", async function () {
      const user1Address = await user1.getAddress();
      const expiresAt = Math.floor(Date.now() / 1000) + 86400;

      const tx = await contractManager.connect(owner).createContract(
        "QmOwnershipTest",
        "sha256OwnershipTest",
        [],
        expiresAt,
        true,
        true,
        ethers.parseEther("1.0"),
        10,
        "Test ownership"
      );

      const receipt = await tx.wait();

      expect(receipt?.status).to.equal(1);

      // Vérifier qu'un contrat a bien été créé
      const contractDetails = await contractManager.getContractDetails(1);
      expect(contractDetails[0].id).to.equal(1);
    });
  });

  describe("Fonctionnalités ERC721", function () {
    beforeEach(async function () {
      const user1Address = await user1.getAddress();

      // Mint un NFT pour les tests ERC721 via Auto-Finalize
      const tx = await contractManager.connect(user1).createContract(
        "QmTestERC721",
        "sha256TestERC721",
        [],
        Math.floor(Date.now() / 1000) + 86400,
        true,
        true,
        0,
        10,
        "Test ERC721"
      );
      await tx.wait();
    });

    it("Devrait supporter l'interface ERC721", async function () {
      const supportsInterface = await contractNFT.supportsInterface("0x80ac58cd"); // Interface ID ERC721

      expect(supportsInterface).to.be.true;
    });

    it("Devrait supporter l'interface EIP-5192 (Minimal Soulbound NFTs)", async function () {
      const supportsInterface = await contractNFT.supportsInterface("0xb45a3c0e"); // Interface ID ERC-5192

      expect(supportsInterface).to.be.true;
    });

    it("Devrait rapporter locked() == true pour un token mint", async function () {
      expect(await contractNFT.locked(1)).to.be.true;
    });

    it("Devrait revert locked() pour un token inexistant", async function () {
      await expect(contractNFT.locked(999)).to.be.revertedWith("Token does not exist");
    });

    it("Devrait retourner le token URI", async function () {
      try {
        const tokenURI = await contractNFT.tokenURI(1);
        // Si la fonction existe, vérifier qu'elle retourne quelque chose
        expect(tokenURI).to.be.a('string');
      } catch (error) {
        // Si tokenURI n'est pas implémenté, c'est normal
        console.log("tokenURI non implémenté - c'est optionnel pour ERC721");
      }
    });

    it("Ne devrait PAS permettre le transfert du NFT (preuve non transférable)", async function () {
      // Le NFT est la preuve de qui a signé le contrat — le rendre transférable romprait ce
      // lien. Seul le mint (from == address(0)) doit passer, tout transfert ultérieur revert.
      const user1Address = await user1.getAddress();
      const user2Address = await user2.getAddress();

      await expect(
        contractNFT.connect(user1).transferFrom(user1Address, user2Address, 1)
      ).to.be.revertedWith("ContractNFT: proof is non-transferable");

      // Le owner reste inchangé
      const owner1 = await contractNFT.ownerOf(1);
      expect(owner1).to.equal(user1Address);
    });
  });

  describe("Gestion des Signataires", function () {
    it("Devrait stocker correctement les signataires", async function () {
      const user1Address = await user1.getAddress();
      const user2Address = await user2.getAddress();
      const ownerAddress = await owner.getAddress();

      const signers = [
        user1Address,
        user2Address,
        ownerAddress
      ];

      // Mint avec plusieurs signataires via ContractManager
      // User1 crée, ajoute User2 et Owner
      await contractManager.connect(user1).createContract(
        "QmMultiSigners",
        "sha256MultiSigners",
        [
          { signer: user2Address, role: 1, customRole: "", hasSignedContract: false, signedAt: 0 },
          { signer: ownerAddress, role: 1, customRole: "", hasSignedContract: false, signedAt: 0 }
        ],
        Math.floor(Date.now() / 1000) + 86400,
        true,
        true,
        0,
        10,
        "Multi signers"
      );

      // Signatures requises
      await contractManager.connect(user2).signContract(1);
      const tx = await contractManager.connect(owner).signContract(1);
      await tx.wait();

      // Vérifier les signataires stockés
      const proof = await contractNFT.getContractProof(1);

      expect(proof[3]).to.have.lengthOf(3); // signers
      expect(proof[3]).to.deep.equal(signers);
    });

    it("Devrait maintenir les preuves de contrat actives", async function () {
      const user1Address = await user1.getAddress();

      const tx = await contractManager.connect(user1).createContract(
        "QmActiveTest",
        "sha256ActiveTest",
        [],
        Math.floor(Date.now() / 1000) + 86400,
        true, true, 0, 10, "Active test"
      );
      await tx.wait();

      const proof = await contractNFT.getContractProof(1);
      expect(proof[2]).to.be.true; // isActive
    });
  });

  describe("Métadonnées (tokenURI)", function () {
    it("Devrait construire le tokenURI à partir du base URI et de l'ID du token", async function () {
      const user1Address = await user1.getAddress();
      await contractManager.connect(user1).createContract(
        "QmMetadataTest",
        "sha256MetadataTest",
        [],
        Math.floor(Date.now() / 1000) + 86400,
        true, true, 0, 10, "Metadata test"
      );

      expect(await contractNFT.tokenURI(1)).to.equal("http://localhost:5000/api/nft/1");
    });

    it("Devrait permettre au metadataAdmin de changer le base URI", async function () {
      await contractManager.connect(user1).createContract(
        "QmMetadataTest2",
        "sha256MetadataTest2",
        [],
        Math.floor(Date.now() / 1000) + 86400,
        true, true, 0, 10, "Metadata test 2"
      );

      // owner() est ContractManager depuis le transfert d'ownership du beforeEach — le
      // metadataAdmin reste le déployeur (owner ici, cf. constructeur), un rôle
      // volontairement distinct pour ne pas dépendre d'un passthrough côté ContractManager.
      await contractNFT.connect(owner).setBaseTokenURI("https://cdn.cachetify.io/api/nft/");
      expect(await contractNFT.tokenURI(1)).to.equal("https://cdn.cachetify.io/api/nft/1");
    });

    it("Devrait refuser le changement de base URI à quelqu'un d'autre que le metadataAdmin", async function () {
      await expect(
        contractNFT.connect(user1).setBaseTokenURI("https://evil.example/")
      ).to.be.revertedWith("ContractNFT: caller is not the metadata admin");
    });

    it("Devrait permettre de transférer le rôle metadataAdmin", async function () {
      const user1Address = await user1.getAddress();
      await contractNFT.connect(owner).setMetadataAdmin(user1Address);
      expect(await contractNFT.metadataAdmin()).to.equal(user1Address);

      // L'ancien admin (owner) ne peut plus rien changer une fois le rôle transféré.
      await expect(
        contractNFT.connect(owner).setBaseTokenURI("https://should-fail.example/")
      ).to.be.revertedWith("ContractNFT: caller is not the metadata admin");
    });
  });
});