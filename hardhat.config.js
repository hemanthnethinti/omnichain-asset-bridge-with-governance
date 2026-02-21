require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const DEFAULT_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    chainA: {
      url: process.env.CHAIN_A_RPC_URL || "http://127.0.0.1:8545",
      chainId: 1111,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY || DEFAULT_KEY]
    },
    chainB: {
      url: process.env.CHAIN_B_RPC_URL || "http://127.0.0.1:9545",
      chainId: 2222,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY || DEFAULT_KEY]
    }
  }
};
