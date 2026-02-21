# Local Omnichain Asset Bridge (with Governance Recovery)

This repo contains a full local simulation of a two-chain asset bridge:

- Chain A (settlement): users lock `VaultToken`
- Chain B (execution): users receive/burn `WrappedVaultToken`
- Relayer (Node.js): watches events on both chains and executes cross-chain actions
- Governance path: a passed vote on Chain B can pause bridging on Chain A

The project is designed to be runnable end-to-end with a single Docker command and includes replay protection, confirmation delay handling, and relayer crash recovery.

## What is in this repository

- `contracts/` Solidity contracts for both chains
- `scripts/` deployment and helper scripts
- `relayer/` relayer service (`Dockerfile` + source)
- `tests/` unit + integration tests (including failure/recovery)
- `docker-compose.yml` full local stack
- `.env.example` required configuration
- `architecture.md` system diagram and safety notes

## Quick start (Docker, recommended)

1. Create environment file:

   - PowerShell: `Copy-Item .env.example .env`
   - Bash: `cp .env.example .env`

2. Build and start everything:

   - `docker compose up -d --build`

3. Verify services:

   - `docker compose ps`
   - `docker compose logs -f relayer`

4. Stop:
   - `docker compose down`

## Local dev mode (without Docker)

1. Install dependencies: `npm install`
2. Compile contracts: `npm run compile`
3. Run two local chains:
   - Chain A: `anvil --host 0.0.0.0 --port 8545 --chain-id 1111 --block-time 1`
   - Chain B: `anvil --host 0.0.0.0 --port 9545 --chain-id 2222 --block-time 1`
4. Deploy contracts on both chains: `npm run deploy:all`
5. Start relayer: `npm run relayer`

## Key design choices

### Replay protection and idempotency

- `BridgeMint.mintWrapped(user, amount, nonce)` reverts if `nonce` was already processed.
- `BridgeLock.unlock(user, amount, nonce)` reverts if `nonce` was already processed.
- Relayer also keeps a persistent processed-event registry to avoid duplicate work after restart.

### Access control and emergency controls

- Mint/unlock methods are restricted via role-based access (`RELAYER_ROLE`).
- `BridgeLock` is pausable.
- `GovernanceEmergency.pauseBridge()` is relayer-gated and pauses Chain A bridge operations.

### Relayer reliability

- Waits for confirmations before processing (`CONFIRMATION_DEPTH`, default `3`).
- Retries failed RPC/tx operations with incremental backoff.
- Persists state to disk (`DB_PATH`) using atomic file write (tmp + rename).
- On restart, reloads state and backfills missed blocks.

## Running tests

### Unit tests

- `npm test`

These cover contract-level behavior: lock/mint/burn/unlock flows, access control, nonce replay prevention, and governance voting paths.

### Integration / recovery tests

Integration tests are in `tests/integration/` and validate:

- lock on Chain A -> mint on Chain B
- burn on Chain B -> unlock on Chain A
- supply invariant across both chains
- governance pass on Chain B -> pause on Chain A
- relayer restart recovery for missed events

## Configuration

Use `.env.example` as reference. Important variables:

- `DEPLOYER_PRIVATE_KEY` (example local test key)
- `CHAIN_A_RPC_URL`, `CHAIN_B_RPC_URL`
- `CONFIRMATION_DEPTH`
- `DB_PATH`
- `RELAYER_PRIVATE_KEY` (optional override)

## Requirement coverage (where to look)

1. Two independent chains (different IDs/ports): `docker-compose.yml`
2. One-command startup with health checks: `docker-compose.yml`
3. Chain A contracts + deploy: `contracts/VaultToken.sol`, `contracts/BridgeLock.sol`, `contracts/GovernanceEmergency.sol`, `scripts/deployChainA.js`
4. Chain B contracts + deploy: `contracts/WrappedVaultToken.sol`, `contracts/BridgeMint.sol`, `contracts/GovernanceVoting.sol`, `scripts/deployChainB.js`
5. Persistent relayer state: `relayer/src/stateStore.js`
6. Lock->Mint flow: integration tests under `tests/integration/`
7. Burn->Unlock flow: integration tests under `tests/integration/`
8. Supply invariant: integration tests under `tests/integration/`
9. Replay prevention tests: unit + integration tests
10. Governance-triggered pause: integration tests
11. Relayer crash recovery test: `tests/integration/relayer-recovery.e2e.test.js`
12. Environment example file: `.env.example`

## Troubleshooting

### Docker chains are running but RPC is unreachable

If `curl`/JSON-RPC calls to `localhost:8545` or `localhost:9545` fail while containers look up, verify these points:

- Anvil must bind to `0.0.0.0` inside the container (not `127.0.0.1`).
- In `docker-compose.yml`, set `entrypoint: ["anvil"]` and pass arguments in `command` (host/port/chain-id).
- If you use Foundry image healthchecks, avoid `curl` (not always installed). Use `cast` instead, for example:
  - `cast chain-id --rpc-url http://localhost:8545 >/dev/null 2>&1`

Quick verification commands:

- `docker logs chain-a | tail -n 20`
- `docker logs chain-b | tail -n 20`
- PowerShell:
  - `$body = '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'`
  - `Invoke-RestMethod -Uri 'http://localhost:8545' -Method Post -ContentType 'application/json' -Body $body`
  - `Invoke-RestMethod -Uri 'http://localhost:9545' -Method Post -ContentType 'application/json' -Body $body`

## Notes

- This setup intentionally uses local chains for deterministic behavior and easier failure simulation.
- The architecture diagram and event path are documented in `architecture.md`.
