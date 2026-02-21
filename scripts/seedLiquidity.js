const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  const chainADeployment = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "deployments", "chain-a.json"), "utf8")
  );

  const providerA = new ethers.JsonRpcProvider(process.env.CHAIN_A_RPC_URL || "http://127.0.0.1:8545");
  const walletA = new ethers.Wallet(key, providerA);

  const vaultAbi = [
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function balanceOf(address owner) view returns (uint256)"
  ];
  const vault = new ethers.Contract(chainADeployment.contracts.VaultToken, vaultAbi, walletA);

  const target = process.env.USER_ADDRESS || walletA.address;
  const amount = ethers.parseEther(process.env.SEED_AMOUNT || "1000");

  const tx = await vault.transfer(target, amount);
  await tx.wait();

  console.log(`Seeded ${amount.toString()} VAULT to ${target}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
