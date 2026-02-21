# Omnichain Bridge Architecture

This project runs two independent local chains and links them with a relayer process.

- **Chain A (Settlement):** source of truth for `VaultToken` custody.
- **Chain B (Execution):** host of `WrappedVaultToken` and governance voting.
- **Relayer:** the off-chain coordinator that watches events and executes the mirrored action on the other chain.

## System diagram

```mermaid
flowchart LR
        U[User Wallet] -->|lock(amount)| A1[Chain A: BridgeLock]
        A1 -->|holds VAULT| A2[Chain A: VaultToken]
        A1 -->|Locked(user,amount,nonce)| R[Relayer Service]

        R -->|mintWrapped(user,amount,nonce)| B1[Chain B: BridgeMint]
        B1 -->|mint| B2[Chain B: WrappedVaultToken]

        U -->|burn(amount)| B1
        B1 -->|Burned(user,amount,nonce)| R
        R -->|unlock(user,amount,nonce)| A1

        U -->|create/vote/finalize| B3[Chain B: GovernanceVoting]
        B3 -->|ProposalPassed(id,data)| R
        R -->|pauseBridge()| A3[Chain A: GovernanceEmergency]
        A3 -->|pause()| A1

        R --- D[(Persistent JSON state\nprocessed nonces + last scanned blocks)]
```

## Main flows

### 1) Deposit on Chain A -> Mint on Chain B

1. User calls `BridgeLock.lock(amount)` on Chain A.
2. Contract emits `Locked(user, amount, nonce)`.
3. Relayer waits for confirmation depth.
4. Relayer calls `BridgeMint.mintWrapped(user, amount, nonce)` on Chain B.
5. User receives wrapped tokens.

### 2) Burn on Chain B -> Unlock on Chain A

1. User calls `BridgeMint.burn(amount)` on Chain B.
2. Contract emits `Burned(user, amount, nonce)`.
3. Relayer waits for confirmation depth.
4. Relayer calls `BridgeLock.unlock(user, amount, nonce)` on Chain A.
5. Original tokens are released back to user.

### 3) Governance-triggered emergency pause

1. Token holders vote on Chain B using `GovernanceVoting`.
2. If quorum is met and finalized, `ProposalPassed(proposalId, data)` is emitted.
3. Relayer picks the event and calls `GovernanceEmergency.pauseBridge()` on Chain A.
4. `BridgeLock` is paused and new lock operations are blocked.

## Trust and safety boundaries

- **On-chain replay protection:**
  - `BridgeMint` stores processed mint nonces.
  - `BridgeLock` stores processed unlock nonces.
- **Off-chain replay protection:** relayer persists processed IDs to disk.
- **Finality guard:** relayer only consumes events from blocks that are at least `CONFIRMATION_DEPTH` behind head.
- **Access control:** privileged bridge actions are role-gated; only approved relayer address can execute them.

## Crash recovery behavior

The relayer stores:

- processed bridge/governance IDs
- last scanned block per chain

On restart, it reloads this state and resumes scanning from the previous safe position. This allows it to process events emitted while the relayer was offline without replaying already completed actions.

## Invariant

During normal operation, the bridge maintains:

`VaultToken.balanceOf(BridgeLock on Chain A) == WrappedVaultToken.totalSupply() on Chain B`

Integration tests validate this invariant after lock/mint and burn/unlock cycles.
