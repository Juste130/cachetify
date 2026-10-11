import hre from "hardhat";

async function main() {
  console.log("Déploiement du contrat...");

  const ContractManager = await hre.ethers.getContractFactory("ContractManager");
  const contractManager = await ContractManager.deploy();
  await contractManager.waitForDeployment();
  const managerAddress = await contractManager.getAddress();
  console.log("ContractManager déployé à:", managerAddress);

  console.log("Déploiement terminé avec succès!");
  console.log(`CONTRACT_MANAGER_ADDRESS=${managerAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
