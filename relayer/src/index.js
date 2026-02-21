const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { ethers } = require("ethers");
require("dotenv").config();

const { log, error } = require("./logger");
const { StateStore } = require("./stateStore");
const {
  bridgeLockAbi,
  bridgeMintAbi,
  governanceVotingAbi,
  governanceEmergencyAbi
} = require("./abis");

const CHAIN_A_RPC_URL = process.env.CHAIN_A_RPC_URL || "http://127.0.0.1:8545";
const CHAIN_B_RPC_URL = process.env.CHAIN_B_RPC_URL || "http://127.0.0.1:9545";
const DEFAULT_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function selectPrivateKey() {
  const candidate = process.env.RELAYER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY || DEFAULT_PRIVATE_KEY;
  if (!candidate || candidate.includes("${") || !/^0x[a-fA-F0-9]{64}$/.test(candidate)) {
    return DEFAULT_PRIVATE_KEY;
  }
  return candidate;
}

const PRIVATE_KEY = selectPrivateKey();

const CONFIRMATION_DEPTH = Number(process.env.CONFIRMATION_DEPTH || 3);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 2500);
const DB_PATH = process.env.DB_PATH || path.join(".", "data", "processed_nonces.json");

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function runDeploymentsIfNeeded() {
  const chainAPath = path.join(process.cwd(), "deployments", "chain-a.json");
  const chainBPath = path.join(process.cwd(), "deployments", "chain-b.json");

  if (fs.existsSync(chainAPath) && fs.existsSync(chainBPath)) {
    return;
  }

  log("Deployment artifacts missing, running deployment scripts");
  const result = spawnSync("node", ["scripts/deployAll.js"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      RELAYER_ADDRESS: new ethers.Wallet(PRIVATE_KEY).address
    }
  });

  if (result.status !== 0) {
    throw new Error("Failed to deploy contracts for relayer startup");
  }
}

async function withRetry(task, taskName, retries = 5, initialDelayMs = 1500) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await task();
    } catch (err) {
      attempt += 1;
      if (attempt >= retries) {
        throw err;
      }
      const delayMs = initialDelayMs * attempt;
      error(`${taskName} failed; retrying`, err, { attempt, delayMs });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error("unreachable");
}

async function main() {
  runDeploymentsIfNeeded();

  const deploymentA = readJSON(path.join(process.cwd(), "deployments", "chain-a.json"));
  const deploymentB = readJSON(path.join(process.cwd(), "deployments", "chain-b.json"));

  const providerA = new ethers.JsonRpcProvider(CHAIN_A_RPC_URL);
  const providerB = new ethers.JsonRpcProvider(CHAIN_B_RPC_URL);

  const walletA = new ethers.Wallet(PRIVATE_KEY, providerA);
  const walletB = new ethers.Wallet(PRIVATE_KEY, providerB);

  const bridgeLock = new ethers.Contract(deploymentA.contracts.BridgeLock, bridgeLockAbi, walletA);
  const governanceEmergency = new ethers.Contract(
    deploymentA.contracts.GovernanceEmergency,
    governanceEmergencyAbi,
    walletA
  );

  const bridgeMint = new ethers.Contract(deploymentB.contracts.BridgeMint, bridgeMintAbi, walletB);
  const governanceVoting = new ethers.Contract(
    deploymentB.contracts.GovernanceVoting,
    governanceVotingAbi,
    walletB
  );

  const store = new StateStore(DB_PATH);
  store.init();

  if (store.getLastBlock("chainA") === 0) {
    const currentA = await providerA.getBlockNumber();
    store.setLastBlock("chainA", Math.max(currentA - CONFIRMATION_DEPTH, 0));
  }

  if (store.getLastBlock("chainB") === 0) {
    const currentB = await providerB.getBlockNumber();
    store.setLastBlock("chainB", Math.max(currentB - CONFIRMATION_DEPTH, 0));
  }

  log("Relayer started", {
    chainA: CHAIN_A_RPC_URL,
    chainB: CHAIN_B_RPC_URL,
    confirmationDepth: CONFIRMATION_DEPTH,
    dbPath: DB_PATH,
    relayer: walletA.address
  });

  async function processLockedEvents() {
    const latest = await providerA.getBlockNumber();
    const safeBlock = latest - CONFIRMATION_DEPTH;
    if (safeBlock <= store.getLastBlock("chainA")) {
      return;
    }

    const fromBlock = store.getLastBlock("chainA") + 1;
    const toBlock = safeBlock;
    const events = await bridgeLock.queryFilter(bridgeLock.filters.Locked(), fromBlock, toBlock);

    for (const event of events) {
      const { user, amount, nonce } = event.args;
      const nonceKey = nonce.toString();

      if (store.isProcessed("locked", nonceKey)) {
        continue;
      }

      const tx = await withRetry(
        async () => {
          const submitTx = await bridgeMint.mintWrapped(user, amount, nonce);
          return submitTx.wait();
        },
        "mintWrapped"
      );

      store.markProcessed("locked", nonceKey, tx.hash);
      log("Processed Locked -> mintWrapped", {
        nonce: nonceKey,
        user,
        amount: amount.toString(),
        txHash: tx.hash,
        sourceBlock: event.blockNumber
      });
    }

    store.setLastBlock("chainA", toBlock);
  }

  async function processBurnedEvents() {
    const latest = await providerB.getBlockNumber();
    const safeBlock = latest - CONFIRMATION_DEPTH;
    if (safeBlock <= store.getLastBlock("chainB")) {
      return;
    }

    const fromBlock = store.getLastBlock("chainB") + 1;
    const toBlock = safeBlock;

    const burnedEvents = await bridgeMint.queryFilter(bridgeMint.filters.Burned(), fromBlock, toBlock);
    for (const event of burnedEvents) {
      const { user, amount, nonce } = event.args;
      const nonceKey = nonce.toString();

      if (store.isProcessed("burned", nonceKey)) {
        continue;
      }

      const tx = await withRetry(
        async () => {
          const submitTx = await bridgeLock.unlock(user, amount, nonce);
          return submitTx.wait();
        },
        "unlock"
      );

      store.markProcessed("burned", nonceKey, tx.hash);
      log("Processed Burned -> unlock", {
        nonce: nonceKey,
        user,
        amount: amount.toString(),
        txHash: tx.hash,
        sourceBlock: event.blockNumber
      });
    }

    const proposalEvents = await governanceVoting.queryFilter(
      governanceVoting.filters.ProposalPassed(),
      fromBlock,
      toBlock
    );

    for (const event of proposalEvents) {
      const proposalId = event.args.proposalId.toString();
      if (store.isProcessed("governance", proposalId)) {
        continue;
      }

      const tx = await withRetry(
        async () => {
          const submitTx = await governanceEmergency.pauseBridge();
          return submitTx.wait();
        },
        "pauseBridge"
      );

      store.markProcessed("governance", proposalId, tx.hash);
      log("Processed ProposalPassed -> pauseBridge", {
        proposalId,
        txHash: tx.hash,
        sourceBlock: event.blockNumber
      });
    }

    store.setLastBlock("chainB", toBlock);
  }

  while (true) {
    try {
      await processLockedEvents();
      await processBurnedEvents();
    } catch (err) {
      error("Relayer loop error", err);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  error("Relayer fatal error", err);
  process.exit(1);
});
