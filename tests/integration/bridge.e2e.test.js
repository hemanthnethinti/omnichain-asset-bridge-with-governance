const { expect } = require("chai");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const runE2E = process.env.RUN_E2E === "1";
const describeIf = runE2E ? describe : describe.skip;

const ROOT = path.join(__dirname, "..", "..");
const DEPLOYMENTS_DIR = path.join(ROOT, "deployments");

const PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function run(cmd) {
  execSync(cmd, { stdio: "inherit", cwd: ROOT });
}

async function waitFor(checkFn, timeoutMs = 120000, intervalMs = 1500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await checkFn();
    if (result) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

function loadDeployment(name) {
  return JSON.parse(fs.readFileSync(path.join(DEPLOYMENTS_DIR, `${name}.json`), "utf8"));
}

function resetHostState() {
  fs.rmSync(path.join(ROOT, "deployments"), { recursive: true, force: true });
  fs.rmSync(path.join(ROOT, "relayer_data"), { recursive: true, force: true });
  fs.mkdirSync(path.join(ROOT, "deployments"), { recursive: true });
  fs.mkdirSync(path.join(ROOT, "relayer_data"), { recursive: true });
}

async function expectRevert(promiseFactory) {
  let reverted = false;
  try {
    const tx = await promiseFactory();
    await tx.wait();
  } catch (_err) {
    reverted = true;
  }
  expect(reverted).to.equal(true);
}

describeIf("Integration E2E Bridge + Governance", function () {
  this.timeout(600000);

  let providerA;
  let providerB;
  let walletA;
  let walletB;

  let vault;
  let bridgeLock;
  let wrapped;
  let bridgeMint;
  let governanceVoting;

  before(async function () {
    if (!fs.existsSync(path.join(ROOT, ".env")) && fs.existsSync(path.join(ROOT, ".env.example"))) {
      fs.copyFileSync(path.join(ROOT, ".env.example"), path.join(ROOT, ".env"));
    }

    run("docker compose down -v --remove-orphans");
    resetHostState();
    run("docker compose up -d --build");

    const deploymentReady = await waitFor(() => {
      return fs.existsSync(path.join(DEPLOYMENTS_DIR, "chain-a.json")) && fs.existsSync(path.join(DEPLOYMENTS_DIR, "chain-b.json"));
    }, 180000);

    expect(deploymentReady).to.equal(true);

    const a = loadDeployment("chain-a");
    const b = loadDeployment("chain-b");

    providerA = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    providerB = new ethers.JsonRpcProvider("http://127.0.0.1:9545");
    walletA = new ethers.Wallet(PRIVATE_KEY, providerA);
    walletB = new ethers.Wallet(PRIVATE_KEY, providerB);

    vault = new ethers.Contract(
      a.contracts.VaultToken,
      [
        "function approve(address spender, uint256 amount) returns (bool)",
        "function balanceOf(address user) view returns (uint256)"
      ],
      walletA
    );

    bridgeLock = new ethers.Contract(
      a.contracts.BridgeLock,
      [
        "function lock(uint256 amount)",
        "function unlock(address user, uint256 amount, uint256 nonce)",
        "function paused() view returns (bool)",
        "function RELAYER_ROLE() view returns (bytes32)",
        "function hasRole(bytes32 role, address account) view returns (bool)"
      ],
      walletA
    );

    wrapped = new ethers.Contract(
      b.contracts.WrappedVaultToken,
      ["function balanceOf(address user) view returns (uint256)", "function totalSupply() view returns (uint256)"],
      walletB
    );

    bridgeMint = new ethers.Contract(
      b.contracts.BridgeMint,
      [
        "function burn(uint256 amount)",
        "function mintWrapped(address user, uint256 amount, uint256 nonce)",
        "function RELAYER_ROLE() view returns (bytes32)",
        "function hasRole(bytes32 role, address account) view returns (bool)"
      ],
      walletB
    );

    governanceVoting = new ethers.Contract(
      b.contracts.GovernanceVoting,
      [
        "function createProposal(bytes data, uint256 votingPeriodBlocks) returns (uint256)",
        "function vote(uint256 proposalId)",
        "function finalize(uint256 proposalId)",
        "event ProposalCreated(uint256 indexed proposalId, bytes data, uint256 deadline)"
      ],
      walletB
    );
  });

  after(async function () {
    run("docker compose down --remove-orphans");
  });

  it("runs lock->mint then burn->unlock and preserves invariant", async function () {
    const lockAmount = ethers.parseEther("150");
    const burnAmount = ethers.parseEther("100");

    const vaultBefore = await vault.balanceOf(walletA.address);
    await (await vault.approve(await bridgeLock.getAddress(), lockAmount)).wait();
    await (await bridgeLock.lock(lockAmount)).wait();

    const minted = await waitFor(async () => {
      const bal = await wrapped.balanceOf(walletB.address);
      return bal >= lockAmount;
    }, 180000);
    expect(minted).to.equal(true);

    const wrappedAfterMint = await wrapped.balanceOf(walletB.address);
    expect(wrappedAfterMint).to.equal(lockAmount);

    const vaultAfterLock = await vault.balanceOf(walletA.address);
    expect(vaultAfterLock).to.equal(vaultBefore - lockAmount);

    const lockContractBalance = await vault.balanceOf(await bridgeLock.getAddress());
    const wrappedSupply = await wrapped.totalSupply();
    expect(lockContractBalance).to.equal(wrappedSupply);

    await (await bridgeMint.burn(burnAmount)).wait();

    const unlocked = await waitFor(async () => {
      const bal = await vault.balanceOf(walletA.address);
      return bal === vaultBefore - (lockAmount - burnAmount);
    }, 180000);
    expect(unlocked).to.equal(true);

    const wrappedAfterBurn = await wrapped.balanceOf(walletB.address);
    expect(wrappedAfterBurn).to.equal(lockAmount - burnAmount);

    const lockContractBalance2 = await vault.balanceOf(await bridgeLock.getAddress());
    const wrappedSupply2 = await wrapped.totalSupply();
    expect(lockContractBalance2).to.equal(wrappedSupply2);
  });

  it("prevents replay for mintWrapped and unlock", async function () {
    const nonceMint = 999991;
    const nonceUnlock = 999992;
    const amount = ethers.parseEther("1");

    await (await bridgeMint.mintWrapped(walletB.address, amount, nonceMint)).wait();
    await expectRevert(() => bridgeMint.mintWrapped(walletB.address, amount, nonceMint));

    await (await vault.approve(await bridgeLock.getAddress(), amount)).wait();
    await (await bridgeLock.lock(amount)).wait();

    const lockReady = await waitFor(async () => {
      const bal = await vault.balanceOf(await bridgeLock.getAddress());
      return bal >= amount;
    }, 60000);
    expect(lockReady).to.equal(true);

    await (await bridgeLock.unlock(walletA.address, amount, nonceUnlock)).wait();
    await expectRevert(() => bridgeLock.unlock(walletA.address, amount, nonceUnlock));
  });

  it("passes governance proposal and pauses Chain A bridge", async function () {
    const votingPeriodBlocks = 20;
    const tx = await governanceVoting.createProposal("0x01", votingPeriodBlocks);
    const receipt = await tx.wait();
    const created = receipt.logs.find((log) => log.fragment && log.fragment.name === "ProposalCreated");
    const proposalId = created.args.proposalId;

    await (await governanceVoting.vote(proposalId)).wait();
    for (let i = 0; i < votingPeriodBlocks + 2; i += 1) {
      await providerB.send("evm_mine", []);
    }
    await (await governanceVoting.finalize(proposalId)).wait();

    const paused = await waitFor(async () => bridgeLock.paused(), 120000);
    expect(paused).to.equal(true);

    await (await vault.approve(await bridgeLock.getAddress(), 1)).wait();
    await expectRevert(() => bridgeLock.lock(1));
  });
});
