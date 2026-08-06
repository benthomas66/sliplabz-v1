// GAP-45 regression pin — the template must never re-seed a live-invoke flag.
//
// While `ODDSAPI_LIVE_INVOKE` lived in `.env`, sourcing `.env` to supply the API
// key silently opened the environment gate, leaving `--apply` as the only
// barrier to paid spend. The mechanism that put it there was `.env.example`:
// it shipped empty `BDL_LIVE_INVOKE=` / `ODDSAPI_LIVE_INVOKE=` placeholders, so
// every copied `.env` carried the key and invited someone to fill it in.
//
// This pin asserts the template declares NEITHER flag. Mentioning them in a
// comment is fine and intended; ASSIGNING them is not.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const EXAMPLE = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');

/** Assignment lines only — comments may (and should) mention the flags. */
const assignedKeys = (src: string): string[] =>
  src
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#') && l.includes('='))
    .map((l) => l.replace(/^export\s+/, '').split('=')[0]!.trim());

describe('GAP-45 — live-invoke flags are never persisted in the env template', () => {
  it('.env.example ASSIGNS neither live-invoke flag', () => {
    const declared = assignedKeys(EXAMPLE);
    assert.ok(!declared.includes('ODDSAPI_LIVE_INVOKE'), 'ODDSAPI_LIVE_INVOKE must not be assigned');
    assert.ok(!declared.includes('BDL_LIVE_INVOKE'), 'BDL_LIVE_INVOKE must not be assigned');
  });

  it('never seeds an ENABLED flag under any spacing or export form', () => {
    assert.ok(
      !/^\s*(export\s+)?(ODDSAPI|BDL)_LIVE_INVOKE\s*=\s*['"]?1/m.test(EXAMPLE),
      'a copied .env must not arrive with the gate already open',
    );
  });

  it('still DOCUMENTS the flags and the explicit-per-run operator form', () => {
    assert.match(EXAMPLE, /passed EXPLICITLY on the/i, 'the rule is stated in the template');
    assert.match(EXAMPLE, /ODDSAPI_LIVE_INVOKE=1 npx tsx/, 'the operator form is shown');
  });

  it('records that CI is unaffected — the workflow does not read .env', () => {
    assert.match(EXAMPLE, /poll-cycle\.yml/, 'points at the workflow that sets the flag inline');
  });
});
