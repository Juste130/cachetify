import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    }
  },
  networks: {
    hardhat: {
      chainId: 1337
    },
    sepolia: {
      chainId: 11155111,
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: process.env.SEPOLIA_PRIVATE_KEY ? [process.env.SEPOLIA_PRIVATE_KEY] : []
    },
    tenderly: {
      url: process.env.POLYGON_RPC_URL || "",
      accounts: process.env.FUNDER_PRIVATE_KEY
        ? [process.env.FUNDER_PRIVATE_KEY.startsWith("0x") ? process.env.FUNDER_PRIVATE_KEY : `0x${process.env.FUNDER_PRIVATE_KEY}`]
        : [],
      chainId: 137
    },
    amoy: {
      url: process.env.ALCHEMY_POLYGON_TESTNET_RPC_URL || "https://rpc-amoy.polygon.technology",
      accounts: process.env.FUNDER_PRIVATE_KEY
        ? [process.env.FUNDER_PRIVATE_KEY.startsWith("0x") ? process.env.FUNDER_PRIVATE_KEY : `0x${process.env.FUNDER_PRIVATE_KEY}`]
        : [],
      chainId: 80002
    }
  },
  // ContractManager.ts deploys a fresh contract in every single beforeEach — on a slower
  // machine that alone can approach Mocha's 40s default, timing the very first hook out before
  // any test body runs (unrelated to test/contract correctness). 120s gives that room back.
  mocha: {
    timeout: 120000
  }
};

export default config;