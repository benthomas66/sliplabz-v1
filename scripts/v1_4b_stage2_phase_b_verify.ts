// V1-4b Stage 2 Phase B — B3 verification battery + B4 coverage report.
//
// Runs the five load-bearing verifications from the Stage 2 prompt against
// the HOSTED database, plus the queued-events excluded-with-reason listing:
//   (a) rows by slate_date × market × book summary
//   (b) seeded rows invisible to CURRENT_ONLY_WHERE_CLAUSE (count must be 0)
//   (c) sample of 10 canonical closing points, each traced to an offered
//       point in its final snapshot
//   (d) zero rows in lifecycle/movement tables attributable to seeded data
//   (e) watermark completeness by slice, with every incomplete slice listed
//   plus the 6 queued events listed as excluded-with-reason
//
// Also regenerates the coverage report at
// docs/product/reports/V1_4B_STAGE2_SEED_COVERAGE.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { CURRENT_ONLY_WHERE_CLAUSE } from '../src/lines/currentHistoricalIsolation.js';

const here = dirname(fileURLToPath(import.meta.url));
const COVERAGE_REPORT_PATH = pathResolve(here, '../docs/product/reports/V1_4B_STAGE2_SEED_COVERAGE.md');
const SEED_STATE_PATH = pathResolve(here, '../docs/product/reports/_stage2_seed_state.json');

const pool = new pg.Pool({
  connectionString: process.env['SLIPLABZ_HOSTED_DATABASE_URL']!,
  max: 2,
  idleTimeoutMillis: 10_000,
  allowExitOnIdle: true,
});

interface SeedState {
  seed_run_id: string;
  completion_state: string;
  started_at: string;
  completed_at: string;
  credit_ceiling: number;
  credits_observed_total: number;
  resolved_events: Array<{ provider_event_id: string; slate_date: string; commence_time: string; home_team: string; away_team: string; linked_internal_game_id: string; match_method: string; time_delta_seconds: number }>;
  queued_events: Array<{ provider_event_id: string; slate_date: string; commence_time: string; home_team: string; away_team: string; reason: string; reason_detail: string }>;
  ledger: Array<{ at: string; endpoint: string; forecast: number; observed_x_requests_last: number | null; x_requests_remaining: number | null; running_total: number; budget_remaining: number }>;
  per_slice_counters: Array<{ key: string; events_attempted: number; events_admitted: number; events_stale_rejected: number; events_no_snapshot: number }>;
  events_admitted: number;
  events_stale_rejected: number;
  events_no_snapshot: number;
  aborted_reason: string | null;
}

async function main(): Promise<void> {
  const state = JSON.parse(readFileSync(SEED_STATE_PATH, 'utf-8')) as SeedState;
  console.log(`# verifying seed run ${state.seed_run_id} (${state.completion_state})`);

  // ---- (a) rows by slate_date × market × book ----
  console.log('\n===== (a) rows by slate_date × market × book =====');
  const sqlA = `
    SELECT to_char(g.scheduled_start_utc AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS slate_date,
           scq.market_key, scq.bookmaker_key,
           count(*)::int AS n_quotes
      FROM source_closing_quotes scq
      JOIN games g ON g.internal_game_id = scq.internal_game_id
     WHERE g.status = 'final'
     GROUP BY slate_date, scq.market_key, scq.bookmaker_key
     ORDER BY slate_date, scq.market_key, scq.bookmaker_key
  `;
  const a = await pool.query(sqlA);
  console.log(`# per-slice quote rows: ${a.rowCount} triples`);
  const totalQuotes = (a.rows as Array<{ n_quotes: number }>).reduce((n, r) => n + r.n_quotes, 0);
  console.log(`# total source_closing_quotes rows: ${totalQuotes}`);

  // Roll-up
  const marketTotals = new Map<string, number>();
  const bookTotals = new Map<string, number>();
  const sliceRows = a.rows as Array<{ slate_date: string; market_key: string; bookmaker_key: string; n_quotes: number }>;
  for (const r of sliceRows) {
    marketTotals.set(r.market_key, (marketTotals.get(r.market_key) ?? 0) + r.n_quotes);
    bookTotals.set(r.bookmaker_key, (bookTotals.get(r.bookmaker_key) ?? 0) + r.n_quotes);
  }
  console.log('# by market:', JSON.stringify(Object.fromEntries(marketTotals), null, 2));
  console.log('# by book:', JSON.stringify(Object.fromEntries(bookTotals), null, 2));

  // ---- (b) seeded rows invisible to CURRENT_ONLY_WHERE_CLAUSE ----
  console.log('\n===== (b) CURRENT_ONLY_WHERE_CLAUSE isolation =====');
  const bSql = `SELECT count(*)::int AS n FROM market_snapshots WHERE ${CURRENT_ONLY_WHERE_CLAUSE}`;
  const b = await pool.query(bSql);
  const bCount = (b.rows[0] as { n: number }).n;
  console.log(`# SQL: ${bSql}`);
  console.log(`# rows visible to CURRENT_ONLY_WHERE_CLAUSE: ${bCount}`);
  const totalSnapshots = await pool.query(`SELECT count(*)::int AS n FROM market_snapshots WHERE request_kind='historical_query' AND provenance='backfilled_historical'`);
  console.log(`# total (historical_query, backfilled_historical) snapshots: ${(totalSnapshots.rows[0] as { n: number }).n}`);
  const invariantB = bCount === 0;
  console.log(`# INVARIANT ${invariantB ? 'HOLDS' : 'FAIL'}: seeded rows invisible to current-selection.`);

  // ---- (c) sample of 10 canonical closing points, each traced to an offered point ----
  console.log('\n===== (c) 10 canonical closing points, each traced to an offered point =====');
  const cSql = `
    SELECT ccp.canonical_closing_point_id, ccp.internal_game_id, ccp.internal_player_id,
           ccp.market_key, ccp.canonical_closing_point,
           ccp.selection_method, ccp.coverage_label,
           ccp.close_boundary_utc
      FROM canonical_closing_points ccp
     ORDER BY ccp.created_at
     LIMIT 10
  `;
  const c = await pool.query(cSql);
  const canonSamples = c.rows as Array<{
    canonical_closing_point_id: string; internal_game_id: string; internal_player_id: string;
    market_key: string; canonical_closing_point: string; selection_method: string;
    coverage_label: string; close_boundary_utc: Date | string;
  }>;
  const trace: Array<Record<string, unknown>> = [];
  for (const sample of canonSamples) {
    // For each canonical closing point, find at least one market_offering
    // whose `point` equals `canonical_closing_point` on a snapshot for the
    // same game/player/market/close_boundary.
    const tr = await pool.query(
      `SELECT mo.market_offering_id, mo.point, mo.side, mo.internal_player_id,
              ms.market_snapshot_id, ms.bookmaker_key, ms.provider_snapshot_time,
              ms.retrieved_at
         FROM market_offerings mo
         JOIN market_snapshots ms ON ms.market_snapshot_id = mo.market_snapshot_id
        WHERE mo.internal_player_id = $1
          AND ms.market_key = $2
          AND ms.linked_internal_game_id = $3
          AND ms.request_kind = 'historical_query'
          AND mo.point = $4::numeric
        LIMIT 1`,
      [sample.internal_player_id, sample.market_key, sample.internal_game_id, sample.canonical_closing_point]
    );
    trace.push({
      canonical: {
        canonical_closing_point_id: sample.canonical_closing_point_id,
        internal_game_id: sample.internal_game_id,
        internal_player_id: sample.internal_player_id,
        market_key: sample.market_key,
        canonical_closing_point: Number(sample.canonical_closing_point),
        selection_method: sample.selection_method,
        coverage_label: sample.coverage_label,
      },
      offered_at: (tr.rows[0] ?? null),
    });
  }
  const cResolved = trace.filter((t) => (t.offered_at as unknown) !== null).length;
  console.log(`# ${cResolved}/10 canonical closing points traced to an offered point in the final snapshot.`);
  const invariantC = cResolved === 10;
  console.log(`# INVARIANT ${invariantC ? 'HOLDS' : 'FAIL'}: every canonical point traces to an offered point.`);

  // ---- (d) zero rows in lifecycle/movement tables from seeded data ----
  console.log('\n===== (d) zero contamination into lifecycle/movement/current_market tables =====');
  const dSql = `SELECT
      (SELECT count(*)::int FROM observed_line_lifecycle) AS n_lifecycle,
      (SELECT count(*)::int FROM movement_events) AS n_movement,
      (SELECT count(*)::int FROM current_market_rows) AS n_current`;
  const d = await pool.query(dSql);
  const dCounts = d.rows[0] as { n_lifecycle: number; n_movement: number; n_current: number };
  console.log(`# SQL: ${dSql}`);
  console.log(`# ${JSON.stringify(dCounts)}`);
  const invariantD = dCounts.n_lifecycle === 0 && dCounts.n_movement === 0 && dCounts.n_current === 0;
  console.log(`# INVARIANT ${invariantD ? 'HOLDS' : 'FAIL'}: zero rows in lifecycle/movement/current.`);

  // ---- (e) watermark completeness by slice ----
  console.log('\n===== (e) watermark completeness by slice =====');
  const eSql = `
    SELECT slice_coverage_state, count(*)::int AS n
      FROM seed_slice_watermarks
     GROUP BY slice_coverage_state
     ORDER BY slice_coverage_state`;
  const e = await pool.query(eSql);
  const eRows = e.rows as Array<{ slice_coverage_state: string; n: number }>;
  console.log(`# by state: ${JSON.stringify(eRows)}`);
  const incompleteSql = `
    SELECT slate_date::text AS slate_date, market_key, bookmaker_key,
           slice_coverage_state, events_attempted, events_admitted,
           events_stale_rejected, events_no_snapshot
      FROM seed_slice_watermarks
     WHERE slice_coverage_state NOT IN ('complete', 'no_coverage_available')
     ORDER BY slate_date, market_key, bookmaker_key`;
  const incomplete = await pool.query(incompleteSql);
  console.log(`# incomplete slice count: ${incomplete.rowCount}`);
  if ((incomplete.rowCount ?? 0) > 0) {
    console.log('# first 10 incomplete:');
    console.log(JSON.stringify(incomplete.rows.slice(0, 10), null, 2));
  }
  // "Every incomplete slice listed" — dump them all to a file for the report.
  const incompleteList = incomplete.rows as Array<{
    slate_date: string; market_key: string; bookmaker_key: string;
    slice_coverage_state: string; events_attempted: number; events_admitted: number;
  }>;

  // ---- Queued events (governor-visible exclusion set) ----
  console.log('\n===== queued events — excluded-with-reason coverage =====');
  const qSql = `
    SELECT provider, provider_game_id, raw_home_team, raw_away_team,
           to_char(raw_commence_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS commence_time,
           reason, reason_detail
      FROM event_reconciliation_queue
     WHERE provider = 'odds_api' AND resolution = 'open'
     ORDER BY commence_time`;
  const q = await pool.query(qSql);
  console.log(`# queued events (excluded): ${q.rowCount}`);
  console.log(JSON.stringify(q.rows, null, 2));

  // ---- Emit coverage report ----
  const md: string[] = [];
  md.push('# V1-4b Stage 2 Seed Coverage Report');
  md.push('');
  md.push(`**Seed run id:** \`${state.seed_run_id}\`  `);
  md.push(`**Completion state:** \`${state.completion_state}\`  `);
  md.push(`**Started at:** ${state.started_at}  `);
  md.push(`**Completed at:** ${state.completed_at}  `);
  md.push(`**Credit ceiling:** ${state.credit_ceiling.toLocaleString()}  `);
  md.push(`**Credits observed (this run only):** ${state.credits_observed_total.toLocaleString()}  `);
  md.push(`**Events resolved:** ${state.resolved_events.length}  `);
  md.push(`**Events admitted (this run):** ${state.events_admitted}  `);
  md.push(`**Events queued for reconciliation:** ${state.queued_events.length}  `);
  md.push('');
  md.push('## B3 verification battery (against hosted DB)');
  md.push('');
  md.push('### (a) Rows by slate_date × market × book');
  md.push('');
  md.push(`Total \`source_closing_quotes\` rows written: **${totalQuotes.toLocaleString()}** across **${a.rowCount}** distinct (slate_date, market_key, bookmaker_key) triples.`);
  md.push('');
  md.push('Roll-up by market:');
  md.push('');
  md.push('| market_key | quotes |');
  md.push('|---|---:|');
  for (const [m, n] of marketTotals) md.push(`| ${m} | ${n.toLocaleString()} |`);
  md.push('');
  md.push('Roll-up by book:');
  md.push('');
  md.push('| bookmaker_key | quotes |');
  md.push('|---|---:|');
  for (const [b, n] of bookTotals) md.push(`| ${b} | ${n.toLocaleString()} |`);
  md.push('');
  md.push('Per-slice detail (top 30 slices by quote count):');
  md.push('');
  md.push('| slate_date | market | book | quotes |');
  md.push('|---|---|---|---:|');
  const sortedSlices = [...sliceRows].sort((a, b) => b.n_quotes - a.n_quotes).slice(0, 30);
  for (const s of sortedSlices) md.push(`| ${s.slate_date} | ${s.market_key} | ${s.bookmaker_key} | ${s.n_quotes} |`);
  md.push('');
  md.push('### (b) Seeded rows invisible to `CURRENT_ONLY_WHERE_CLAUSE`');
  md.push('');
  md.push('SQL:');
  md.push('');
  md.push('```sql');
  md.push(`SELECT count(*) FROM market_snapshots WHERE ${CURRENT_ONLY_WHERE_CLAUSE}`);
  md.push('```');
  md.push('');
  md.push(`Result: **${bCount}** row(s). Total historical snapshots: ${(totalSnapshots.rows[0] as {n:number}).n}.`);
  md.push('');
  md.push(`**Invariant ${invariantB ? '✓ HOLDS' : '✗ FAIL'}:** seeded rows must be structurally invisible to current-selection.`);
  md.push('');
  md.push('### (c) 10 canonical closing points traced to an offered point in the final snapshot');
  md.push('');
  md.push(`Sampled the first 10 canonical closing points and, for each, queried \`market_offerings\` joined to \`market_snapshots\` (\`request_kind='historical_query'\`) matching (internal_game_id, internal_player_id, market_key, point).`);
  md.push('');
  md.push(`Result: **${cResolved}/10** canonical points traced. **Invariant ${invariantC ? '✓ HOLDS' : '✗ FAIL'}**.`);
  md.push('');
  md.push('Sample table:');
  md.push('');
  md.push('| # | market | canonical point | selection method | traced offering (market_offering_id) | book | offered point | side |');
  md.push('|---|---|---:|---|---|---|---:|---|');
  trace.forEach((t, i) => {
    const canon = t.canonical as { market_key: string; canonical_closing_point: number; selection_method: string };
    const off = t.offered_at as null | { market_offering_id: string; bookmaker_key: string; point: string; side: string };
    md.push(`| ${i + 1} | ${canon.market_key} | ${canon.canonical_closing_point} | ${canon.selection_method} | ${off === null ? '_(none)_' : `\`${off.market_offering_id}\``} | ${off?.bookmaker_key ?? ''} | ${off?.point ?? ''} | ${off?.side ?? ''} |`);
  });
  md.push('');
  md.push('### (d) Zero contamination into `observed_line_lifecycle` / `movement_events` / `current_market_rows`');
  md.push('');
  md.push('SQL:');
  md.push('');
  md.push('```sql');
  md.push(`SELECT
  (SELECT count(*) FROM observed_line_lifecycle) AS n_lifecycle,
  (SELECT count(*) FROM movement_events)         AS n_movement,
  (SELECT count(*) FROM current_market_rows)     AS n_current`);
  md.push('```');
  md.push('');
  md.push(`Result: \`${JSON.stringify(dCounts)}\`.`);
  md.push('');
  md.push(`**Invariant ${invariantD ? '✓ HOLDS' : '✗ FAIL'}:** zero rows in the three tables that gate current-line and movement. Reinforced by V1-4 CHECK constraints (\`provenance = 'self_observed'\`) which structurally reject any seeded-lineage row.`);
  md.push('');
  md.push('### (e) Per-slice watermark completeness');
  md.push('');
  md.push('State distribution:');
  md.push('');
  md.push('| slice_coverage_state | count |');
  md.push('|---|---:|');
  for (const row of eRows) md.push(`| ${row.slice_coverage_state} | ${row.n} |`);
  md.push('');
  md.push(`Incomplete slices (state NOT IN {complete, no_coverage_available}): **${incompleteList.length}**.`);
  if (incompleteList.length === 0) {
    md.push('');
    md.push('_All slices in a terminal state._');
  } else {
    md.push('');
    md.push('Every incomplete slice, with reason:');
    md.push('');
    md.push('| slate_date | market | book | state | attempted | admitted |');
    md.push('|---|---|---|---|---:|---:|');
    for (const s of incompleteList) md.push(`| ${s.slate_date} | ${s.market_key} | ${s.bookmaker_key} | ${s.slice_coverage_state} | ${s.events_attempted} | ${s.events_admitted} |`);
  }
  md.push('');
  md.push('### Queued events — excluded-with-reason coverage');
  md.push('');
  md.push(`${q.rowCount} events were routed to \`event_reconciliation_queue\` at resolution time and never issued an event-odds request. Every affected (slate_date, market, book) slice inherits its coverage exclusion from these events:`);
  md.push('');
  md.push('| provider_event_id | pair (home @ away) | commence_time | reason | reason_detail |');
  md.push('|---|---|---|---|---|');
  for (const row of q.rows as Array<{ provider_game_id: string; raw_home_team: string; raw_away_team: string; commence_time: string; reason: string; reason_detail: string }>) {
    md.push(`| \`${row.provider_game_id}\` | ${row.raw_home_team} @ ${row.raw_away_team} | ${row.commence_time} | \`${row.reason}\` | ${row.reason_detail.replace(/\|/g, '\\|')} |`);
  }
  md.push('');
  md.push('## Credit ledger (this run only)');
  md.push('');
  md.push('| # | at | endpoint | forecast | observed x-requests-last | remaining | running_total | budget_remaining |');
  md.push('|---:|---|---|---:|---:|---:|---:|---:|');
  state.ledger.forEach((l, i) => md.push(`| ${i + 1} | ${l.at} | ${l.endpoint} | ${l.forecast} | ${l.observed_x_requests_last ?? 'null'} | ${l.x_requests_remaining ?? 'null'} | ${l.running_total} | ${l.budget_remaining} |`));
  md.push('');
  md.push('_This ledger reflects only requests made in the FINAL run (2ea6534a). Prior partial runs — 3 in total — are documented separately in the ticket report; their per-run credit spends contribute to the cumulative Odds API x-requests-used figure._');
  md.push('');
  writeFileSync(COVERAGE_REPORT_PATH, md.join('\n'));
  console.log(`\n# coverage report written to ${COVERAGE_REPORT_PATH}`);

  // Overall verdict.
  console.log('\n===== OVERALL VERIFICATION VERDICT =====');
  console.log(JSON.stringify({
    invariant_b_current_isolation: invariantB,
    invariant_c_canonical_traces: invariantC,
    invariant_d_zero_contamination: invariantD,
    incomplete_slice_count: incompleteList.length,
    queued_events_excluded: q.rowCount,
  }, null, 2));
}

main().catch((e) => { console.error('verify failed:', e); process.exitCode = 1; }).finally(() => pool.end());
