const fs = require("fs");
const path = require("path");

const defaultState = {
  processed: {
    locked: {},
    burned: {},
    governance: {}
  },
  lastBlocks: {
    chainA: 0,
    chainB: 0
  }
};

class StateStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = structuredClone(defaultState);
  }

  init() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(this.filePath)) {
      const data = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      this.state = {
        processed: {
          locked: data?.processed?.locked || {},
          burned: data?.processed?.burned || {},
          governance: data?.processed?.governance || {}
        },
        lastBlocks: {
          chainA: Number(data?.lastBlocks?.chainA || 0),
          chainB: Number(data?.lastBlocks?.chainB || 0)
        }
      };
      return;
    }

    this.persist();
  }

  persist() {
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    fs.renameSync(tmp, this.filePath);
  }

  isProcessed(kind, nonce) {
    return Boolean(this.state.processed[kind][String(nonce)]);
  }

  markProcessed(kind, nonce, txHash) {
    this.state.processed[kind][String(nonce)] = {
      txHash,
      processedAt: new Date().toISOString()
    };
    this.persist();
  }

  getLastBlock(chainKey) {
    return Number(this.state.lastBlocks[chainKey] || 0);
  }

  setLastBlock(chainKey, blockNumber) {
    this.state.lastBlocks[chainKey] = Number(blockNumber);
    this.persist();
  }
}

module.exports = {
  StateStore
};
