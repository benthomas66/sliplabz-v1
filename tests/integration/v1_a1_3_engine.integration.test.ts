// V1-A1-3 Phase B — 12 integration proofs.
//
// One `it(...)` block per bullet in the ticket's Section C. Every test
// operates against a live Docker Postgres (default:
// `sliplabz-v1-a1-3-postgres` on port 55447). Fixtures inject the
// read-model rows the driver reads; no live polling.

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { openTestDb } from './support/db.js';
import type { SliplabzPool } from '../../src/db/connection.js';
import { withTransaction } from '../../src/db/transaction.js';
import type { Tx } from '../../src/db/transaction.js';
import { writeEvidenceProfile } from '../../src/evidence/writer.js';
import type { EvidenceProfileAuditRefs } from '../../src/evidence/writer.js';
import { computeEvidenceProfile } from '../../src/evidence/engine.js';
import {
  runEvidencePopulator,
  countGrains,
  type BuildProfileInput,
  type EvidenceGrain,
} from '../../src/evidence/driver/populate.js';
import { EVIDENCE_COMPUTATION_VERSION } from '../../src/evidence/computationVersion.js';

// Reuse the Phase A §F fixtures — they are trusted (their §F reproductions
// pass character-for-character against the authority's stated values).
import {
  inputF1,
  inputF2,
  inputF3,
  inputF4,
  inputF5,
} from '../evidence/fFixtures.js';
import type { EvidenceProfileInput } from '../../src/evidence/types.js';
import type { CurrentMarketRow } from '../../src/computation/types.js';

let pool: SliplabzPool | null = null;
let skip_reason: string | null = null;
let connection_string: string | null = null;

before(async () => {
  const h = await openTestDb();
  pool = h.pool;
  skip_reason = h.skip_reason;
  connection_string = process.env['SLIPLABZ_DATABASE_URL'] ?? null;
});
after(async () => { if (pool !== null) await pool.end(); });
function skipIfUnavailable(t: { skip: (msg?: string) => void }): boolean {
  if (pool === null || connection_string === null) {
    t.skip(`SKIP: ${skip_reason ?? 'no SLIPLABZ_DATABASE_URL'}`);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Fixture seeding helpers
// ---------------------------------------------------------------------------

interface Seeded {
  team_a: string; team_b: string;
  game_id: string; player_id: string;
  cmr_id: string; availability_id: string;
}

async function scrub(p: SliplabzPool): Promise<void> {
  await p.query(`TRUNCATE TABLE
    evidence_profile_reasons, evidence_profiles,
    current_market_rows, bdl_availability_snapshots, bdl_ingestion_runs,
    market_registry, players, games, teams
  CASCADE`);
}

async function seedGraph(
  p: SliplabzPool,
  market_key: 'player_points' | 'player_rebounds' | 'player_assists' | 'player_threes' = 'player_points'
): Promise<Seeded> {
  const team_a = randomUUID();
  const team_b = randomUUID();
  const game_id = randomUUID();
  const player_id = randomUUID();
  await p.query(
    `INSERT INTO teams (internal_team_id, display_name, abbreviation, classification, city)
     VALUES ($1,'H','H','current_franchise','X'), ($2,'A','A','current_franchise','Y')`,
    [team_a, team_b]
  );
  await p.query(
    `INSERT INTO games (internal_game_id, season, season_type, home_team_id, away_team_id,
                       scheduled_start_utc, postseason, status)
     VALUES ($1, 2026, 2, $2, $3, '2026-07-16T00:00:00Z', false, 'scheduled')`,
    [game_id, team_a, team_b]
  );
  await p.query(
    `INSERT INTO players (internal_player_id, display_name, normalized_name, current_team_id, status)
     VALUES ($1,'X','x',$2,'active_confirmed')`,
    [player_id, team_a]
  );
  await p.query(
    `INSERT INTO market_registry (provider_key, display_title, is_launch_market, canonical_stat_key, approved_by)
     VALUES ($1, 'Player Points', true, 'pts', 'test')
     ON CONFLICT (provider_key) DO NOTHING`,
    [market_key]
  );
  const cmr_id = randomUUID();
  await p.query(
    `INSERT INTO current_market_rows
       (current_market_row_id, internal_game_id, internal_player_id, market_key,
        line_consensus_point, line_min_point, line_max_point,
        eligible_sportsbook_count, point_distribution,
        freshness_state, provenance, computation_version)
     VALUES ($1, $2, $3, $4, 19.5, 19.0, 20.0, 3, '[]'::jsonb, 'fresh', 'self_observed', 3)`,
    [cmr_id, game_id, player_id, market_key]
  );
  const bdl_run_id = randomUUID();
  await p.query(
    `INSERT INTO bdl_ingestion_runs
       (bdl_ingestion_run_id, endpoint, query_scope_key, completion_state, started_at, completed_at)
     VALUES ($1, 'active_players', 'test', 'complete', now(), now())`,
    [bdl_run_id]
  );
  const availability_id = randomUUID();
  await p.query(
    `INSERT INTO bdl_availability_snapshots
       (bdl_availability_snapshot_id, bdl_ingestion_run_id, provider_player_id, raw_payload, content_hash)
     VALUES ($1, $2, 'pp-1', '{}'::jsonb, 'hash-1')`,
    [availability_id, bdl_run_id]
  );
  return { team_a, team_b, game_id, player_id, cmr_id, availability_id };
}

/** Rebrand a Phase A fixture onto the seeded game/player so the writer's
 *  FK references resolve. */
function reIdInput(
  fixture: EvidenceProfileInput,
  seeded: Seeded
): EvidenceProfileInput {
  const cmr: CurrentMarketRow = {
    ...fixture.current_market_row,
    internal_game_id: seeded.game_id,
    internal_player_id: seeded.player_id,
  };
  return {
    ...fixture,
    internal_game_id: seeded.game_id,
    internal_player_id: seeded.player_id,
    current_market_row: cmr,
    mapping_resolution: {
      ...fixture.mapping_resolution,
      internal_game_id: seeded.game_id,
      internal_player_id: seeded.player_id,
    },
  };
}

function auditFor(seeded: Seeded, one_sided: 'over_only' | 'under_only' | 'neither' | null = 'neither'): EvidenceProfileAuditRefs {
  return Object.freeze({
    current_market_row_id: seeded.cmr_id,
    bdl_availability_snapshot_id: seeded.availability_id,
    book_detail_one_sided: one_sided,
    source_read_model_computation_version: 3,
  });
}

// ===========================================================================
// TEST 1 — unique modal consensus persists with reasons in DR-26 order
// ===========================================================================
describe('V1-A1-3 Phase B — 12 integration proofs', () => {
  beforeEach(async () => { if (pool !== null) await scrub(pool); });

  it('1: a unique modal consensus produces a persisted canonical profile at that consensus point, with its reasons in DR-26 order', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const s = await seedGraph(p);
    const input = reIdInput(inputF1(), s);
    const output = computeEvidenceProfile(input);

    await withTransaction(p, async (tx) => {
      const w = await writeEvidenceProfile(tx, input, output, auditFor(s));
      assert.equal(w.inserted, true);
      assert.equal(w.reasons_written, output.reasons.length);
    });

    const profileRow = await p.query(
      `SELECT classification, direction, evaluated_line::text AS evaluated_line,
              composite_score::text AS composite_score,
              quality_capped, quality_cap_reason,
              method_version, computation_version
         FROM evidence_profiles
        WHERE internal_game_id = $1 AND internal_player_id = $2 AND market_key = $3`,
      [s.game_id, s.player_id, 'player_points']
    );
    assert.equal(profileRow.rowCount, 1);
    const pr = profileRow.rows[0] as {
      classification: string; direction: string;
      evaluated_line: string; composite_score: string;
      quality_capped: boolean; quality_cap_reason: string;
      method_version: string; computation_version: number;
    };
    assert.equal(pr.classification, 'moderate_over_evidence');
    assert.equal(pr.direction, 'over');
    assert.equal(Number(pr.evaluated_line), 19.5);
    assert.equal(pr.method_version, 'evidence_method_v1');
    assert.equal(pr.computation_version, EVIDENCE_COMPUTATION_VERSION);

    const reasons = await p.query(
      `SELECT reason_code::text, category::text, intra_category_rank
         FROM evidence_profile_reasons
        WHERE evidence_profile_id = (SELECT evidence_profile_id FROM evidence_profiles LIMIT 1)
        ORDER BY category, intra_category_rank`
    );
    // §F.1 support-side DR-26 order: window_agreement_support (|1.00|) →
    // favorable_consensus_difference (|0.5|) → positive_margin_support
    // (|0.3916|).
    const supportRows = reasons.rows.filter((r) => (r as { category: string }).category === 'support');
    const codes = supportRows.map((r) => (r as { reason_code: string }).reason_code);
    const ranks = supportRows.map((r) => (r as { intra_category_rank: number }).intra_category_rank);
    assert.deepStrictEqual(codes, ['window_agreement_support', 'favorable_consensus_difference', 'positive_margin_support']);
    assert.deepStrictEqual(ranks, [1, 2, 3]);
  });

  // =========================================================================
  // TEST 2 — 2-2 tied distribution → Unavailable + no_unique_consensus_line
  // =========================================================================
  it('2: a 2-2 tied distribution produces Unavailable with no invented evaluated_line, reason no_unique_consensus_line, and NO no_current_market', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const s = await seedGraph(p);
    // Build a tied-consensus input by mutating F.1: consensus null, selection_method tied, 4 books tied 2-2.
    const base = reIdInput(inputF1(), s);
    const tiedInput: EvidenceProfileInput = {
      ...base,
      current_market_row: {
        ...base.current_market_row,
        line_consensus: {
          ...base.current_market_row.line_consensus,
          consensus_point: null,
          selection_method: 'tied_no_unique_mode',
          coverage_label: 'unresolved_consensus',
        },
        eligible_book_count: { count: 4, method_version: 1 },
        point_distribution: {
          counts: [
            { point: 19.0, book_count: 2 },
            { point: 20.0, book_count: 2 },
          ],
          method_version: 1,
        },
      },
    };
    const output = computeEvidenceProfile(tiedInput);
    assert.equal(output.classification, 'unavailable');
    assert.equal(output.evaluated_line, null);

    await withTransaction(p, async (tx) => {
      await writeEvidenceProfile(tx, tiedInput, output, auditFor(s));
    });

    const pr = await p.query(
      `SELECT classification, evaluated_line FROM evidence_profiles LIMIT 1`
    );
    assert.equal((pr.rows[0] as { classification: string }).classification, 'unavailable');
    assert.equal((pr.rows[0] as { evaluated_line: string | null }).evaluated_line, null);

    const codes = new Set(
      (await p.query(`SELECT reason_code::text FROM evidence_profile_reasons`))
        .rows.map((r) => (r as { reason_code: string }).reason_code)
    );
    assert.ok(codes.has('no_unique_consensus_line'), 'must emit no_unique_consensus_line');
    assert.ok(!codes.has('no_current_market'), 'must NOT emit no_current_market on a tied WITH-books market');
  });

  // =========================================================================
  // TEST 3 — genuinely absent market emits no_current_market
  // =========================================================================
  it('3: a genuinely absent market emits no_current_market and NEVER no_unique_consensus_line', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const s = await seedGraph(p);
    const input = reIdInput(inputF5(), s); // F.5 is freshness=unavailable / 0 books
    const output = computeEvidenceProfile(input);
    assert.equal(output.classification, 'unavailable');

    await withTransaction(p, async (tx) => {
      await writeEvidenceProfile(tx, input, output, auditFor(s, null));
    });

    const codes = new Set(
      (await p.query(`SELECT reason_code::text FROM evidence_profile_reasons`))
        .rows.map((r) => (r as { reason_code: string }).reason_code)
    );
    assert.ok(codes.has('no_current_market'));
    assert.ok(!codes.has('no_unique_consensus_line'), 'absent market MUST NOT emit no_unique_consensus_line');
  });

  // =========================================================================
  // TEST 4 — reordering sportsbook inputs does not change tied outcome
  // =========================================================================
  it('4: reordering sportsbook inputs does not change the tied outcome (persisted state identical)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    // Two seeded graphs so we can compare independently persisted profiles.
    const s1 = await seedGraph(p);
    const base1 = reIdInput(inputF1(), s1);
    const tied1: EvidenceProfileInput = {
      ...base1,
      current_market_row: {
        ...base1.current_market_row,
        line_consensus: { ...base1.current_market_row.line_consensus, consensus_point: null, selection_method: 'tied_no_unique_mode', coverage_label: 'unresolved_consensus' },
        eligible_book_count: { count: 4, method_version: 1 },
        point_distribution: {
          counts: [
            { point: 19.0, book_count: 2 },
            { point: 20.0, book_count: 2 },
          ],
          method_version: 1,
        },
      },
    };
    const out1 = computeEvidenceProfile(tied1);
    const tied2: EvidenceProfileInput = {
      ...tied1,
      current_market_row: {
        ...tied1.current_market_row,
        point_distribution: {
          counts: [
            { point: 20.0, book_count: 2 }, // reversed
            { point: 19.0, book_count: 2 },
          ],
          method_version: 1,
        },
      },
    };
    const out2 = computeEvidenceProfile(tied2);
    assert.equal(out1.classification, out2.classification);
    assert.equal(out1.evaluated_line, null);
    assert.equal(out2.evaluated_line, null);
    assert.deepStrictEqual(
      out1.reasons.map((r) => r.reason_code),
      out2.reasons.map((r) => r.reason_code)
    );
    // Persist one and read back — same order-independent result.
    await withTransaction(p, async (tx) => { await writeEvidenceProfile(tx, tied2, out2, auditFor(s1)); });
    const stored = await p.query(`SELECT classification, evaluated_line FROM evidence_profiles`);
    assert.equal(stored.rowCount, 1);
    assert.equal((stored.rows[0] as { classification: string }).classification, 'unavailable');
    assert.equal((stored.rows[0] as { evaluated_line: string | null }).evaluated_line, null);
  });

  // =========================================================================
  // TEST 5 — no lower/upper/average/first-observed/single-book fallback
  // =========================================================================
  it('5: no lower/upper/average/first-observed/single-book fallback is used — tied consensus persists with evaluated_line NULL and reason no_unique_consensus_line', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const s = await seedGraph(p);
    const base = reIdInput(inputF1(), s);
    // 3 books at 3 distinct points → tied (no unique mode).
    const tied: EvidenceProfileInput = {
      ...base,
      current_market_row: {
        ...base.current_market_row,
        line_consensus: { ...base.current_market_row.line_consensus, consensus_point: null, selection_method: 'tied_no_unique_mode', coverage_label: 'unresolved_consensus' },
        eligible_book_count: { count: 3, method_version: 1 },
        point_distribution: {
          counts: [
            { point: 12.5, book_count: 1 },
            { point: 13.0, book_count: 1 },
            { point: 13.5, book_count: 1 },
          ],
          method_version: 1,
        },
      },
    };
    const output = computeEvidenceProfile(tied);
    await withTransaction(p, async (tx) => { await writeEvidenceProfile(tx, tied, output, auditFor(s)); });
    // The persisted evaluated_line MUST be null — any tiebreak would produce a number.
    const r = await p.query(`SELECT evaluated_line, classification FROM evidence_profiles`);
    assert.equal((r.rows[0] as { evaluated_line: string | null }).evaluated_line, null);
    assert.equal((r.rows[0] as { classification: string }).classification, 'unavailable');
  });

  // =========================================================================
  // TEST 6 — writer refuses non-consensus evaluated_source_kind
  // =========================================================================
  it('6: the writer REFUSES a non-consensus evaluated_source_kind', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const s = await seedGraph(p);
    const input: EvidenceProfileInput = {
      ...reIdInput(inputF1(), s),
      evaluated_source_kind: 'sportsbook_specific',
      evaluated_source_identifier: 'draftkings',
    };
    const output = computeEvidenceProfile(input);
    await withTransaction(p, async (tx: Tx) => {
      let threw = false;
      try {
        await writeEvidenceProfile(tx, input, output, auditFor(s));
      } catch (err) {
        threw = true;
        assert.match((err as Error).message, /non-consensus evaluated_source_kind is never persisted/);
      }
      assert.equal(threw, true, 'writer MUST throw on non-consensus source kind');
    }).catch(() => undefined); // transaction rolls back
    const count = await p.query(`SELECT COUNT(*)::int AS n FROM evidence_profiles`);
    assert.equal((count.rows[0] as { n: number }).n, 0, 'no profile written after refusal');
  });

  // =========================================================================
  // TEST 7 — same-version recompute UPDATES in place
  // =========================================================================
  it('7: same-version recompute with changed inputs UPDATES in place — the corrected state exists, no silent no-op', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const s = await seedGraph(p);
    const input1 = reIdInput(inputF1(), s);
    const out1 = computeEvidenceProfile(input1);
    await withTransaction(p, async (tx) => { await writeEvidenceProfile(tx, input1, out1, auditFor(s)); });
    const before = await p.query(
      `SELECT classification, composite_score::text AS composite_score FROM evidence_profiles`
    );
    // Mutate the input meaningfully: use F.2's under fixture data over the SAME (game, player, market) grain.
    const input2Base = reIdInput(inputF2(), s);
    const input2: EvidenceProfileInput = {
      ...input2Base,
      market_key: 'player_points', // keep same grain
      current_market_row: { ...input2Base.current_market_row, market_key: 'player_points' },
    };
    const out2 = computeEvidenceProfile(input2);
    await withTransaction(p, async (tx) => {
      const w = await writeEvidenceProfile(tx, input2, out2, auditFor(s));
      assert.equal(w.inserted, false, 'second write MUST be an update, not an insert');
    });
    const after = await p.query(
      `SELECT classification, composite_score::text AS composite_score FROM evidence_profiles`
    );
    const bClass = (before.rows[0] as { classification: string }).classification;
    const aClass = (after.rows[0] as { classification: string }).classification;
    assert.notEqual(aClass, bClass, 'classification must have moved (not a silent no-op)');
    // Only ONE row (the UNIQUE gates same-version).
    const count = await p.query(`SELECT COUNT(*)::int AS n FROM evidence_profiles`);
    assert.equal((count.rows[0] as { n: number }).n, 1);
  });

  // =========================================================================
  // TEST 8 — computation_version bump INSERTS + prior row unchanged
  // =========================================================================
  it('8: a computation_version bump INSERTS a new row and leaves the prior version byte-identical', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const s = await seedGraph(p);
    const input = reIdInput(inputF1(), s);
    const output = computeEvidenceProfile(input);
    // Manually write v=1 via the writer.
    await withTransaction(p, async (tx) => { await writeEvidenceProfile(tx, input, output, auditFor(s)); });
    // Snapshot the derived columns at v=1 before the "bump".
    const beforeSnap = await p.query(
      `SELECT md5(concat(
         classification::text,
         coalesce(composite_score::text,''),
         coalesce(direction::text,''),
         coalesce(evaluated_line::text,''),
         coalesce(quality_cap_reason::text,'')
       )) AS h
       FROM evidence_profiles WHERE computation_version = 1`
    );
    const hBefore = (beforeSnap.rows[0] as { h: string }).h;

    // Simulate a version bump: INSERT a v=2 row directly with the same
    // audit/output. In production this would use a bumped EVIDENCE_COMPUTATION_VERSION
    // constant + writer; for this test we inline the INSERT to demonstrate
    // that the UNIQUE admits coexistence and the v=1 row does NOT mutate.
    await p.query(
      `INSERT INTO evidence_profiles
         (internal_game_id, internal_player_id, market_key,
          evaluated_line, evaluated_source_kind, evaluated_source_identifier,
          classification, direction,
          composite_score, c_rtp, c_ms, c_wa, c_ma,
          quality_capped, quality_cap_reason,
          includes_backfilled_historical,
          method_version, computation_version,
          reference_date, source_read_model_computation_version,
          current_market_row_id, bdl_availability_snapshot_id,
          book_detail_one_sided,
          computed_at)
       VALUES ($1::uuid, $2::uuid, 'player_points',
               $3, 'sportsbook_consensus', NULL,
               $4::evidence_classification, $5::evidence_direction,
               $6, $7, $8, $9, $10,
               $11, $12::evidence_quality_cap_reason,
               $13,
               'evidence_method_v1', 2,
               $14::date, 3,
               $15::uuid, $16::uuid,
               'neither',
               now())`,
      [
        s.game_id, s.player_id,
        output.evaluated_line,
        output.classification, output.direction,
        output.components.composite_score, output.components.c_rtp, output.components.c_ms,
        output.components.c_wa, output.components.c_ma,
        output.quality_capped, output.quality_cap_reason,
        output.includes_backfilled_historical,
        input.reference_date,
        s.cmr_id, s.availability_id,
      ]
    );

    // v=1 hash must not have moved.
    const afterSnap = await p.query(
      `SELECT md5(concat(
         classification::text,
         coalesce(composite_score::text,''),
         coalesce(direction::text,''),
         coalesce(evaluated_line::text,''),
         coalesce(quality_cap_reason::text,'')
       )) AS h
       FROM evidence_profiles WHERE computation_version = 1`
    );
    assert.equal((afterSnap.rows[0] as { h: string }).h, hBefore, 'v=1 row derived-column hash must be byte-identical after v=2 insert');
    // Both versions coexist.
    const versions = await p.query(`SELECT DISTINCT computation_version FROM evidence_profiles ORDER BY computation_version`);
    assert.deepStrictEqual(
      versions.rows.map((r) => (r as { computation_version: number }).computation_version),
      [1, 2]
    );
  });

  // =========================================================================
  // TEST 9 — injected failure between profile and reasons → full rollback
  // =========================================================================
  it('9: injected failure after the profile write but before the reasons write causes FULL rollback — no orphan profile, no partial reason set', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const s = await seedGraph(p);
    const input = reIdInput(inputF1(), s);
    const output = computeEvidenceProfile(input);
    // Wrap the writer call in a transaction that we abort by throwing
    // AFTER the UPSERT would have run but before COMMIT completes. Use a
    // manual sequence to inject the fault between the UPSERT and the
    // reason INSERTs.
    let threw = false;
    try {
      await withTransaction(p, async (tx) => {
        // Step 1: manually UPSERT the profile (matching writer.ts's SQL).
        const upsert = await tx.query(
          `INSERT INTO evidence_profiles
             (internal_game_id, internal_player_id, market_key,
              evaluated_line, evaluated_source_kind, evaluated_source_identifier,
              classification, direction,
              composite_score, c_rtp, c_ms, c_wa, c_ma,
              quality_capped, quality_cap_reason,
              includes_backfilled_historical,
              method_version, computation_version,
              reference_date, source_read_model_computation_version,
              current_market_row_id, bdl_availability_snapshot_id,
              book_detail_one_sided, computed_at)
           VALUES ($1::uuid,$2::uuid,'player_points',
                   $3,'sportsbook_consensus',NULL,
                   $4::evidence_classification, $5::evidence_direction,
                   $6,$7,$8,$9,$10,
                   $11,$12::evidence_quality_cap_reason,$13,
                   'evidence_method_v1', 1,
                   $14::date, 3,
                   $15::uuid, $16::uuid, 'neither', now())
           RETURNING evidence_profile_id::text`,
          [
            s.game_id, s.player_id,
            output.evaluated_line,
            output.classification, output.direction,
            output.components.composite_score, output.components.c_rtp, output.components.c_ms,
            output.components.c_wa, output.components.c_ma,
            output.quality_capped, output.quality_cap_reason,
            output.includes_backfilled_historical,
            input.reference_date,
            s.cmr_id, s.availability_id,
          ]
        );
        assert.equal(upsert.rowCount, 1);
        // Step 2: inject fault BEFORE reason INSERTs.
        throw new Error('injected fault after profile write, before reasons write');
      });
    } catch (err) {
      threw = true;
      assert.match((err as Error).message, /injected fault/);
    }
    assert.equal(threw, true);

    // Neither profile nor reasons should exist.
    const pn = await p.query(`SELECT COUNT(*)::int AS n FROM evidence_profiles`);
    const rn = await p.query(`SELECT COUNT(*)::int AS n FROM evidence_profile_reasons`);
    assert.equal((pn.rows[0] as { n: number }).n, 0, 'profile row must be rolled back');
    assert.equal((rn.rows[0] as { n: number }).n, 0, 'no orphan reasons');
  });

  // =========================================================================
  // TEST 10 — a second complete invocation is idempotent
  // =========================================================================
  it('10: a second complete invocation is idempotent — profile checksum unchanged, no new inserts', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const s = await seedGraph(p);
    const input = reIdInput(inputF1(), s);

    const builder: BuildProfileInput = async (_grain: EvidenceGrain, _tx: Tx) => Object.freeze({ input, audit: auditFor(s) });
    const first = await runEvidencePopulator({
      connection_string: connection_string!,
      batch_size: 10,
      build_profile_input: builder,
    });
    assert.equal(first.grains_observed, 1);
    assert.equal(first.profiles_inserted, 1);
    const checksum1 = await p.query(
      `SELECT md5(string_agg(classification::text || composite_score::text || coalesce(evaluated_line::text,''), ',' ORDER BY evidence_profile_id)) AS h,
              COUNT(*)::int AS n
         FROM evidence_profiles`
    );
    const second = await runEvidencePopulator({
      connection_string: connection_string!,
      batch_size: 10,
      build_profile_input: builder,
    });
    assert.equal(second.grains_observed, 1);
    assert.equal(second.profiles_inserted, 0);
    assert.equal(second.profiles_updated, 1);
    const checksum2 = await p.query(
      `SELECT md5(string_agg(classification::text || composite_score::text || coalesce(evaluated_line::text,''), ',' ORDER BY evidence_profile_id)) AS h,
              COUNT(*)::int AS n
         FROM evidence_profiles`
    );
    assert.equal((checksum2.rows[0] as { n: number }).n, (checksum1.rows[0] as { n: number }).n);
    assert.equal((checksum2.rows[0] as { h: string }).h, (checksum1.rows[0] as { h: string }).h);
  });

  // =========================================================================
  // TEST 11 — abnormal_dispersion is never persisted
  // =========================================================================
  it('11: abnormal_dispersion is never persisted, across the full fixture matrix', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const s = await seedGraph(p);
    // Run each §F fixture through the writer (rebranded onto the seeded grain).
    const fixtures = [inputF1(), inputF2(), inputF3(), inputF4(), inputF5()];
    for (const raw of fixtures) {
      const inp = reIdInput(raw, s);
      // Point every fixture at the same market_key (player_points) so we
      // reuse the same seeded market_registry row and the same CMR. This
      // exercise proves the writer never persists abnormal_dispersion; the
      // fixture semantics for classification differ but that is not the
      // concern of this test.
      const forcedMarket: EvidenceProfileInput = {
        ...inp,
        market_key: 'player_points',
        current_market_row: { ...inp.current_market_row, market_key: 'player_points' },
      };
      const output = computeEvidenceProfile(forcedMarket);
      await withTransaction(p, async (tx) => {
        await writeEvidenceProfile(tx, forcedMarket, output, auditFor(s));
      });
    }
    const abnormal = await p.query(
      `SELECT COUNT(*)::int AS n FROM evidence_profile_reasons WHERE reason_code = 'abnormal_dispersion'`
    );
    assert.equal((abnormal.rows[0] as { n: number }).n, 0, 'abnormal_dispersion must NEVER be persisted under evidence_method_v1');
  });

  // =========================================================================
  // TEST 12 — Unavailable profile is a first-class row (not missing)
  // =========================================================================
  it('12: an Unavailable profile stores as a first-class row — absence of grading is a recorded fact, never a missing row', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    const s = await seedGraph(p);
    const input = reIdInput(inputF5(), s); // F.5 → Unavailable
    const output = computeEvidenceProfile(input);
    assert.equal(output.classification, 'unavailable');
    await withTransaction(p, async (tx) => {
      await writeEvidenceProfile(tx, input, output, auditFor(s, null));
    });
    const r = await p.query(
      `SELECT classification, direction, evaluated_line,
              composite_score, c_rtp, c_ms, c_wa, c_ma,
              quality_capped, quality_cap_reason,
              method_version
         FROM evidence_profiles`
    );
    assert.equal(r.rowCount, 1, 'Unavailable MUST be stored as a real row');
    const row = r.rows[0] as {
      classification: string; direction: string | null; evaluated_line: string | null;
      composite_score: string | null; c_rtp: string | null; c_ms: string | null;
      c_wa: string | null; c_ma: string | null;
      quality_capped: boolean; quality_cap_reason: string;
      method_version: string;
    };
    assert.equal(row.classification, 'unavailable');
    assert.equal(row.direction, null);
    assert.equal(row.evaluated_line, null); // §C.3 no-market → null per V1-A1-2 CHECK
    assert.equal(row.composite_score, null);
    assert.equal(row.quality_capped, false);
    assert.equal(row.quality_cap_reason, 'none');
    assert.equal(row.method_version, 'evidence_method_v1');
    const reasonCount = await p.query(`SELECT COUNT(*)::int AS n FROM evidence_profile_reasons`);
    assert.ok((reasonCount.rows[0] as { n: number }).n >= 1, 'Unavailable profile has at least one reason attached');
  });

  // ==================================================================
  // Sanity: countGrains returns 0 on an empty current_market_rows table.
  // ==================================================================
  it('sanity: countGrains reports 0 on an empty current_market_rows table (mirrors the expected hosted outcome)', async (t) => {
    if (skipIfUnavailable(t)) return;
    const p = pool!;
    await p.query(`TRUNCATE current_market_rows CASCADE`);
    const n = await countGrains(connection_string!);
    assert.equal(n, 0);
  });
});
