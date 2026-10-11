# Cachetify

Cachetify lets someone with no legal or technical background draft a contract with AI assistance, have every party sign it, and prove — months later, to anyone, without trusting Cachetify itself — that the document hasn't been altered since. The SHA-256 fingerprint of the document, the signers' addresses, and each signature's timestamp are anchored on the Polygon blockchain; the document itself stays encrypted, off-chain.

Built as the practical component of a Licence (undergraduate) thesis in Software Engineering at IFRI-UAC (Bénin).

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000)](https://nextjs.org/)
[![Polygon](https://img.shields.io/badge/Polygon-Amoy-8247E5)](https://polygon.technology/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

## What it does

- **AI-assisted drafting** — generates a contract from a plain-language description (Groq, `openai/gpt-oss-120b`) and flags missing clauses before signature.
- **On-chain proof, not on-chain content** — only the document's hash, its storage reference, the signers' addresses, and each signature's date are written to the smart contract. The contract text itself never touches the chain.
- **Multi-party signing** — every signer confirms on-chain; the contract activates automatically once the last signature lands.
- **Independent verification** — a public page re-reads the hash and signatures directly from the blockchain, from the visitor's own browser, with no dependency on Cachetify's servers.
- **Encrypted storage** — documents are encrypted at rest (AES-256-GCM, one key per document, master key held outside the database).
- **Wallet-free for the user** — Privy provisions and custodies an embedded wallet per account and sponsors gas, so a signer never sees a seed phrase or pays a transaction fee.

## Architecture

A conventional web app (Next.js frontend, Express/PostgreSQL backend) sits in front of a single, deliberately narrow smart contract. Everyday operations — accounts, drafting, encrypted storage, email — stay off-chain; only the proof is public. See [`blockchain/SMART_CONTRACTS.md`](./blockchain/SMART_CONTRACTS.md) for exactly what the contract does and doesn't do.

```
contractify/
├── backend/       Express API, Prisma/PostgreSQL, AI orchestration, document encryption
├── frontend/      Next.js app (App Router)
└── blockchain/    ContractManager.sol + Hardhat tests/deploy scripts
```

A few features — escrow and identity verification (KYC) — exist in the codebase but sit outside the thesis's scope; they're feature-flagged off by default rather than deleted. See `backend/config/index.js`.

## Getting started

**Requirements:** Node 20+, PostgreSQL 14+, an Alchemy API key (Polygon RPC), and a funded Polygon Amoy testnet wallet if you intend to deploy the contract yourself.

```bash
git clone https://github.com/Juste130/contractify.git
cd contractify

cd backend && npm install
cd ../frontend && npm install
```

Copy the env templates and fill them in — never commit the results:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

`backend/.env` needs at minimum `DATABASE_URL`, `MASTER_ENCRYPTION_KEY`, `JWT_SECRET`/`JWT_REFRESH_SECRET`, `ALCHEMY_POLYGON_TESTNET_RPC_URL`, `CONTRACT_MANAGER_ADDRESS`, `ADMIN_WALLET_ADDRESS`, `GROQ_API_KEY`, and `PRIVY_APP_ID`/`PRIVY_APP_SECRET`. The server validates these on boot and refuses to start in production if any are missing — see `backend/config/index.js`. `frontend/.env.local` needs `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_PRIVY_APP_ID`. Anything prefixed `NEXT_PUBLIC_` ships in client-side JS — never put a secret there.

```bash
cd backend
npx prisma migrate dev
npx prisma generate
```

Then, in two terminals:

```bash
cd backend && npm run dev   # http://localhost:5000
cd frontend && npm run dev  # http://localhost:3000
```

## Deployment

Frontend and backend deploy independently.

- **Frontend (Vercel):** Root Directory set to `frontend`. Deploys automatically on push to `main`.
- **Backend (Render + Supabase):** Render builds the API from `backend/Dockerfile`. Supabase provides managed PostgreSQL — use its pooled connection string (port 6543) as `DATABASE_URL` and the direct one (port 5432) as `DIRECT_URL`, since Prisma needs both. Free-tier Render services spin down after 15 minutes idle; the next request takes 30-50s to wake up.
- **CI:** `.github/workflows/ci.yml` runs install, lint, build, and tests on every push/PR — a quality gate, not a deploy trigger. Actual deploys are handled by Vercel's and Render's own GitHub integrations.

## API

Authentication runs entirely through Privy — there's no email/password or OAuth flow. Creating and signing a contract are direct on-chain transactions sent from the frontend through the signer's Privy wallet, not backend endpoints.

| Route | Purpose |
|---|---|
| `POST /api/contracts/draft` | Save a contract draft |
| `POST /api/contracts/draft/:id/deploy` | Mark a draft as deployed on-chain |
| `GET /api/contracts/cached` | List the user's contracts, synced from the blockchain |
| `POST /api/contracts/sync/:contractId` | Re-sync one contract from the chain |
| `GET /api/contracts/:contractId` | Get contract details |

See `backend/routes/` for the complete list (`ai.js`, `ipfs.js`, `user.js`, and others).

## Security

Documents are encrypted at rest (AES-256-GCM, one key per document, the master key kept outside the database); wallet custody is Privy's responsibility, not this app's. Endpoints sit behind rate limiting, Helmet, restricted CORS, and `express-validator` input checks. See [`escrow-onchain-deferred.md`](./escrow-onchain-deferred.md) and [`nft-architecture-deferred.md`](./nft-architecture-deferred.md) for two design decisions made and resolved along the way.

## Testing

```bash
cd blockchain && npx hardhat test   # smart contract
cd backend && npm test              # Jest: AI guardrails, encryption, certificate/verification, escrow, incidents
```

The frontend has no test script configured yet.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for coding standards and the commit/PR workflow.

## License

MIT — see [LICENSE](./LICENSE).

---

Built solo by [@Juste130](https://github.com/Juste130) as the Licence thesis project at IFRI-UAC.
