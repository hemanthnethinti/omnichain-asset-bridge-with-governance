const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  const amountRaw = process.argv[2] || "100";
  const amount = ethers.parseEther(amountRaw);

  const deployment = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "deployments", "chain-b.json"), "utf8")
  );

  const provider = new ethers.JsonRpcProvider(process.env.CHAIN_B_RPC_URL || "http://127.0.0.1:9545");
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);

  const bridgeMint = new ethers.Contract(
    deployment.contracts.BridgeMint,
    ["function burn(uint256 amount)"],
    wallet
  );

  const tx = await bridgeMint.burn(amount);
  const receipt = await tx.wait();

  console.log("Burned on Chain B", { amount: amount.toString(), txHash: receipt.hash });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
