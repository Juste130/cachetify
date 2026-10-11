import { expect } from "chai";
import hre from "hardhat";
import "@nomicfoundation/hardhat-chai-matchers";

const { ethers } = hre;

describe("ContractManager", function () {
  let contractManager: any;
  let owner: any;
  let creator: any;
  let signer1: any;
  let signer2: any;
  let nonParticipant: any;

  const ONE_DAY = 24 * 60 * 60;
  const expiresAt = Math.floor(Date.now() / 1000) + ONE_DAY;

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    [owner, creator, signer1, signer2, nonParticipant] = signers;

    const ContractManager = await ethers.getContractFactory("ContractManager");
    contractManager = await ContractManager.deploy();
    await contractManager.waitForDeployment();
  });

  describe("Déploiement", function () {
    it("Devrait déployer le contrat avec le déployeur comme owner et emergencyAdmin", async function () {
      const managerAddress = await contractManager.getAddress();
      expect(managerAddress).to.be.a("string").and.match(/^0x[a-fA-F0-9]{40}$/);

      expect(await contractManager.owner()).to.equal(await owner.getAddress());
      expect(await contractManager.emergencyAdmin()).to.equal(await owner.getAddress());
      expect(await contractManager.paused()).to.be.false;
    });
  });

  describe("Création de Contrat", function () {
    it("Devrait créer un contrat avec succès", async function () {
      const signer1Address = await signer1.getAddress();
      const signer2Address = await signer2.getAddress();

      const signersWithRoles = [
        { signer: signer1Address, role: 1, customRole: "", hasSignedContract: false, signedAt: 0 },
        { signer: signer2Address, role: 2, customRole: "", hasSignedContract: false, signedAt: 0 },
      ];

      const tx = await contractManager.connect(creator).createContract(
        "QmTestHash123",
        "sha256TestHash123",
        signersWithRoles,
        expiresAt
      );

      const receipt = await tx.wait();
      expect(receipt?.logs.length).to.be.greaterThan(0);

      const contractDetails = await contractManager.getContractDetails(1);
      expect(contractDetails[0].creator.toLowerCase()).to.equal((await creator.getAddress()).toLowerCase());
      expect(contractDetails[0].status).to.equal(0); // PendingSignatures
      expect(contractDetails[2]).to.be.false; // allSigned
    });

    it("Devrait finaliser immédiatement un contrat sans signataire additionnel", async function () {
      await contractManager.connect(creator).createContract(
        "QmSoloHash",
        "sha256SoloHash",
        [],
        expiresAt
      );

      const contractDetails = await contractManager.getContractDetails(1);
      expect(contractDetails[0].status).to.equal(1); // Active
      expect(contractDetails[2]).to.be.true; // allSigned
    });

    it("Devrait échouer avec une référence de stockage déjà utilisée", async function () {
      const signer1Address = await signer1.getAddress();
      const signersWithRoles = [
        { signer: signer1Address, role: 1, customRole: "", hasSignedContract: false, signedAt: 0 },
      ];

      await contractManager.connect(creator).createContract(
        "QmDuplicateHash",
        "sha256DuplicateHash1",
        signersWithRoles,
        expiresAt
      );

      await expect(
        contractManager.connect(creator).createContract(
          "QmDuplicateHash",
          "sha256DuplicateHash2",
          signersWithRoles,
          expiresAt
        )
      ).to.be.revertedWith("IPFS hash already used");
    });

    it("Devrait échouer avec une date d'expiration invalide", async function () {
      const pastDate = Math.floor(Date.now() / 1000) - ONE_DAY;
      const signer1Address = await signer1.getAddress();
      const signersWithRoles = [
        { signer: signer1Address, role: 1, customRole: "", hasSignedContract: false, signedAt: 0 },
      ];

      await expect(
        contractManager.connect(creator).createContract(
          "QmTestHash",
          "sha256TestHash",
          signersWithRoles,
          pastDate
        )
      ).to.be.revertedWith("Invalid expiration time");
    });

    it("Devrait échouer si le créateur figure aussi parmi les signataires additionnels", async function () {
      const creatorAddress = await creator.getAddress();
      const signersWithRoles = [
        { signer: creatorAddress, role: 1, customRole: "", hasSignedContract: false, signedAt: 0 },
      ];

      await expect(
        contractManager.connect(creator).createContract(
          "QmSelfSign",
          "sha256SelfSign",
          signersWithRoles,
          expiresAt
        )
      ).to.be.revertedWith("Creator cannot be additional signer");
    });
  });

  describe("Processus de Signature", function () {
    beforeEach(async function () {
      const signer1Address = await signer1.getAddress();
      const signer2Address = await signer2.getAddress();

      const signersWithRoles = [
        { signer: signer1Address, role: 1, customRole: "", hasSignedContract: false, signedAt: 0 },
        { signer: signer2Address, role: 2, customRole: "", hasSignedContract: false, signedAt: 0 },
      ];

      await contractManager.connect(creator).createContract(
        "QmSignatureTest",
        "sha256SignatureTest",
        signersWithRoles,
        expiresAt
      );
    });

    it("Devrait permettre la signature des participants et finaliser le contrat", async function () {
      await contractManager.connect(signer1).signContract(1);
      await contractManager.connect(signer2).signContract(1);

      const contractDetails = await contractManager.getContractDetails(1);
      expect(contractDetails[2]).to.be.true; // allSigned
      expect(contractDetails[0].status).to.equal(1); // Active
      expect(contractDetails[0].effectiveDate).to.be.greaterThan(0);
    });

    it("Devrait échouer si un non-participant tente de signer", async function () {
      await expect(
        contractManager.connect(nonParticipant).signContract(1)
      ).to.be.revertedWith("Not a participant");
    });

    it("Devrait échouer si le participant a déjà signé", async function () {
      await contractManager.connect(signer1).signContract(1);

      await expect(
        contractManager.connect(signer1).signContract(1)
      ).to.be.revertedWith("Already signed");
    });
  });

  describe("Système de Pause", function () {
    it("Devrait permettre la pause par le owner", async function () {
      const tx = await contractManager.connect(owner).emergencyPause("Maintenance système");
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);

      expect(await contractManager.paused()).to.be.true;
    });

    it("Devrait empêcher une adresse non autorisée de déclencher la pause", async function () {
      await expect(
        contractManager.connect(nonParticipant).emergencyPause("Tentative non autorisée")
      ).to.be.revertedWith("Not authorized to pause");
    });

    it("Devrait empêcher les actions quand en pause", async function () {
      await contractManager.connect(owner).emergencyPause("Test pause");

      const signer1Address = await signer1.getAddress();
      const signersWithRoles = [
        { signer: signer1Address, role: 1, customRole: "", hasSignedContract: false, signedAt: 0 },
      ];

      await expect(
        contractManager.connect(creator).createContract(
          "QmPausedTest",
          "sha256PausedTest",
          signersWithRoles,
          expiresAt
        )
      ).to.be.revertedWith("Contract is paused");
    });

    it("Devrait permettre la reprise après le délai minimal", async function () {
      await contractManager.connect(owner).emergencyPause("Test reprise");
      await hre.network.provider.send("evm_increaseTime", [60 * 60 + 1]);
      await hre.network.provider.send("evm_mine");

      const tx = await contractManager.connect(owner).resumeContract("Maintenance terminée");
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);

      expect(await contractManager.paused()).to.be.false;
    });

    it("Devrait empêcher la reprise avant le délai minimal (sauf emergencyAdmin)", async function () {
      // Le déployeur est owner ET emergencyAdmin par défaut, ce qui contournerait le délai
      // dans les deux cas — on désigne un emergencyAdmin distinct pour isoler le cas "owner
      // non-emergencyAdmin", le seul réellement bloqué par le délai minimal.
      await contractManager.connect(owner).setEmergencyAdmin(await signer2.getAddress());
      await contractManager.connect(owner).emergencyPause("Test délai");

      await expect(
        contractManager.connect(owner).resumeContract("Trop tôt")
      ).to.be.revertedWith("Minimum pause duration not reached (1 hour)");
    });

    it("Devrait permettre la reprise forcée après la durée maximale", async function () {
      await contractManager.connect(owner).emergencyPause("Pause longue");
      await hre.network.provider.send("evm_increaseTime", [30 * 24 * 60 * 60 + 1]);
      await hre.network.provider.send("evm_mine");

      await contractManager.connect(nonParticipant).forceResume();

      expect(await contractManager.paused()).to.be.false;
    });
  });
});
