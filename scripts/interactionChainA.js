const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  const amountRaw = process.argv[2] || "100";
  const amount = ethers.parseEther(amountRaw);

  const deployment = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "deployments", "chain-a.json"), "utf8")
  );

  const provider = new ethers.JsonRpcProvider(process.env.CHAIN_A_RPC_URL || "http://127.0.0.1:8545");
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);

  const vault = new ethers.Contract(
    deployment.contracts.VaultToken,
    ["function approve(address spender, uint256 amount) returns (bool)"],
    wallet
  );

  const bridgeLock = new ethers.Contract(
    deployment.contracts.BridgeLock,
    ["function lock(uint256 amount)"],
    wallet
  );

  await (await vault.approve(await bridgeLock.getAddress(), amount)).wait();
  const tx = await bridgeLock.lock(amount);
  const receipt = await tx.wait();

  console.log("Locked on Chain A", { amount: amount.toString(), txHash: receipt.hash });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
