import type { NextConfig } from "next";
import path from "path";

// Stub optional Privy sub-dependencies we don't use (@stripe/crypto for fiat onramp,
// @solana/* for Farcaster Solana). These are pulled in from deep inside
// node_modules/@privy-io/react-auth, which is exactly why the two bundlers below need a
// DIFFERENT alias value format — despite both configs stubbing the same three packages,
// they can't share one constant:
//   - webpack resolves a relative alias target against the *importing* file's directory,
//     not the project root, so a relative path fails as soon as the import comes from deep
//     inside node_modules (as it does here) — it needs an absolute path.
//   - Turbopack's resolveAlias doesn't (yet) resolve absolute Windows filesystem paths
//     ("windows imports are not implemented yet") — it needs a project-relative path instead.
const STUB_MODULE_RELATIVE = "./src/lib/stubs/empty-module.js";
const STUB_MODULE_ABSOLUTE = path.resolve(__dirname, "src/lib/stubs/empty-module.js");
const STUBBED_PACKAGES = [
  "@stripe/crypto",
  "@solana/wallet-adapter-react",
  "@farcaster/mini-app-solana",
];

const nextConfig: NextConfig = {
  // bcrypt ships a prebuilt native .node binding; letting webpack/Turbopack try to bundle it
  // (as it would any other node_modules import reached from a Route Handler) breaks that
  // binding. @prisma/client's query engine binary has the same problem. Both must stay as
  // plain runtime requires instead of being bundled.
  serverExternalPackages: ["bcrypt", "@prisma/client"],
  // `next dev` runs on Turbopack (see package.json's `dev` script) — Turbopack ignores the
  // webpack() function entirely and reads this key instead. `next build`/`start` still run
  // on webpack (Turbopack's build support remains beta as of Next 15.5), so both configs are
  // kept in sync rather than picking one.
  turbopack: {
    resolveAlias: Object.fromEntries(STUBBED_PACKAGES.map((p) => [p, STUB_MODULE_RELATIVE])),
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...Object.fromEntries(STUBBED_PACKAGES.map((p) => [p, STUB_MODULE_ABSOLUTE])),
    };
    return config;
  },
};

export default nextConfig;
