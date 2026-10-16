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

A single full-stack Next.js app (App Router, API routes included) sits in front of one deliberately narrow smart contract. Everyday operations — accounts, drafting, encrypted storage, email — stay off-chain in Postgres; only the proof is public. See [`contracts/SMART_CONTRACTS.md`](./contracts/SMART_CONTRACTS.md) for exactly what the contract does and doesn't do.

```
cachetify/
├── src/
│   ├── app/        Pages and API routes (app/api/**/route.js)
│   ├── components/ React components
│   ├── lib/        Client-side utilities and API clients
│   └── server/     Server-side logic: services, db client, auth/rate-limit/error helpers
├── prisma/         Schema and migrations (PostgreSQL)
├── netlify/
│   └── functions/  Scheduled function keeping the on-chain contract cache in sync
└── contracts/      ContractManager.sol + Hardhat tests/deploy scripts (its own npm project)
```

`contracts/` is a separate npm project (its own `package.json`, own `node_modules`) — Hardhat's toolchain isn't bundled into the app. It shares the same root `.env`.

A few features — escrow and identity verification (KYC) — exist in the codebase but sit outside the thesis's scope; escrow is feature-flagged off by default rather than deleted. See `src/server/config.js`.

## Getting started

**Requirements:** Node 20+, PostgreSQL 14+, an Alchemy API key (Polygon RPC), and a funded Polygon Amoy testnet wallet if you intend to deploy the contract yourself.

```bash
git clone https://github.com/Juste130/cachetify.git
cd cachetify
npm install
```

Copy the env template and fill it in — never commit the result:

```bash
cp .env.example .env
```

One `.env` for everything: at minimum `DATABASE_URL`, `MASTER_ENCRYPTION_KEY`, `JWT_SECRET`/`JWT_REFRESH_SECRET`, `ALCHEMY_POLYGON_TESTNET_RPC_URL`, `CONTRACT_MANAGER_ADDRESS` (and its client-visible twin `NEXT_PUBLIC_CONTRACT_MANAGER_ADDRESS`), `ADMIN_WALLET_ADDRESS`, `GROQ_API_KEY`, `PRIVY_APP_ID`/`PRIVY_APP_SECRET` (and `NEXT_PUBLIC_PRIVY_APP_ID`). The app validates these on boot and refuses to start in production if any are missing — see `src/server/config.js`. Anything prefixed `NEXT_PUBLIC_` ships in client-side JS — never put a secret there.

```bash
npx prisma migrate dev
npx prisma generate
```

```bash
npm run dev   # http://localhost:3000, frontend and API together
```

## Deployment

One deployable: Netlify builds the Next.js app (`@netlify/plugin-nextjs`) and runs `netlify/functions/` as serverless/scheduled functions — see `netlify.toml`. Set the `.env` variables above as Netlify environment variables (both the plain and `NEXT_PUBLIC_` ones, as needed). `.github/workflows/ci.yml` runs install, lint, build, and tests on every push/PR as a quality gate; the actual deploy is triggered by Netlify's own GitHub integration.

`contracts/` is never deployed with the app — it's a local dev tool for compiling, testing, and deploying the smart contract directly to Polygon (see `contracts/scripts/deploy.ts`).

## API

Authentication runs entirely through Privy — there's no email/password or OAuth flow. Creating and signing a contract are direct on-chain transactions sent from the browser through the signer's Privy wallet, not API routes.

| Route | Purpose |
|---|---|
| `POST /api/contracts/draft` | Save a contract draft |
| `POST /api/contracts/draft/:id/deploy` | Mark a draft as deployed on-chain |
| `GET /api/contracts/cached` | List the user's contracts, synced from the blockchain |
| `POST /api/contracts/sync/:id` | Re-sync one contract from the chain |
| `GET /api/contracts/:id` | Get contract details |

See `src/app/api/` for the complete route tree (`ai/`, `ipfs/`, `users/`, and others).

## Security

Documents are encrypted at rest (AES-256-GCM, one key per document, the master key kept outside the database); wallet custody is Privy's responsibility, not this app's. Endpoints sit behind rate limiting and input validation; frontend and API being same-origin removes an entire class of CORS/cross-site cookie configuration that a split deployment used to need. See [`escrow-onchain-deferred.md`](./escrow-onchain-deferred.md) and [`nft-architecture-deferred.md`](./nft-architecture-deferred.md) for two design decisions made and resolved along the way.

## Testing

```bash
npm test                       # Jest: AI guardrails, encryption, certificate/verification, escrow, incidents
cd contracts && npx hardhat test  # smart contract
```

The frontend has no test script configured yet.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for coding standards and the commit/PR workflow.

## License

MIT — see [LICENSE](./LICENSE).

---

Built solo by [@Juste130](https://github.com/Juste130) as the Licence thesis project at IFRI-UAC.
