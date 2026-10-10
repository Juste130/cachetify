# Cachetify 🔐

A **secure, blockchain-based contract management platform** combining smart contracts with AI-powered contract generation. Fully transparent, decentralized, and built with modern web3 technologies.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15%2B-000000)](https://nextjs.org/)
[![Polygon](https://img.shields.io/badge/Polygon-8247E5)](https://polygon.technology/)

## 🎯 Features

### Core Features
- **🔗 Blockchain-Based Contracts** - Smart contracts on Polygon with cryptographic signatures
- **🤖 AI Contract Generation** - Automatically generate contracts using Groq (GPT-OSS-120B)
- **📝 Contract Management** - Create, sign, and track contracts with full audit trail
- **💎 NFT Proof** - Optional NFT certificate as proof of contract finalization (off by default, `FEATURE_NFT`)
- **👥 Multi-Signer Support** - Multiple parties can sign contracts sequentially
- **📄 Encrypted Document Storage** - Contracts are encrypted at rest (AES-256-GCM, one key per document) rather than stored on IPFS/Pinata
- **🔐 Wallet Management** - Built-in Privy integration with Smart Wallets (ERC-4337) and native gas sponsorship

### Developer Experience
- **TypeScript** - Full type safety across frontend and backend
- **Gas Optimization** - Gasless transactions via Privy Policy Engine (ERC-4337)
- **Rate Limiting** - Protected endpoints with request throttling
- **Error Handling** - Comprehensive error handling and logging
- **Docker Support** - Containerized development environment

## 📋 Prerequisites

- **Node.js** 18+ & npm/yarn
- **PostgreSQL** 14+
- **Redis** (optional, for caching)
- **Alchemy API Key** (for RPC endpoints)
- **Polygon Amoy Testnet** account

## 🚀 Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/cachetify.git
cd cachetify
```

### 2. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend  
cd ../frontend
npm install
```

### 3. Configure Environment

Copy the example files and fill in real values — never commit the results:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

#### Backend - `backend/.env`
```env
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://user:password@localhost:5433/cachetify
MASTER_ENCRYPTION_KEY=your_encryption_key
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_jwt_refresh_secret
ALCHEMY_POLYGON_TESTNET_RPC_URL=your_alchemy_polygon_rpc_url
CONTRACT_MANAGER_ADDRESS=0xyour_deployed_contract_manager_address
ADMIN_WALLET_ADDRESS=0xyour_admin_wallet_address
FUNDER_PRIVATE_KEY=0xyour_testnet_key # (Optional/Legacy for fallback EOA funding)
GROQ_API_KEY=your_groq_api_key
PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_app_secret
```
See `backend/.env.example` for the full list of variables (or `backend/config/index.js` for how they're validated) — the server fails fast on boot in production if any required one is missing.

#### Frontend - `frontend/.env.local`
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
```
See `frontend/.env.example` for the full list. Note that anything prefixed `NEXT_PUBLIC_` is bundled into client-side JS and publicly visible — never put a secret behind that prefix.

### 4. Database Setup

```bash
cd backend
npx prisma migrate dev
npx prisma generate
```

### 5. Start Development Servers

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Contribution guidelines & development workflow |


## 🏗️ Project Structure

```
cachetify/
├── backend/
│   ├── config/              # Configuration
│   ├── controllers/         # Request handlers
│   ├── middleware/          # Express middleware
│   ├── models/              # Database models (Prisma)
│   ├── routes/              # API routes
│   ├── services/            # Business logic
│   ├── utils/               # Utilities
│   └── server.js            # Entry point
├── frontend/
│   ├── src/
│   │   ├── app/            # Next.js app router
│   │   ├── components/     # React components
│   │   ├── contexts/       # Context providers
│   │   ├── hooks/          # Custom hooks
│   │   ├── lib/            # Utilities
│   │   └── types/          # TypeScript types
│   └── public/             # Static assets
└── blockchain/             # Smart contracts (Hardhat)
```

## 🚀 Deployment

The frontend and backend are two separate deployments — this is a monorepo, not a single deployable unit.

### Frontend — Vercel

- **Root Directory:** `frontend` (must be set explicitly in Project Settings → General, since there's no root-level `package.json`)
- **Framework:** Next.js (auto-detected once Root Directory is correct)
- **Environment variables:** set in Project Settings → Environment Variables, scoped per environment (Production/Preview/Development) — see `frontend/.env.example` for the list
- Deploys automatically on every push to `main` via Vercel's native GitHub integration; PRs get their own Preview deployment

### Backend — Render (+ Supabase + Upstash)

Chosen as a genuinely free stack (no credit card required, unlike Railway/Oracle Cloud):

- **Render** hosts the API as a Web Service built from the existing `Dockerfile` (Root Directory: `backend`). Render terminates HTTPS automatically on its own `*.onrender.com` subdomain — no separate reverse proxy or certificate setup needed. Deploys automatically on every push to `main` via Render's GitHub integration.
  - ⚠️ Free-tier services spin down after 15 minutes of inactivity — the first request after a pause takes 30-50s to wake up. Fine for now; upgrade to a paid instance type if that latency becomes a problem for real users.
- **Supabase** provides the managed Postgres instance. Project Settings → Database → Connection string: use the **pooled (Transaction mode, port 6543)** string as `DATABASE_URL` and the **direct (Session mode, port 5432)** string as `DIRECT_URL` — Prisma needs both (pooled for the app, direct for running migrations).
- **Upstash** provides managed Redis — set its connection string as `REDIS_URL` in Render.
- The `postgres`/`redis` services in `backend/docker-compose.yml` remain for **local dev only**; production data lives in Supabase/Upstash, not in Render's container.
- **Environment variables:** set in Render's Environment tab — see `backend/.env.example` for the full list. Generate fresh production values for `FUNDER_PRIVATE_KEY`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `MASTER_ENCRYPTION_KEY`; never reuse local/dev values.
- Once deployed, point the frontend's `NEXT_PUBLIC_API_URL` at the Render URL, and the backend's `FRONTEND_URL`/`API_BASE_URL` back at the Vercel domain (CORS).

### CI/CD

`.github/workflows/ci.yml` runs `npm ci` + lint + build (and tests, once written) for both `backend/` and `frontend/` on every push/PR to `main` and `justedev`. It's a **quality gate only** — it does not deploy anything. Actual deployment is triggered independently by Vercel's and Render's own GitHub integrations on push to `main`. To make CI failures actually block bad deploys, enable a branch protection rule on `main` requiring the `build-and-test` check to pass before merge.

## 🔗 API Endpoints

Authentication is entirely handled by Privy — there is no email/password or Google OAuth flow in this app.

### Authentication
- `POST /api/auth/privy` - Authenticate with a Privy token (email verified server-side)
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout user

### Contracts
- `POST /api/contracts/draft` - Save a contract draft
- `GET /api/contracts/draft/:id` - Get draft details
- `POST /api/contracts/draft/:id/deploy` - Mark a draft as deployed on-chain
- `GET /api/contracts/cached` - List the user's contracts (synced from blockchain)
- `POST /api/contracts/sync/:contractId` - Re-sync one contract from the blockchain
- `POST /api/contracts/sync-all` - Re-sync all of the user's contracts
- `GET /api/contracts/search` - Search contracts
- `GET /api/contracts/:contractId` - Get contract details

Signing a contract and depositing/releasing escrow happen as direct on-chain transactions from the frontend (via the connected Privy wallet), not through the backend API.

See `backend/routes/` for the full list, including `ai.js`, `ipfs.js`, and `user.js`.

## 🛡️ Security

- **Document Encryption at Rest** - Contracts encrypted with AES-256-GCM, one key per document, wrapped by a master key never stored in the database; private key custody is handled entirely by Privy, not by this app
- **JWT Authentication** - Secure token-based auth
- **Rate Limiting** - DDoS protection via request throttling
- **CORS** - Restricted cross-origin access
- **Helmet** - HTTP security headers
- **Input Validation** - Express-validator for all inputs

### Best Practices
- Never commit `.env` files
- Use environment variables for secrets
- Rotate private keys regularly
- Keep dependencies updated

## 💰 Gas Optimization

The platform uses **Privy Smart Wallets (ERC-4337)** and **Gas Sponsorship** to provide gasless transactions to users:

```javascript
// Gas sponsorship is configured natively on the Privy Dashboard (Policy Engine).
// No need for custom backend fund routing for standard smart contract interactions!
```

See the [Privy Dashboard](https://dashboard.privy.io/) for configuring your Gas Policy. (The legacy `ensureFunded` documentation is preserved for fallback EOA wallets).

## 🧪 Testing

```bash
# Smart contracts (real test suite)
cd blockchain
npx hardhat test

# Backend (Jest: AI guardrails, document encryption, certificate/verification endpoints, escrow, incidents)
cd backend
npm test
```

The frontend has no test script configured yet.

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## 📄 License

This project is licensed under the **MIT License** - see [LICENSE](./LICENSE) file.

## 🆘 Support

- 📖 [Documentation](./backend/docs/)
- 🐛 [Report a Bug](https://github.com/Juste130/cachetify/issues)
- 💬 [Discussions](https://github.com/Juste130/cachetify/discussions)

---

**Made by the Cachetify Team**
