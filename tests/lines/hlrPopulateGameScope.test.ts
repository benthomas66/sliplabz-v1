// V1-OP-8c Track 1 — the game-scoped hlr populate path.
//
// Pins the committed `restrict_to_internal_game_ids` scope parameter that the
// `--game` flag on `scripts/v1_4c_phase_b_populate.ts` reuses: it must NARROW
// only, leaving the eligibility SQL, the grain definition, the cursor, and the
// UPSERT untouched, so a grain processed under the restriction is identical to
// the same grain in an unrestricted run.
//
// Zero network, zero database, zero credits.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  runHistoricalLineResultsBackfillInTx,
  HISTORICAL_LINE_RESULTS_BACKFILL_ELIGIBILITY_SQL,
} from '../../src/lines/historicalLineResultsBackfill.js';
import type { Tx } from '../../src/db/transaction.js';

const SCRIPT = readFileSync(new URL('../../scripts/v1_4c_phase_b_populate.ts', import.meta.url), 'utf8');
const GAME = 'ec2c04c9-655c-4de6-8e04-4e8e9933857d';
const OTHER = '11111111-2222-3333-4444-555555555555';

/** Records statements; returns one eligible grain then empties the loop. */
function recordingTx() {
  const stmts: Array<{ sql: string; params: unknown[] }> = [];
  let scans = 0;
  const tx: Tx = {
    query: async (sql: string, params: unknown[] = []) => {
      stmts.push({ sql, params });
      if (/SELECT ccp\.canonical_closing_point_id/.test(sql)) {
        scans += 1;
        if (scans > 1) return { rows: [], rowCount: 0 };
        return {
          rows: [{
            ccp_id: 'ccp-1', internal_game_id: GAME, internal_player_id: 'p-1',
            market_key: 'player_points', canonical_closing_point: '12.5',
            coverage_label: 'complete', canonical_stat_key: 'points',
            pgs_id: 'pgs-1', normalized_stats: { points: 18 },
          }],
          rowCount: 1,
        };
      }
      return { rows: [{ xmax: '0' }], rowCount: 1 };
    },
  };
  return { tx, stmts };
}

describe('V1-OP-8c Track 1 — game-scoped hlr populate', () => {
  it('the restriction is applied as a narrowing conjunct on internal_game_id', async () => {
    const { tx, stmts } = recordingTx();
    await runHistoricalLineResultsBackfillInTx(tx, { restrict_to_internal_game_ids: [GAME] });
    const scan = stmts.find((s) => /SELECT ccp\.canonical_closing_point_id/.test(s.sql));
    assert.ok(scan !== undefined, 'the eligibility scan ran');
    assert.ok(/ccp\.internal_game_id = ANY\(\$\d+::uuid\[\]\)/.test(scan.sql), 'game restriction present');
    assert.ok(scan.params.some((p) => Array.isArray(p) && (p as string[]).includes(GAME)), 'bound to the target game');
    assert.ok(!scan.params.some((p) => Array.isArray(p) && (p as string[]).includes(OTHER)), 'no other game bound');
  });

  it('NARROWING ONLY: the eligibility predicate is byte-identical under restriction', async () => {
    const restricted = recordingTx();
    await runHistoricalLineResultsBackfillInTx(restricted.tx, { restrict_to_internal_game_ids: [GAME] });
    const unrestricted = recordingTx();
    await runHistoricalLineResultsBackfillInTx(unrestricted.tx, {});

    const scanOf = (s: typeof restricted) => s.stmts.find((x) => /SELECT ccp\.canonical_closing_point_id/.test(x.sql))!.sql;
    const a = scanOf(restricted);
    const b = scanOf(unrestricted);
    // the committed eligibility SQL appears verbatim in BOTH
    for (const sql of [a, b]) {
      assert.ok(sql.includes(HISTORICAL_LINE_RESULTS_BACKFILL_ELIGIBILITY_SQL.split('\n')[0]!.trim()),
        'committed eligibility predicate present');
      assert.ok(/ccp\.canonical_closing_point IS NOT NULL/.test(sql));
      assert.ok(/pgs\.eligibility_state = 'eligible'/.test(sql));
    }
    // the ONLY difference is the added conjunct
    assert.ok(/internal_game_id = ANY/.test(a), 'restricted form has the conjunct');
    assert.ok(!/internal_game_id = ANY/.test(b), 'unrestricted form does not');
    assert.equal(a.replace(/\s*AND ccp\.internal_game_id = ANY\(\$\d+::uuid\[\]\)/, ''), b,
      'removing the conjunct yields the byte-identical unrestricted query');
  });

  it('the UPSERT and grain are unchanged by the restriction', async () => {
    const { tx, stmts } = recordingTx();
    await runHistoricalLineResultsBackfillInTx(tx, { restrict_to_internal_game_ids: [GAME] });
    const ups = stmts.find((s) => /INSERT INTO historical_line_results/.test(s.sql));
    assert.ok(ups !== undefined, 'hlr UPSERT issued');
    assert.ok(/ON CONFLICT/.test(ups.sql), 'version-aware UPSERT retained');
    assert.ok(ups.params.includes(GAME), 'row belongs to the target game');
  });

  it('an empty restriction keeps the historical GLOBAL behaviour', async () => {
    const { tx, stmts } = recordingTx();
    await runHistoricalLineResultsBackfillInTx(tx, { restrict_to_internal_game_ids: [] });
    const scan = stmts.find((s) => /SELECT ccp\.canonical_closing_point_id/.test(s.sql))!;
    assert.ok(!/internal_game_id = ANY/.test(scan.sql), 'empty array does not narrow');
  });

  it('the operator entry exposes --game, repeatable, reusing the committed param', () => {
    assert.ok(/a === '--game'/.test(SCRIPT), '--game parsed');
    assert.ok(/games\.push\(v\.trim\(\)\)/.test(SCRIPT), 'repeatable (accumulates)');
    assert.ok(/--game requires a non-empty internal_game_id/.test(SCRIPT), 'rejects a blank value');
    assert.ok(/restrict_to_internal_game_ids: args\.games/.test(SCRIPT), 'reuses the committed scope parameter');
    assert.ok(/args\.games\.length > 0 \?/.test(SCRIPT), 'omitting the flag leaves the global behaviour');
  });
});
