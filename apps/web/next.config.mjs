// SlipLabz V1-6a Board slice — isolated Next.js app.
// Connection rules: see docs/architecture/V1_APP_CONNECTION_RULES.md.
//   * Application runtime uses the Supabase TRANSACTION pooler (port 6543).
//   * The Board data path runs on the Node runtime (Postgres; never edge).
//
// BUILDER PIN (V1-6b, GAP-15). This app is built with the WEBPACK builder
// (`next build --webpack`) — every `next build` invocation (the `build` and
// `audit` package scripts and the audit tests' subprocess builds) uses the
// SAME flag. WHY the pin exists:
//   (1) Next 16 defaults to Turbopack, which does NOT honour the webpack
//       `extensionAlias` below;
//   (2) that `.js`->`.ts` extensionAlias is the MECHANISM by which this app
//       consumes committed backend modules (dr20Compare, the compact
//       renderer) without duplicating them — it is load-bearing;
//   (3) PARITY: the committed serialization audit's client-bundle scan must
//       run against the SAME builder that produces the deployed artifact, or
//       the scan does not cover what Vercel serves.
// Removing this pin (migrating to Turbopack) is a SEPARATE future ticket
// (GAP-15): it must replace the extensionAlias mechanism with a
// Turbopack-verified equivalent, switch every `next build` invocation
// together, and RE-RUN the full serialization audit under the new builder.
// Do not remove `--webpack` piecemeal.
import path from 'node:path';
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // File-tracing root = the REPOSITORY ROOT (this config lives at apps/web/, so
  // `../../` from here is the repo root). It MUST be the repo root because this
  // app consumes committed backend modules ABOVE its own directory (`../../src`
  // — the compact renderer, dr20Compare). Pointing tracing at the app dir
  // caused Vercel's output collection to look for `.next` at the upload root
  // (the ENOENT of 2026-07-25, V1-6c). Anchoring at the repo root also
  // addresses the original lockfile-inference warning this setting was added
  // for (V1-6a).
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),
  // The consumed backend modules under ../../src (the committed compact
  // renderer, dr20Compare, shared types) use ESM `.js` import specifiers that
  // resolve to `.ts` sources. Teach the bundler that mapping so we consume
  // them without duplicating or modifying them.
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      ...(config.resolve.extensionAlias || {}),
    };
    return config;
  },
  // No `env` block: server secrets must never be inlined into the client bundle.
};
export default nextConfig;
