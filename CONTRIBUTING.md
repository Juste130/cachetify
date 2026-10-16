# Contributing to Cachetify

Notes on the development workflow for this repository — a single full-stack Next.js app, a separate Hardhat project for the smart contract, and shared PostgreSQL/Prisma in between.

## Setup

```bash
git clone https://github.com/Juste130/contractify.git
cd contractify
npm install
cp .env.example .env   # fill in real values, never commit the result
npx prisma migrate dev
npx prisma generate
npm run dev             # http://localhost:3000
```

To work on the smart contract itself:

```bash
cd contracts
npm install
npx hardhat test
```

## Project layout

- `src/app/` — pages and API routes (`app/api/**/route.js`)
- `src/server/` — server-side logic: services, the Prisma client singleton, auth/rate-limit/error helpers (`http.js`)
- `src/components/`, `src/lib/`, `src/hooks/` — client-side React code
- `prisma/` — schema and migrations
- `netlify/functions/` — the scheduled function that keeps the contract cache in sync with the chain
- `contracts/` — the Solidity contract, its tests, and its deploy script (own `package.json`)

## Branching and commits

Work on a branch off `main`, open a PR when ready. Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`), written in the imperative, with a short body explaining *why* when the change isn't self-evident from the diff.

## Before opening a PR

```bash
npm run lint
npm run build
npm test
cd contracts && npx hardhat test
```

## Code style

- JavaScript on the server side (`src/server/`), TypeScript for React components and client-side code — both coexist in this project, that's intentional.
- 4-space indentation, descriptive names, `async`/`await` over raw promises.
- Comment the *why*, not the *what* — a non-obvious constraint or trade-off, not a restatement of the code.
- No `console.log` left in committed code — use the `winston` logger (`src/server/utils/logger.js`) server-side.

## Database changes

Edit `prisma/schema.prisma`, then:

```bash
npx prisma migrate dev --name <description>
```

Commit the generated migration folder under `prisma/migrations/` along with the schema change.

## Questions

Open an issue on the repository.
