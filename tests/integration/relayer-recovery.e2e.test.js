const { expect } = require("chai");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const runE2E = process.env.RUN_E2E === "1";
const describeIf = runE2E ? describe : describe.skip;

const ROOT = path.join(__dirname, "..", "..");
const PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function run(cmd) {
  execSync(cmd, { stdio: "inherit", cwd: ROOT });
}

function resetHostState() {
  fs.rmSync(path.join(ROOT, "deployments"), { recursive: true, force: true });
  fs.rmSync(path.join(ROOT, "relayer_data"), { recursive: true, force: true });
  fs.mkdirSync(path.join(ROOT, "deployments"), { recursive: true });
  fs.mkdirSync(path.join(ROOT, "relayer_data"), { recursive: true });
}

async function waitFor(checkFn, timeoutMs = 120000, intervalMs = 1500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkFn()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

describeIf("Relayer recovery E2E", function () {
  this.timeout(600000);

  it("processes missed lock after relayer restart", async function () {
    run("docker compose down -v --remove-orphans");
    resetHostState();
    run("docker compose up -d --build");

    const chainADeploymentPath = path.join(ROOT, "deployments", "chain-a.json");
    const chainBDeploymentPath = path.join(ROOT, "deployments", "chain-b.json");

    const deploymentsReady = await waitFor(
      () => fs.existsSync(chainADeploymentPath) && fs.existsSync(chainBDeploymentPath),
      180000
    );
    expect(deploymentsReady).to.equal(true);

    const chainA = JSON.parse(fs.readFileSync(chainADeploymentPath, "utf8"));
    const chainB = JSON.parse(fs.readFileSync(chainBDeploymentPath, "utf8"));

    const providerA = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    const providerB = new ethers.JsonRpcProvider("http://127.0.0.1:9545");

    const walletA = new ethers.Wallet(PRIVATE_KEY, providerA);
    const walletB = new ethers.Wallet(PRIVATE_KEY, providerB);

    const vault = new ethers.Contract(
      chainA.contracts.VaultToken,
      [
        "function approve(address spender, uint256 amount) returns (bool)",
        "function balanceOf(address user) view returns (uint256)"
      ],
      walletA
    );

    const bridgeLock = new ethers.Contract(chainA.contracts.BridgeLock, ["function lock(uint256 amount)"], walletA);
    const wrapped = new ethers.Contract(
      chainB.contracts.WrappedVaultToken,
      ["function balanceOf(address user) view returns (uint256)"],
      walletB
    );

    const before = await wrapped.balanceOf(walletB.address);

    run("docker compose stop relayer");

    const amount = ethers.parseEther("7");
    await (await vault.approve(await bridgeLock.getAddress(), amount)).wait();
    await (await bridgeLock.lock(amount)).wait();

    run("docker compose start relayer");

    const recovered = await waitFor(async () => {
      const after = await wrapped.balanceOf(walletB.address);
      return after === before + amount;
    }, 180000);

    expect(recovered).to.equal(true);
  });
});
