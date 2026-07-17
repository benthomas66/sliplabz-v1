// V1-4e STEP 3 — reconcile queued odds_api events via the sanctioned layer.
//
// Consumes: loadSeedResolutionContext, resolveOddsapiEventForSeed,
// persistSeedEventResolution (all from src/seed/orchestrator/eventResolutionForSeed.ts).
// These delegate to V1-1 `reconcileEvent` — the SAME governance that
// produced the 15 approved odds_api→internal team mappings.
//
// The queue rows themselves are not `resolution='resolved'`-updated by any
// committed code path; per STEP 1's audit, no queue-drain writer exists.
// This step therefore focuses on the outcome that matters for aggregation:
// provider_games gains an approved row with a resolved internal_game_id.
// Queue-row hygiene (moving open → resolved) is flagged as a follow-up.

import { openPool } from '../src/db/connection.js';
import {
  loadSeedResolutionContext,
  resolveOddsapiEventForSeed,
  persistSeedEventResolution,
  type SeedEventResolutionOutcome,
} from '../src/seed/orchestrator/eventResolutionForSeed.js';
import type { EventReconciliationInput } from '../src/identity/types.js';
import { writeFileSync } from 'node:fs';

const HOSTED = process.env['SLIPLABZ_HOSTED_DATABASE_URL']!;

interface Row {
  queue_row_id: string;
  provider_game_id: string;
  raw_home_team: string;
  raw_away_team: string;
  raw_commence_time: string;
  reason: string;
}

async function main(): Promise<void> {
  const pool = openPool({
    connectionString: HOSTED, max: 1, statement_timeout_ms: 30_000,
    ssl: HOSTED.includes('supabase.') ? 'require' : 'disable',
  });
  try {
    // ONLY drain the 5 events from V1-4d's poll (unmatched with commence_time
    // 2026-07-16..2026-07-18). The 5 older queued rows (time_window_exceeded,
    // 2026-06-04..2026-07-01, and unmatched 2026-07-13..2026-07-14) are
    // out-of-scope for THIS ticket: those were queued when historical seed
    // discovered them and their internal games either don't exist (backward
    // hole rows now covered) or are outside the ±15-minute reconcile window.
    // Their handling belongs to the same follow-up that fixes queue drain.
    const target_pids = [
      '00a997433337939ebda3beb882a1e2db',
      '571b28ddb7c28b45b2925d493d2085c8',
      '4a1af047b50cc335d69665ae9b499206',
      '034012f210532a879b3d1ab5de8306e6',
      '02c8aae5b168305c60aa6f9c66f443d1',
    ];
    const q = await pool.query(
      `SELECT queue_row_id::text, provider_game_id, raw_home_team, raw_away_team,
              raw_commence_time::text, reason
         FROM event_reconciliation_queue
        WHERE provider='odds_api' AND resolution='open'
          AND provider_game_id = ANY($1::text[])
        ORDER BY raw_commence_time`,
      [target_pids]
    );
    const rows = q.rows as Row[];

    const outcomes: Array<{
      provider_event_id: string;
      matchup: string;
      commence: string;
      outcome_kind: SeedEventResolutionOutcome['kind'];
      internal_game_id: string | null;
      match_reason: string;
      queue_row_still_open: boolean;
    }> = [];

    for (const r of rows) {
      const ctx = await loadSeedResolutionContext(pool, {
        provider: 'odds_api',
        raw_commence_time_utc: r.raw_commence_time,
      });
      const input: EventReconciliationInput = {
        provider: 'odds_api',
        provider_game_id: r.provider_game_id,
        raw_home_team: r.raw_home_team,
        raw_away_team: r.raw_away_team,
        raw_commence_time: r.raw_commence_time,
      };
      const outcome = resolveOddsapiEventForSeed(input, ctx);
      const persistResult = await persistSeedEventResolution(pool, input, outcome);

      // Confirm queue row state (not drained by any committed code path).
      const stillOpen = await pool.query(
        `SELECT 1 FROM event_reconciliation_queue
          WHERE queue_row_id = $1::uuid AND resolution = 'open'`,
        [r.queue_row_id]
      );

      const match_reason =
        outcome.kind === 'resolved_exact' ? 'exact_time_match'
        : outcome.kind === 'resolved_tolerance' ? `time_tolerance ${outcome.time_delta_seconds}s`
        : `${outcome.reason}: ${outcome.reason_detail}`;

      outcomes.push({
        provider_event_id: r.provider_game_id,
        matchup: `${r.raw_away_team} @ ${r.raw_home_team}`,
        commence: r.raw_commence_time,
        outcome_kind: outcome.kind,
        internal_game_id: outcome.kind === 'queued' ? null : outcome.internal_game_id,
        match_reason,
        queue_row_still_open: (stillOpen.rowCount ?? 0) > 0,
      });

      console.log(
        `  ${r.provider_game_id.slice(0, 8)}… ${r.raw_away_team} @ ${r.raw_home_team}: `
        + `${outcome.kind}${outcome.kind !== 'queued' ? ` → ${outcome.internal_game_id.slice(0,8)}…` : ''} `
        + `(persist=${persistResult.kind})`
      );
    }

    // Snapshot state at end.
    const pg = await pool.query(
      `SELECT provider_game_id, mapping_state, internal_game_id
         FROM provider_games
        WHERE provider='odds_api' AND provider_game_id = ANY($1::text[])
        ORDER BY provider_game_id`,
      [target_pids]
    );
    const remaining_open = await pool.query(
      `SELECT count(*)::int AS n FROM event_reconciliation_queue
        WHERE provider='odds_api' AND provider_game_id = ANY($1::text[]) AND resolution='open'`,
      [target_pids]
    );

    const artifact = {
      ticket: 'V1-4e', step: 3,
      per_event: outcomes,
      provider_games_after: pg.rows,
      target_queue_rows_still_open: (remaining_open.rows[0] as { n: number }).n,
      note:
        'Per STEP 1 audit, no committed code path updates event_reconciliation_queue.resolution '
        + 'from open → resolved. The queue row stays open even after provider_games is approved. '
        + 'Queue-drain hygiene is a follow-up to this ticket; it is NOT a blocker for aggregation, '
        + 'which selects on market_snapshots.linked_internal_game_id, not on queue state.',
    };
    console.log(JSON.stringify(artifact, null, 2));
    writeFileSync('/tmp/v14d/step3_v4e_artifact.json', JSON.stringify(artifact, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('# ERROR:', err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
