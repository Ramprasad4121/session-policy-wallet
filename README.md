# Session Policy Wallet

**Restricted session keys with on-chain enforceable policies for humans and AI agents.**

Session Policy Wallet lets you grant temporary keys that can only spend a limited amount and can only interact with approved contracts. Any action outside the defined policy is automatically rejected on-chain.

---

## Problem

Unlimited approvals and unrestricted keys are still one of the biggest causes of drained wallets — especially when AI agents are given access to funds. Once a key is compromised or an agent is manipulated, there is usually no protection left.

## Solution

A simple on-chain policy layer that enforces two hard rules:

- **Native spend limit** — Maximum amount the key is allowed to spend
- **Contract allowlist** — Only approved contracts can be called

If a transaction violates either rule, it is rejected.

---

## Features

- On-chain spend limit enforcement
- On-chain contract allowlist
- Fail-closed design
- Simple and auditable core contract
- Works on Monad Testnet
- Designed for both humans and AI agents

---

## Live Demo Results (Monad Testnet)

| Action                        | Result              |
|-------------------------------|---------------------|
| Valid call (within limit)     | Allowed             |
| Over-spend attempt            | Rejected            |
| Call to non-allowed contract  | Rejected            |

**Deployed Contract (Monad Testnet):**  
`0xB30590F0A912B6B8A9F13a9Db9C2AAD3275A311b`

---

## How It Works

1. User sets a policy on the `PolicyValidator` contract (max spend + allowed targets).
2. A session key / agent is given permission to act under that policy.
3. Every sensitive action is checked against the policy.
4. If the action breaks the rules → transaction fails.

---

## Tech Stack

- **Smart Contracts:** Solidity + Foundry
- **Network:** Monad Testnet (Chain ID 10143)
- **Scripting:** TypeScript + Viem
- **Philosophy:** Minimal, fail-closed, auditable

---

## Project Structure

```text
session-policy-wallet/
├── contracts/
│   ├── src/
│   │   └── PolicyValidator.sol
│   ├── test/
│   │   └── PolicyValidator.t.sol
│   └── script/
│       └── Deploy.s.sol
├── scripts/
│   └── agent-simulation.ts
└── README.md
```

---

## Getting Started

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd session-policy-wallet
```

### 2. Install dependencies

```bash
cd contracts
forge install
```

### 3. Run tests

```bash
forge test -vv
```

### 4. Deploy (Monad Testnet)

```bash
forge script script/Deploy.s.sol:Deploy --rpc-url https://testnet-rpc.monad.xyz --broadcast --legacy
```

### 5. Run the agent simulation

```bash
cd ../scripts
npm install
PRIVATE_KEY=0xyourkey npx tsx agent-simulation.ts
```

---

## Roadmap

### Done
- [x] Core PolicyValidator
- [x] Spend limit + allowlist enforcement
- [x] Deployment on Monad Testnet
- [x] Working agent simulation

### Next
- [ ] Better session key integration
- [ ] Additional policy types
- [ ] Improved developer experience
- [ ] Security review
- [ ] Expand toward a broader Agent Security Layer

---

## License

MIT

---

## Acknowledgments

Built during **Monad Blitz Bangalore V5** (16 August 2026).
```

