// V1-4b Stage 2 Phase B — write the 15 approved odds_api → internal team
// mappings, per governor mapping ruling of 2026-07-12.
//
// Uses V1-1 mapping-layer primitives:
//   * buildMappingHistoryEvent (src/identity/mappingHistory.ts) constructs
//     the append-only audit event. The caller INSERTs it verbatim.
//   * The provider_teams schema enforces mapping_state and its dependent
//     CHECKs; we go through INSERT-with-state, not raw UPDATE-of-state.
//
// Idempotency: the script is safe to rerun. It skips any provider_string
// whose (provider, provider_team_id) row already exists for provider=
// 'odds_api'; the mapping_history append is guarded by "already terminal
// at approved" so a rerun produces no duplicate audit rows.

import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { buildMappingHistoryEvent } from '../src/identity/mappingHistory.js';

const DB_URL = process.env['SLIPLABZ_HOSTED_DATABASE_URL'];
if (DB_URL === undefined || DB_URL === '') {
  console.error('SLIPLABZ_HOSTED_DATABASE_URL required');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: DB_URL, max: 2 });

// -- Governor ruling of 2026-07-12 (verbatim). ------------------------------

const GOVERNOR_RULING_DATE = '2026-07-12';
const APPROVAL_ACTOR = 'governor:v1_4b_stage2_phase_b_mapping_ruling_2026_07_12';
const APPROVAL_ACTOR_NOTE = 'Governor approved supplement 2 T2 mapping table (2026-07-12): 13 exact matches admitted verbatim; 2 normalized_lastword matches (Portland Fire→Fire, Toronto Tempo→Tempo) admitted as identity-equivalent per BDL §12B.7 expansion-team metadata exception.';

// The 15 approvals. `evidence` is retained for the mapping_history reason
// so a future audit can see WHY the governor accepted each identity.
interface Approval {
  readonly odds_api_provider_string: string;
  readonly internal_display_name: string;
  readonly evidence: 'exact' | 'normalized_lastword';
}
const APPROVALS: ReadonlyArray<Approval> = [
  { odds_api_provider_string: 'Seattle Storm',          internal_display_name: 'Seattle Storm',          evidence: 'exact' },
  { odds_api_provider_string: 'Las Vegas Aces',         internal_display_name: 'Las Vegas Aces',         evidence: 'exact' },
  { odds_api_provider_string: 'Phoenix Mercury',        internal_display_name: 'Phoenix Mercury',        evidence: 'exact' },
  { odds_api_provider_string: 'New York Liberty',       internal_display_name: 'New York Liberty',       evidence: 'exact' },
  { odds_api_provider_string: 'Golden State Valkyries', internal_display_name: 'Golden State Valkyries', evidence: 'exact' },
  { odds_api_provider_string: 'Dallas Wings',           internal_display_name: 'Dallas Wings',           evidence: 'exact' },
  { odds_api_provider_string: 'Minnesota Lynx',         internal_display_name: 'Minnesota Lynx',         evidence: 'exact' },
  { odds_api_provider_string: 'Atlanta Dream',          internal_display_name: 'Atlanta Dream',          evidence: 'exact' },
  { odds_api_provider_string: 'Connecticut Sun',        internal_display_name: 'Connecticut Sun',        evidence: 'exact' },
  { odds_api_provider_string: 'Indiana Fever',          internal_display_name: 'Indiana Fever',          evidence: 'exact' },
  { odds_api_provider_string: 'Portland Fire',          internal_display_name: 'Fire',                   evidence: 'normalized_lastword' },
  { odds_api_provider_string: 'Chicago Sky',            internal_display_name: 'Chicago Sky',            evidence: 'exact' },
  { odds_api_provider_string: 'Toronto Tempo',          internal_display_name: 'Tempo',                  evidence: 'normalized_lastword' },
  { odds_api_provider_string: 'Los Angeles Sparks',     internal_display_name: 'Los Angeles Sparks',     evidence: 'exact' },
  { odds_api_provider_string: 'Washington Mystics',     internal_display_name: 'Washington Mystics',     evidence: 'exact' },
];

async function main(): Promise<void> {
  console.log(`# writing ${APPROVALS.length} approved odds_api provider_teams mappings`);
  console.log(`#   governor ruling date: ${GOVERNOR_RULING_DATE}`);

  // Load the internal_team_id lookup by display_name.
  const teamsRes = await pool.query(
    `SELECT internal_team_id, display_name FROM teams`
  );
  const teamsByDisplay = new Map<string, string>();
  for (const row of teamsRes.rows as Array<{ internal_team_id: string; display_name: string }>) {
    teamsByDisplay.set(row.display_name, row.internal_team_id);
  }

  let inserted = 0;
  let skipped_existing = 0;
  let history_appended = 0;

  // Use an odds_api provider_team_id that identifies the odds_api team by its
  // canonical string. Odds API doesn't publish an opaque numeric team id in
  // the events response — the team STRING is the identity in the payload —
  // so the provider_team_id we adopt is the exact odds_api string. The
  // UNIQUE constraint on (provider, provider_team_id) covers idempotency.
  for (const a of APPROVALS) {
    const internal_team_id = teamsByDisplay.get(a.internal_display_name) ?? null;
    if (internal_team_id === null) {
      console.log(`# SKIP: internal team display_name '${a.internal_display_name}' not found; ` +
        `odds_api approval for '${a.odds_api_provider_string}' cannot proceed.`);
      continue;
    }
    // Check for existing row.
    const existing = await pool.query(
      `SELECT provider_team_row_id, internal_team_id, mapping_state
         FROM provider_teams
         WHERE provider='odds_api' AND provider_team_id=$1`,
      [a.odds_api_provider_string]
    );
    if ((existing.rowCount ?? 0) > 0) {
      const row = existing.rows[0] as { internal_team_id: string | null; mapping_state: string };
      if (row.mapping_state === 'approved' && row.internal_team_id === internal_team_id) {
        console.log(`# already approved: odds_api '${a.odds_api_provider_string}' → ${a.internal_display_name}`);
        skipped_existing += 1;
        continue;
      }
      throw new Error(
        `unexpected pre-existing odds_api provider_teams row for '${a.odds_api_provider_string}' ` +
        `with mapping_state='${row.mapping_state}' → refusing to overwrite; governor must resolve`
      );
    }
    // INSERT the new approved mapping — through the schema layer's INSERT
    // path with mapping_state='approved'. NOT a raw UPDATE of an existing
    // row (which would bypass the mapping-layer invariants).
    const rowId = randomUUID();
    await pool.query(
      `INSERT INTO provider_teams
         (provider_team_row_id, provider, provider_team_id, internal_team_id,
          raw_full_name, raw_name, raw_abbreviation, raw_city, raw_conference,
          classification, mapping_state, content_hash)
       VALUES ($1,'odds_api',$2,$3,$4,$4,'','','','current_franchise','approved',$5)`,
      [rowId, a.odds_api_provider_string, internal_team_id, a.odds_api_provider_string, `oa_governor_${GOVERNOR_RULING_DATE}`]
    );
    inserted += 1;

    // Build mapping_history event via V1-1 primitive.
    const event = buildMappingHistoryEvent({
      provider: 'odds_api',
      entity_kind: 'team',
      provider_entity_id: a.odds_api_provider_string,
      action: 'approved',
      internal_entity_id: internal_team_id,
      reason: `governor_mapping_ruling_${GOVERNOR_RULING_DATE}_evidence=${a.evidence}`,
      actor: APPROVAL_ACTOR,
      actor_note: APPROVAL_ACTOR_NOTE,
    });
    await pool.query(
      `INSERT INTO mapping_history
         (provider, entity_kind, provider_entity_id, internal_entity_id,
          prior_internal_entity_id, action, reason, mapping_version,
          alias_version, actor, actor_note, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        event.provider,
        event.entity_kind,
        event.provider_entity_id,
        event.internal_entity_id,
        event.prior_internal_entity_id,
        event.action,
        event.reason,
        event.mapping_version,
        event.alias_version,
        event.actor,
        event.actor_note,
        event.created_at,
      ]
    );
    history_appended += 1;
    console.log(`# approved: odds_api '${a.odds_api_provider_string}' → internal ${internal_team_id} (${a.internal_display_name}) [${a.evidence}]`);
  }

  console.log(`\n# result: inserted=${inserted}, skipped_existing=${skipped_existing}, history_appended=${history_appended}`);

  // Sanity: confirm 15 approved rows now exist under provider='odds_api'.
  const finalCount = await pool.query(
    `SELECT count(*)::int AS n FROM provider_teams
       WHERE provider='odds_api' AND mapping_state='approved' AND internal_team_id IS NOT NULL`
  );
  console.log(`# hosted DB now: ${(finalCount.rows[0] as { n: number }).n} approved odds_api provider_teams`);
}

main()
  .catch((e) => {
    console.error('# team-approval failed:', e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
