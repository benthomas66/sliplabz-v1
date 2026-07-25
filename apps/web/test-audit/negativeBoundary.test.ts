// V1-6a REVISE — NEGATIVE SERVER-ONLY BOUNDARY PROOF (committed, fixture-isolated).
//
// Generates a minimal CLIENT component that imports the SERVER-ONLY database
// module, runs `next build` as a subprocess EXPECTING failure, and asserts
// BOTH a non-zero exit AND the server-only diagnostic naming the offending
// client file (a non-zero exit alone is insufficient — builds fail for typos).
// The temporary fixture is removed in `finally` so a failed assertion cannot
// leave an invalid file in the tree; afterward the valid app must still build.
//
// Run via `npm run audit` (see README). Runs LAST so its build cycles do not
// disturb the serialization server.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const NEXT_BIN = join(APP_DIR, 'node_modules', 'next', 'dist', 'bin', 'next');
const NEG_DIR = join(APP_DIR, 'app', 'audit_negproof'); // a real route so the build compiles it

function build(): { status: number | null; output: string } {
  const r = spawnSync(process.execPath, [NEXT_BIN, 'build', '--webpack'], {
    cwd: APP_DIR, encoding: 'utf8', env: { ...process.env },
  });
  return { status: r.status, output: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
}

test('a client component importing a server-only module FAILS the build for the server-only reason', () => {
  let result: { status: number | null; output: string };
  try {
    mkdirSync(NEG_DIR, { recursive: true });
    writeFileSync(
      join(NEG_DIR, 'page.tsx'),
      `'use client';\n` +
      `// TEMPORARY audit fixture — a CLIENT component importing a SERVER-ONLY module.\n` +
      `import { getBoardPool } from '../../src/lib/server/db';\n` +
      `export default function AuditNegProof() { const p = getBoardPool; return <div>{typeof p}</div>; }\n`,
      'utf8'
    );
    result = build();
  } finally {
    rmSync(NEG_DIR, { recursive: true, force: true }); // guaranteed cleanup
  }

  // (1) non-zero exit.
  assert.notEqual(result.status, 0, `expected a failed build; got status ${result.status}\n${result.output}`);
  // (2) the failure is CAUSED BY the server-only boundary crossing...
  assert.match(result.output, /server-only/i, 'diagnostic did not mention server-only');
  assert.match(result.output, /Server Component/i, 'diagnostic did not mention Server Components');
  // ...and NAMES the offending client file.
  assert.match(result.output, /audit_negproof/, 'diagnostic did not name the offending client file');
});

test('after cleanup the tree is clean and the VALID application still builds', () => {
  assert.ok(!existsSync(NEG_DIR), 'the temporary negproof fixture was not removed');
  const valid = build();
  assert.equal(valid.status, 0, `the valid application failed to build after cleanup\n${valid.output}`);
});
