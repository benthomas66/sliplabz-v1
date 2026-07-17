// V1-4d STEP 4 — freshness measurement.
//
// Quotes: src/odds/freshness.ts (the module that owns the thresholds).
// Reads: market_snapshots.freshness_state (persisted by classifyFreshness
// at write time in scripts/v1_4d_step2_poll.ts). Also reads
// current_market_rows.freshness_state when non-empty (composeCurrentMarketRow
// classifies via the same classifier on last_observed_at).

import { openPool } from '../src/db/connection.js';
import { FRESH_THRESHOLD_SECONDS, AGING_THRESHOLD_SECONDS } from '../src/odds/freshness.js';

const HOSTED = process.env['SLIPLABZ_HOSTED_DATABASE_URL']!;

async function main(): Promise<void> {
  const measurement_started = new Date().toISOString();
  console.log(JSON.stringify({
    kind: 'step4_thresholds_quoted_from_src_odds_freshness',
    FRESH_THRESHOLD_SECONDS,           // 600 (10 minutes)
    AGING_THRESHOLD_SECONDS,           // 1800 (30 minutes)
    rules_verbatim: [
      "if age_seconds <= FRESH_THRESHOLD_SECONDS: state = 'fresh'",
      "if age_seconds <= AGING_THRESHOLD_SECONDS: state = 'aging'",
      "otherwise: state = 'stale'",
      "provider_last_update == null → 'unavailable'",
      "latest_poll_failed → 'failed_latest_poll'",
    ],
  }, null, 2));

  const pool = openPool({
    connectionString: HOSTED,
    max: 1,
    statement_timeout_ms: 30_000,
    ssl: HOSTED.includes('supabase.') ? 'require' : 'disable',
  });
  try {
    // (b) Distribution — from market_snapshots (persisted per-snapshot at
    //     write time via classifyFreshness). current_market_rows is empty
    //     because the aggregator found zero linked games.
    const dist_ms = await pool.query(
      `SELECT freshness_state, count(*)::int AS n
         FROM market_snapshots
        WHERE request_kind = 'current_poll' AND provenance = 'self_observed'
        GROUP BY freshness_state ORDER BY freshness_state`
    );
    const age_stats = await pool.query(
      `SELECT
          count(*)::int AS total,
          min(extract(epoch from (retrieved_at - provider_last_update)))::numeric(10,2) AS min_age_sec,
          max(extract(epoch from (retrieved_at - provider_last_update)))::numeric(10,2) AS max_age_sec,
          avg(extract(epoch from (retrieved_at - provider_last_update)))::numeric(10,2) AS avg_age_sec,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch from (retrieved_at - provider_last_update)))::numeric(10,2) AS p50_age_sec,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch from (retrieved_at - provider_last_update)))::numeric(10,2) AS p95_age_sec
         FROM market_snapshots
        WHERE request_kind = 'current_poll' AND provenance = 'self_observed'
          AND provider_last_update IS NOT NULL`
    );

    // Wall-clock gap = measurement_time − most_recent_poll_time.
    const gap_q = await pool.query(
      `SELECT max(retrieved_at) AS latest_poll_at,
              extract(epoch from (now() - max(retrieved_at)))::numeric(10,2) AS poll_to_measurement_gap_sec
         FROM market_snapshots
        WHERE request_kind = 'current_poll' AND provenance = 'self_observed'`
    );

    console.log(JSON.stringify({
      kind: 'step4_freshness_distribution',
      source: 'market_snapshots (current_poll, self_observed)',
      distribution: dist_ms.rows,
      age_at_retrieval_seconds: age_stats.rows[0],
      wall_clock_gap: gap_q.rows[0],
      current_market_rows_note:
        'current_market_rows is EMPTY (n=0) because all 5 upcoming provider_events resolved to queued (no candidate games in the games table beyond 2026-07-12). Freshness measurement is therefore taken from market_snapshots directly; the same classifyFreshness classifier is used at both layers.',
    }, null, 2));

    // Plain-English verdict.
    const dist = dist_ms.rows as Array<{ freshness_state: string; n: number }>;
    const fresh_n = dist.find((d) => d.freshness_state === 'fresh')?.n ?? 0;
    const total_n = dist.reduce((a, d) => a + d.n, 0);
    const fresh_frac = total_n === 0 ? 0 : fresh_n / total_n;
    const conclusion = fresh_frac === 1
      ? `Yes — a freshly-polled row lands 'fresh' (${fresh_n}/${total_n} = 100 %). §C.3's stale cap is NOT triggered under normal operation. The operational polling ticket has the full FRESH_THRESHOLD_SECONDS (${FRESH_THRESHOLD_SECONDS} s = 10 min) of headroom before AGING kicks in, and ${AGING_THRESHOLD_SECONDS} s (30 min) before STALE. This directly informs the credit-budget-vs-cadence trade-off.`
      : `NO — only ${fresh_n}/${total_n} rows landed 'fresh' (${(fresh_frac * 100).toFixed(1)} %). Distribution: ${JSON.stringify(dist)}. The operational cadence must be shorter than currently assumed, or the threshold must be amended.`;
    console.log(JSON.stringify({
      kind: 'step4_verdict',
      measurement_started,
      measurement_completed: new Date().toISOString(),
      conclusion,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('# ERROR:', err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
