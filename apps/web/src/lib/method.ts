// V1-6a — the ONE authoritative active Board method version.
//
// Founder ruling (ACTIVE METHOD VERSION, 2026-07-24): the first Board reads
// `evidence_method_v2` ONLY. The active method is ONE explicit server-side
// constant. It MUST NOT be client-controllable — no query string, cookie,
// header, or client parameter may change it. v1 is preserved for
// auditability, not product presentation.
//
// This module holds no secret and no DB code, so it is import-safe from a
// server component. It is NEVER wired to any client-controllable input.

export const KNOWN_METHOD_VERSIONS = ['evidence_method_v1', 'evidence_method_v2'] as const;
export type MethodVersion = (typeof KNOWN_METHOD_VERSIONS)[number];

/**
 * The active Board method version. A hard-coded constant — not read from a
 * request, header, cookie, or environment variable, so it cannot be
 * influenced by a client.
 */
export const ACTIVE_BOARD_METHOD_VERSION: MethodVersion = 'evidence_method_v2';

/**
 * Fail-loud guard (v2 authority §7 structural fail-loud rule): an
 * unknown/unconfigured method version throws rather than defaulting or
 * falling back. Used at every method boundary so a bad value cannot
 * silently select v1 or an empty result for the wrong reason.
 */
export function assertKnownMethodVersion(m: string): asserts m is MethodVersion {
  if (!(KNOWN_METHOD_VERSIONS as readonly string[]).includes(m)) {
    throw new Error(
      `V1-6a: unknown/unconfigured Board method_version "${m}". ` +
      `Fail-loud (v2 authority §7): no default, no fallback to v1, no empty-on-error.`
    );
  }
}
