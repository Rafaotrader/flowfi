require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const key = process.env.DEPLOYER_PRIVATE_KEY || "";
const accounts = /^(0x)?[0-9a-fA-F]{64}$/.test(key) ? [key] : [];

module.exports = {
  solidity: {
    version: "0.8.19",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  paths: {
    sources:   "./contracts",
    artifacts: "./artifacts",
    cache:     "./cache",
    tests:     "./test",
  },
  networks: {
    base: {
      url:     process.env.BASE_RPC_URL || "https://mainnet.base.org",
      chainId: 8453,
      accounts,
    },
    sepolia: {
      url:     process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      chainId: 11155111,
      accounts,
    },
  },
  etherscan: {
    apiKey: {
      base:    process.env.BASESCAN_API_KEY  || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
    },
    customChains: [{
      network: "base",
      chainId: 8453,
      urls: {
        apiURL:     "https://api.basescan.org/api",
        browserURL: "https://basescan.org",
      },
    }],
  },
};
