import type { NextConfig } from "next";
import path from "path";

// Stub optional Privy sub-dependencies we don't use (@stripe/crypto for fiat onramp,
// @solana/* for Farcaster Solana). Webpack needs an absolute alias target, Turbopack a
// project-relative one, so the two constants below cannot be merged.
const STUB_MODULE_RELATIVE = "./src/lib/stubs/empty-module.js";
const STUB_MODULE_ABSOLUTE = path.resolve(__dirname, "src/lib/stubs/empty-module.js");
const STUBBED_PACKAGES = [
  "@stripe/crypto",
  "@solana/wallet-adapter-react",
  "@farcaster/mini-app-solana",
];

const nextConfig: NextConfig = {
  // Packages kept as plain runtime requires (not bundled):
  // - bcrypt / @prisma/client: native binaries
  // - @privy-io/server-auth + @hpke/*: dynamic require() that webpack cannot resolve
  // - pdf-parse: same issue
  serverExternalPackages: [
    "bcrypt",
    "@prisma/client",
    "@privy-io/server-auth",
    "@hpke/core",
    "@hpke/common",
    "@hpke/chacha20poly1305",
    "pdf-parse",
  ],
  // Silences the "multiple lockfiles" warning and fixes the tracing root
  outputFileTracingRoot: path.resolve(__dirname),
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