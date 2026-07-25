// SlipLabz V1-6a Board slice — isolated Next.js app.
// Connection rules: see docs/architecture/V1_APP_CONNECTION_RULES.md.
//   * Application runtime uses the Supabase TRANSACTION pooler (port 6543).
//   * The Board data path runs on the Node runtime (Postgres; never edge).
//
// Built with the webpack builder (`next build --webpack`) so the
// `.js`->`.ts` extension aliasing below applies to the consumed backend
// modules. Turbopack is not used for this slice.
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Scope file tracing to THIS app so Next does not infer the repo root from
  // the pre-existing root lockfile.
  outputFileTracingRoot: import.meta.dirname,
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
