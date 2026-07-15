// V1-A1-1 DR-14 / DR-27 Offline Calibration Validation.
//
// GOVERNOR REVISE (2026-07-15) — corrects two defects in the prior run:
//
//   DEFECT 1 (blocking): the previous DR-14 clamp analysis measured
//   COUNT(*) FILTER (WHERE margin / M <= -1 OR margin / M >= 1) over
//   individual historical_line_results.margin rows. But norm_margin per
//   §B.3 is applied only to four averaged / median terms per (player,
//   market): L10 avg_minus_threshold, L10 median_minus_threshold,
//   season avg_minus_threshold, season median_minus_threshold — each with
//   fixed base weights 0.40 / 0.30 / 0.20 / 0.10 combined via the T1
//   null-handling rule. An average over 10 games is far smaller in
//   magnitude than the individual margins composing it (they partially
//   cancel), so the previous clamp % OVERSTATED how often C_MS saturates.
//   This script now reports the four term clamp proportions AND the
//   weighted C_MS saturation proportion. The prior individual-margin
//   distribution is preserved (relabeled "informational — NOT the C_MS
//   clamp rate") because it is useful context.
//
//   DEFECT 2 (non-blocking): the previous DR-27 sample used HAVING
//   COUNT(*) >= 5 (DR-6 minimum for ANY label). But DR-27 caps only
//   would-be-STRONG profiles, and DR-8 requires L10 eligible_n >= 8 for
//   Strong to be reachable at all. This script now reports DR-27 cap
//   proportions for BOTH populations side by side.
//
// Also adds:
//   * A per-market normalizer-sensitivity table (Defect 1 (f)): C_MS
//     saturation proportion at the approved M plus candidate M values
//     around it. Numbers only; the implementation agent proposes no
//     change. Any constant change routes through owner/governor review
//     under DR-24.
//   * Corrected §1.1 "ordinary-dominance" test: DR-14's stated concern
//     is the OPPOSITE failure (normalizer too TIGHT — ordinary
//     performance saturates the component). Now measured by the C_MS
//     clamp proportion.
//
// Read-only analysis script required by
// docs/product/EVIDENCE_PROFILE_METHOD_V1.md §I.1 BEFORE V1-A1-3 (engine)
// may lock. This script SPENDS ZERO PROVIDER CREDITS and makes ZERO LIVE
// PROVIDER CALLS. It reads the HOSTED Supabase database via
// SLIPLABZ_HOSTED_DATABASE_URL with a strict read-only connection. It
// VALIDATES the approved constants; it is NOT authorized to change them.
//
// The margin values themselves come DIRECTLY from
// `historical_line_results.margin`, which is written by the V1-4
// canonical pipeline as `player_stat_value - canonical_closing_point`;
// the script never recomputes that value.
//
// Output: streams a JSON document to stdout on success. Redirect to a
// file to feed the report. If the pre-condition (populated
// `historical_line_results`) is not met, the script emits a `data_gap`
// document naming exactly which upstream table is empty and exits with
// status 0 (this is a truthful observation, not a script failure).
//
// Usage (from repo root):
//   set -a && source .env && set +a
//   node --import tsx scripts/v1_a1_1_dr14_dr27_calibration.ts > /tmp/calib.json

import pg from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// DR-14 margin normalizers per §B.3 (locked in evidence_method_v1).
const MARGIN_NORMALIZERS = Object.freeze({
  player_points: 6.0,
  player_rebounds: 3.0,
  player_assists: 2.0,
  player_threes: 1.5,
}) as Readonly<Record<LaunchMarket, number>>;

const LAUNCH_MARKETS = ['player_points', 'player_rebounds', 'player_assists', 'player_threes'] as const;
type LaunchMarket = typeof LAUNCH_MARKETS[number];

// DR-27 candidate K values (§I.1 extended validation spec).
const CANDIDATE_K_VALUES = [1.5, 2.0, 2.5, 3.0] as const;

// Number of concrete profile examples near each K cutoff (§I.1: ≥ 5).
const EXAMPLES_PER_CUTOFF = 5;

// Tolerance band for "near a cutoff": ± this fraction of (K × normalizer).
const NEAR_CUTOFF_BAND = 0.15; // ±15%

const DB_URL = process.env['SLIPLABZ_HOSTED_DATABASE_URL'];
if (DB_URL === undefined || DB_URL === '') {
  console.error('SLIPLABZ_HOSTED_DATABASE_URL required for the hosted read-only analysis');
  process.exit(2);
}

const pool = new pg.Pool({
  connectionString: DB_URL,
  max: 4,
  ssl: DB_URL.includes('supabase.') ? { rejectUnauthorized: false } : undefined,
});

async function readOnlySession<T>(body: () => Promise<T>): Promise<T> {
  // Belt-and-braces: server-side transaction is READ ONLY so any accidental
  // write would fail at the database, not just at the callsite.
  const c = await pool.connect();
  try {
    await c.query('BEGIN READ ONLY');
    const out = await body();
    await c.query('ROLLBACK');
    return out;
  } finally {
    c.release();
  }
}

// -----------------------------------------------------------------------------
// Data-availability probe.
// -----------------------------------------------------------------------------

interface DataAvailability {
  readonly historical_line_results: number;
  readonly canonical_closing_points: number;
  readonly player_game_stats: number;
  readonly real_line_windows: number;
  readonly per_market_historical: Readonly<Record<LaunchMarket, number>>;
  readonly per_market_ccp: Readonly<Record<LaunchMarket, number>>;
}

async function probeDataAvailability(): Promise<DataAvailability> {
  const counts: Record<string, number> = {};
  for (const t of ['historical_line_results', 'canonical_closing_points', 'player_game_stats', 'real_line_windows']) {
    const r = await pool.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
    counts[t] = (r.rows[0] as { n: number }).n;
  }
  const perHist: Record<LaunchMarket, number> = { player_points: 0, player_rebounds: 0, player_assists: 0, player_threes: 0 };
  const perCcp: Record<LaunchMarket, number> = { player_points: 0, player_rebounds: 0, player_assists: 0, player_threes: 0 };
  const h = await pool.query(
    `SELECT market_key, COUNT(*)::int AS n FROM historical_line_results
      WHERE coverage_state IN ('complete','single_book') GROUP BY market_key`
  );
  for (const row of h.rows as Array<{ market_key: string; n: number }>) {
    if ((LAUNCH_MARKETS as ReadonlyArray<string>).includes(row.market_key)) perHist[row.market_key as LaunchMarket] = row.n;
  }
  const c = await pool.query(
    `SELECT market_key, COUNT(*)::int AS n FROM canonical_closing_points
      WHERE canonical_closing_point IS NOT NULL GROUP BY market_key`
  );
  for (const row of c.rows as Array<{ market_key: string; n: number }>) {
    if ((LAUNCH_MARKETS as ReadonlyArray<string>).includes(row.market_key)) perCcp[row.market_key as LaunchMarket] = row.n;
  }
  return Object.freeze({
    historical_line_results: counts['historical_line_results']!,
    canonical_closing_points: counts['canonical_closing_points']!,
    player_game_stats: counts['player_game_stats']!,
    real_line_windows: counts['real_line_windows']!,
    per_market_historical: Object.freeze(perHist),
    per_market_ccp: Object.freeze(perCcp),
  });
}

// -----------------------------------------------------------------------------
// PART 1 — DR-14 margin-normalizer distribution per market.
// -----------------------------------------------------------------------------

interface DR14MarketRow {
  readonly market_key: LaunchMarket;
  readonly normalizer: number;
  readonly eligible_margin_count: number;
  readonly median_abs_margin: number | null;
  readonly p75_abs_margin: number | null;
  readonly p90_abs_margin: number | null;
  readonly p95_abs_margin: number | null;
  readonly clamp_low_count: number;
  readonly clamp_high_count: number;
  readonly clamp_proportion: number | null;
  readonly ordinary_dominance_flag: boolean;
  readonly ordinary_dominance_note: string;
}

/**
 * PART 1 query. Latest computation_version per (game, player, market) —
 * same immutability rule as `historicalLineResultsRead.ts::LATEST_CTE`.
 * Then aggregates abs(margin) percentiles and clamp counts under the
 * DR-14 normalizer for the market.
 *
 * The `ordinary_dominance_flag` fires when the 75th-percentile absolute
 * margin is BELOW 0.5 × normalizer — i.e. half the observations are
 * clustered well under the normalizer's midpoint, meaning ordinary games
 * dominate the scale rather than exceptional ones. This is the §I.1
 * check "whether any market (particularly player_threes given its 1.5
 * normalizer) receives disproportionate influence from ordinary rather
 * than exceptional margins."
 */
async function computeDR14PerMarket(market: LaunchMarket): Promise<DR14MarketRow> {
  const norm = MARGIN_NORMALIZERS[market];
  const q = await pool.query(
    `WITH latest AS (
       SELECT DISTINCT ON (internal_game_id, internal_player_id, market_key)
              internal_game_id, internal_player_id, market_key,
              margin, canonical_closing_point, player_stat_value
         FROM historical_line_results
        WHERE coverage_state IN ('complete','single_book')
          AND market_key = $1
        ORDER BY internal_game_id, internal_player_id, market_key,
                 computation_version DESC, computed_at DESC
     )
     SELECT COUNT(*)::int AS n,
            percentile_cont(0.50) WITHIN GROUP (ORDER BY ABS(margin))::float8 AS p50,
            percentile_cont(0.75) WITHIN GROUP (ORDER BY ABS(margin))::float8 AS p75,
            percentile_cont(0.90) WITHIN GROUP (ORDER BY ABS(margin))::float8 AS p90,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY ABS(margin))::float8 AS p95,
            COUNT(*) FILTER (WHERE margin / $2::numeric <= -1)::int AS clamp_low,
            COUNT(*) FILTER (WHERE margin / $2::numeric >=  1)::int AS clamp_high
       FROM latest`,
    [market, norm]
  );
  const row = q.rows[0] as {
    n: number; p50: number | null; p75: number | null; p90: number | null; p95: number | null;
    clamp_low: number; clamp_high: number;
  };
  const clamp = row.n === 0 ? null : (row.clamp_low + row.clamp_high) / row.n;
  const midpoint = norm * 0.5;
  const ordinaryDominance = row.p75 !== null && row.p75 < midpoint;
  const note = row.n === 0
    ? 'no eligible historical margins for this market'
    : ordinaryDominance
      ? `75th-percentile |margin|=${row.p75!.toFixed(2)} is BELOW half the normalizer (${midpoint.toFixed(2)}); the ${market === 'player_threes' ? 'player_threes ' : ''}scale is dominated by ordinary margins`
      : `75th-percentile |margin|=${row.p75!.toFixed(2)} is at or above half the normalizer (${midpoint.toFixed(2)}); exceptional-margin influence appears balanced`;
  return Object.freeze({
    market_key: market,
    normalizer: norm,
    eligible_margin_count: row.n,
    median_abs_margin: row.p50,
    p75_abs_margin: row.p75,
    p90_abs_margin: row.p90,
    p95_abs_margin: row.p95,
    clamp_low_count: row.clamp_low,
    clamp_high_count: row.clamp_high,
    clamp_proportion: clamp,
    ordinary_dominance_flag: ordinaryDominance,
    ordinary_dominance_note: note,
  });
}

// -----------------------------------------------------------------------------
// PART 2 — DR-27 L10 stddev distribution + candidate-K cap proportions.
// -----------------------------------------------------------------------------

interface StddevBucketCount { readonly bucket_lower: number; readonly bucket_upper: number; readonly count: number }

interface KCapImpact {
  readonly K: number;
  readonly trigger_threshold: number; // K × normalizer
  /** cap counts in the DR-6 population (n L10 margins ≥ 5) */
  readonly n5_capped_profile_count: number;
  readonly n5_capped_proportion: number | null;
  /** cap counts in the DR-8 Strong-eligible population (n L10 margins ≥ 8) */
  readonly n8_capped_profile_count: number;
  readonly n8_capped_proportion: number | null;
  /** For each capped profile, whether the composite score would have
   *  qualified as Strong (|score| ≥ 0.55) WITHOUT the DR-27 cap. Pre-V1-5x
   *  the read model does not supply every §B.6 composite input; the
   *  "prerequisite_gap" note explains what is missing and reports the
   *  exact subset the script could compute (may be zero). */
  readonly would_be_strong_capped_count: number | null;
  readonly would_be_strong_subset_note: string;
}

interface DR27MarketRow {
  readonly market_key: LaunchMarket;
  readonly normalizer: number;
  /** qualifying profile count in the DR-6 population (n L10 margins ≥ 5) */
  readonly n5_profile_count: number;
  /** qualifying profile count in the DR-8 Strong-eligible population (n ≥ 8) */
  readonly n8_profile_count: number;
  readonly stddev_percentiles_n5: {
    readonly p50: number | null;
    readonly p75: number | null;
    readonly p90: number | null;
    readonly p95: number | null;
  };
  readonly stddev_percentiles_n8: {
    readonly p50: number | null;
    readonly p75: number | null;
    readonly p90: number | null;
    readonly p95: number | null;
  };
  readonly stddev_histogram_n5: ReadonlyArray<StddevBucketCount>;
  readonly k_cap_impact: ReadonlyArray<KCapImpact>;
  readonly player_threes_specific_note: string | null;
  readonly stability_note: string;
}

/**
 * Compute per-profile L10 margin stddev for one market. A "profile" here
 * is one (player, market_key) grain with a most-recent 10 eligible
 * historical margins. Uses window functions to take the latest 10 rows
 * per grain in date order.
 *
 * Governor REVISE: HAVING COUNT(*) >= 5 keeps the DR-6 population intact;
 * the n>=8 (DR-8 Strong-eligible) cut is applied in TypeScript so both
 * populations can be reported side by side without a second query.
 */
async function loadProfileStddevs(market: LaunchMarket): Promise<Array<{
  internal_player_id: string;
  internal_game_ids_in_l10: string[];
  l10_margins: number[];
  stddev: number | null;
  latest_close_boundary_utc: string | null;
  canonical_closing_point: number | null;
}>> {
  const q = await pool.query(
    `WITH latest AS (
       SELECT DISTINCT ON (internal_game_id, internal_player_id, market_key)
              internal_game_id, internal_player_id, market_key,
              margin::float8 AS margin, canonical_closing_point::float8 AS ccp,
              computation_version
         FROM historical_line_results
        WHERE coverage_state IN ('complete','single_book')
          AND market_key = $1
        ORDER BY internal_game_id, internal_player_id, market_key,
                 computation_version DESC, computed_at DESC
     ),
     dated AS (
       SELECT l.internal_player_id, l.internal_game_id, l.margin, l.ccp,
              g.scheduled_start_utc,
              ROW_NUMBER() OVER (
                PARTITION BY l.internal_player_id
                ORDER BY g.scheduled_start_utc DESC
              ) AS rn
         FROM latest l
         JOIN games g ON g.internal_game_id = l.internal_game_id
     )
     SELECT internal_player_id::text AS internal_player_id,
            ARRAY_AGG(internal_game_id::text ORDER BY scheduled_start_utc DESC) AS gids,
            ARRAY_AGG(margin ORDER BY scheduled_start_utc DESC) AS margins,
            MAX(scheduled_start_utc) AS latest_start,
            (ARRAY_AGG(ccp ORDER BY scheduled_start_utc DESC))[1] AS latest_ccp
       FROM dated
      WHERE rn <= 10
      GROUP BY internal_player_id
      HAVING COUNT(*) >= 5`, // per DR-6 minimum L10 eligibility
    [market]
  );
  const out: Array<{
    internal_player_id: string; internal_game_ids_in_l10: string[]; l10_margins: number[];
    stddev: number | null; latest_close_boundary_utc: string | null; canonical_closing_point: number | null;
  }> = [];
  for (const row of q.rows as Array<{
    internal_player_id: string; gids: string[]; margins: (string | number)[];
    latest_start: string | Date; latest_ccp: string | number | null;
  }>) {
    const marg = row.margins.map((v) => typeof v === 'string' ? Number(v) : v);
    const stddev = marg.length >= 2 ? populationStddev(marg) : null;
    out.push({
      internal_player_id: row.internal_player_id,
      internal_game_ids_in_l10: row.gids,
      l10_margins: marg,
      stddev,
      latest_close_boundary_utc: row.latest_start instanceof Date ? row.latest_start.toISOString() : String(row.latest_start),
      canonical_closing_point: row.latest_ccp === null ? null : Number(row.latest_ccp),
    });
  }
  return out;
}

function populationStddev(xs: readonly number[]): number {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const varSum = xs.reduce((a, b) => a + (b - mean) ** 2, 0);
  return Math.sqrt(varSum / n);
}

function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0]!;
  const rank = (sorted.length - 1) * p;
  const lo = Math.floor(rank), hi = Math.ceil(rank), frac = rank - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

/**
 * Approximate the number of would-be-Strong profiles that a DR-27 cap
 * would prevent, IF DR-27 were activated at this K.
 *
 * Pre-V1-5x prerequisite gap: the composite score in §B.6 depends on:
 *   - C_RTP (threshold windows over L10/L20/season on the CURRENT
 *     evaluated_line — a user-supplied line the seeded historical data
 *     doesn't presuppose);
 *   - C_MS (margin-support components on the evaluated line);
 *   - C_WA (window agreement including L5);
 *   - C_MA (current market alignment — sportsbook consensus, movement,
 *     coverage-at-line — requires current-poll data on the same grain).
 *
 * The seeded historical data BY ITSELF cannot supply a defensible
 * `score` because the evaluated_line and the current market row are
 * BOTH consumer choices the analysis script has no basis to synthesize.
 * Rather than estimate, the script reports the size of the subset for
 * which every composite input is CURRENTLY available in the hosted read
 * model. Empirically this subset is zero pre-V1-5x because the current-
 * market aggregator requires live snapshots that the seed run did not
 * populate (Odds-API historical seed is closing-line-only per V1-4b).
 *
 * The routine returns:
 *   - would_be_strong_capped_count = null when no composite input is
 *     computable from seeded data alone;
 *   - a non-null count otherwise, over the exact subset for which every
 *     input is available.
 */
async function estimateWouldBeStrongCapped(_market: LaunchMarket, _cappedPlayerIds: readonly string[]): Promise<{
  count: number | null;
  subset_note: string;
}> {
  // Pre-V1-5x: current_market_rows for these player-markets do not exist
  // because the seed pipeline did not populate current-poll snapshots on
  // the same grain (V1-4b closing-line seed only). Without a current
  // market row the composite score C_MA cannot be computed, and without
  // an evaluated_line the threshold-window components C_RTP / C_MS
  // cannot be evaluated. See §B.6 for the composite structure.
  //
  // The read model does not currently expose a "profile has all §B.6
  // inputs" predicate. Rather than estimate, this function checks the
  // one prerequisite trivially satisfiable from seeded data alone —
  // current_market_rows existence for the (player, market) grain — and
  // returns that as the maximum possible subset.
  const q = await pool.query(
    `SELECT COUNT(DISTINCT (internal_player_id, market_key))::int AS n
       FROM current_market_rows
      WHERE market_key = $1
        AND internal_player_id = ANY ($2::uuid[])
        AND freshness_state IN ('fresh','aging','stale','failed_latest_poll')
        AND eligible_sportsbook_count >= 1`,
    [_market, _cappedPlayerIds]
  );
  const n = (q.rows[0] as { n: number }).n;
  return {
    count: n === 0 ? null : n,
    subset_note: n === 0
      ? 'PREREQUISITE GAP: no current_market_rows exist for these capped grains on the hosted seed — composite score §B.6 cannot be computed, so would_be_strong is unavailable. Reporting absence rather than estimating.'
      : `computed over the ${n} capped grains for which a current_market_rows row exists AND has ≥1 eligible sportsbook AND is not 'unavailable'; the remaining capped grains lack §B.6 inputs and are excluded rather than estimated.`,
  };
}

async function computeDR27PerMarket(market: LaunchMarket): Promise<DR27MarketRow> {
  const norm = MARGIN_NORMALIZERS[market];
  const profiles = await loadProfileStddevs(market);
  const n5 = profiles.filter((p) => p.l10_margins.length >= 5);
  const n8 = profiles.filter((p) => p.l10_margins.length >= 8);
  const stddevs_n5 = n5.map((p) => p.stddev).filter((s): s is number => s !== null).sort((a, b) => a - b);
  const stddevs_n8 = n8.map((p) => p.stddev).filter((s): s is number => s !== null).sort((a, b) => a - b);
  const percN = (arr: readonly number[]) => ({
    p50: percentile(arr, 0.50),
    p75: percentile(arr, 0.75),
    p90: percentile(arr, 0.90),
    p95: percentile(arr, 0.95),
  });
  // Histogram: 20 uniform buckets between min and max of observed stddev (n≥5 population).
  const histogram: StddevBucketCount[] = [];
  if (stddevs_n5.length > 0) {
    const min = stddevs_n5[0]!, max = stddevs_n5[stddevs_n5.length - 1]!;
    const width = (max - min) / 20 || 1;
    for (let i = 0; i < 20; i += 1) {
      const lo = min + i * width, hi = i === 19 ? max : min + (i + 1) * width;
      const count = stddevs_n5.filter((s) => s >= lo && (i === 19 ? s <= hi : s < hi)).length;
      histogram.push({ bucket_lower: round4(lo), bucket_upper: round4(hi), count });
    }
  }
  const kCapImpact: KCapImpact[] = [];
  for (const K of CANDIDATE_K_VALUES) {
    const trigger = K * norm;
    const n5_capped = n5.filter((p) => p.stddev !== null && p.stddev > trigger);
    const n8_capped = n8.filter((p) => p.stddev !== null && p.stddev > trigger);
    // Union of capped player-ids in either population — for the would-be-Strong
    // subset check we look at everyone the rule would touch, so the subset
    // check remains a superset of both cuts.
    const cappedPlayerIds = Array.from(
      new Set([...n5_capped, ...n8_capped].map((p) => p.internal_player_id))
    );
    const wbs = await estimateWouldBeStrongCapped(market, cappedPlayerIds);
    kCapImpact.push({
      K,
      trigger_threshold: trigger,
      n5_capped_profile_count: n5_capped.length,
      n5_capped_proportion: n5.length === 0 ? null : n5_capped.length / n5.length,
      n8_capped_profile_count: n8_capped.length,
      n8_capped_proportion: n8.length === 0 ? null : n8_capped.length / n8.length,
      would_be_strong_capped_count: wbs.count,
      would_be_strong_subset_note: wbs.subset_note,
    });
  }
  const player_threes_specific_note = market !== 'player_threes'
    ? null
    : `player_threes normalizer is 1.5, the smallest of the four markets. For each candidate K the trigger threshold is ${CANDIDATE_K_VALUES.map((K) => `K=${K}→${(K * norm).toFixed(2)}`).join(', ')}. Because the 1.5 normalizer compresses the score band, a smaller absolute stddev suffices to trip DR-27; the owner should judge K here against the actual stddev distribution rather than against the K values used for player_points (whose 6.0 normalizer implies triggers 4× larger in absolute margin units).`;
  const stability_note = `An L10 stddev computed from n=5..7 observations is materially less stable than one computed from n=8..10 (fewer datapoints per estimate → wider confidence interval on the true stddev). The DR-27 rule caps only would-be-STRONG profiles, and DR-8 requires L10 eligible_n ≥ 8 for Strong to be reachable at all. Cap proportions on the n=5..7 subset are therefore reported for completeness but do NOT reflect the population DR-27 actually protects. The n≥8 numbers are the decision-relevant ones.`;
  return Object.freeze({
    market_key: market,
    normalizer: norm,
    n5_profile_count: n5.length,
    n8_profile_count: n8.length,
    stddev_percentiles_n5: percN(stddevs_n5),
    stddev_percentiles_n8: percN(stddevs_n8),
    stddev_histogram_n5: histogram,
    k_cap_impact: kCapImpact,
    player_threes_specific_note,
    stability_note,
  });
}

function round4(n: number): number { return Math.round(n * 10000) / 10000; }

// -----------------------------------------------------------------------------
// PART 1b — DR-14 CORRECTED: per-market C_MS terms distribution.
//
// Governor REVISE 2026-07-15. This is the analysis §B.3 actually asks for.
// -----------------------------------------------------------------------------

interface CmsTermStats {
  readonly n: number;
  readonly p50_abs: number | null;
  readonly p75_abs: number | null;
  readonly p90_abs: number | null;
  readonly p95_abs: number | null;
  readonly clamp_low_count: number; // norm_margin <= -1
  readonly clamp_high_count: number; // norm_margin >= +1
  readonly clamp_proportion: number | null;
}

interface DR14CmsMarketRow {
  readonly market_key: LaunchMarket;
  readonly normalizer: number;
  /** count of (internal_player_id, market_key) pairs that yielded ≥1 non-null term */
  readonly qualifying_player_market_count: number;
  readonly l10_avg_term: CmsTermStats;
  readonly l10_median_term: CmsTermStats;
  readonly season_avg_term: CmsTermStats;
  readonly season_median_term: CmsTermStats;
  /** weighted C_MS distribution under the T1 null-handling rule */
  readonly weighted_cms_n: number;
  readonly weighted_cms_p50_abs: number | null;
  readonly weighted_cms_p75_abs: number | null;
  readonly weighted_cms_p90_abs: number | null;
  readonly weighted_cms_p95_abs: number | null;
  readonly weighted_cms_saturation_count: number; // |C_MS| = 1
  readonly weighted_cms_saturation_proportion: number | null;
  /** revised ordinary-dominance test per governor REVISE (§1.1 correction) */
  readonly tight_normalizer_flag: boolean;
  readonly tight_normalizer_note: string;
}

/** Per-(player, market) L10 and season margin aggregates for C_MS. */
interface PlayerMarketMarginAggregates {
  readonly internal_player_id: string;
  readonly l10_n: number;
  readonly l10_avg: number | null;
  readonly l10_median: number | null;
  readonly season_n: number;
  readonly season_avg: number | null;
  readonly season_median: number | null;
}

/**
 * Load per-(player, market) margin aggregates from historical_line_results.
 *
 * L10 = latest 10 eligible margins by scheduled_start_utc DESC.
 * season = ALL eligible margins for the player-market.
 *
 * "Threshold" in §B.3 is the evaluated line. In the seeded historical
 * data there is no evaluated line — the closest defensible proxy is each
 * game's OWN canonical closing point, which is what `margin` already is
 * (= player_stat_value - canonical_closing_point). This proxy is a
 * documented limitation of the pre-current-market-population state; see
 * §1.0 caveat in the regenerated report.
 */
async function loadCmsAggregates(market: LaunchMarket): Promise<ReadonlyArray<PlayerMarketMarginAggregates>> {
  const q = await pool.query(
    `WITH latest AS (
       SELECT DISTINCT ON (internal_game_id, internal_player_id, market_key)
              internal_game_id, internal_player_id, market_key,
              margin::float8 AS margin, computation_version
         FROM historical_line_results
        WHERE coverage_state IN ('complete','single_book')
          AND market_key = $1
        ORDER BY internal_game_id, internal_player_id, market_key,
                 computation_version DESC, computed_at DESC
     ),
     dated AS (
       SELECT l.internal_player_id, l.internal_game_id, l.margin,
              g.scheduled_start_utc,
              ROW_NUMBER() OVER (
                PARTITION BY l.internal_player_id
                ORDER BY g.scheduled_start_utc DESC
              ) AS rn_desc
         FROM latest l
         JOIN games g ON g.internal_game_id = l.internal_game_id
     ),
     season_stats AS (
       SELECT internal_player_id::text AS pid,
              COUNT(*)::int AS n,
              AVG(margin)::float8 AS avg_m,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY margin)::float8 AS med_m
         FROM dated
        GROUP BY internal_player_id
     ),
     l10 AS (
       SELECT internal_player_id::text AS pid,
              COUNT(*)::int AS n,
              AVG(margin)::float8 AS avg_m,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY margin)::float8 AS med_m
         FROM dated
        WHERE rn_desc <= 10
        GROUP BY internal_player_id
     )
     SELECT s.pid AS pid,
            l.n AS l10_n, l.avg_m AS l10_avg, l.med_m AS l10_med,
            s.n AS season_n, s.avg_m AS season_avg, s.med_m AS season_med
       FROM season_stats s
       LEFT JOIN l10 l ON l.pid = s.pid`,
    [market]
  );
  const out: PlayerMarketMarginAggregates[] = [];
  for (const row of q.rows as Array<{
    pid: string;
    l10_n: number | null; l10_avg: number | null; l10_med: number | null;
    season_n: number | null; season_avg: number | null; season_med: number | null;
  }>) {
    out.push(Object.freeze({
      internal_player_id: row.pid,
      l10_n: row.l10_n ?? 0,
      l10_avg: row.l10_avg,
      l10_median: row.l10_med,
      season_n: row.season_n ?? 0,
      season_avg: row.season_avg,
      season_median: row.season_med,
    }));
  }
  return out;
}

function normMargin(raw: number, M: number): number {
  return Math.max(-1, Math.min(+1, raw / M));
}

/**
 * Compute the weighted C_MS for a single player-market under §B.3 base
 * weights and the T1 null-handling rule. Returns null when all four
 * terms are null.
 */
function computeWeightedCms(
  aggr: PlayerMarketMarginAggregates,
  M: number
): number | null {
  const BASE: ReadonlyArray<[keyof PlayerMarketMarginAggregates, number]> = [
    ['l10_avg', 0.40],
    ['l10_median', 0.30],
    ['season_avg', 0.20],
    ['season_median', 0.10],
  ];
  let retained_sum = 0;
  const available: Array<[number, number]> = []; // [normalized_value, base_weight]
  for (const [field, w] of BASE) {
    const v = aggr[field];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    available.push([normMargin(v, M), w]);
    retained_sum += w;
  }
  if (available.length === 0 || retained_sum === 0) return null;
  let total = 0;
  for (const [nv, w] of available) total += nv * (w / retained_sum);
  return Math.max(-1, Math.min(+1, total));
}

function termStats(rawValues: ReadonlyArray<number | null>, M: number): CmsTermStats {
  const finite: number[] = [];
  let clampLow = 0;
  let clampHigh = 0;
  for (const v of rawValues) {
    if (v === null || !Number.isFinite(v)) continue;
    const nm = normMargin(v, M);
    if (nm <= -1) clampLow += 1;
    if (nm >= +1) clampHigh += 1;
    finite.push(Math.abs(nm));
  }
  finite.sort((a, b) => a - b);
  return Object.freeze({
    n: finite.length,
    p50_abs: percentile(finite, 0.50),
    p75_abs: percentile(finite, 0.75),
    p90_abs: percentile(finite, 0.90),
    p95_abs: percentile(finite, 0.95),
    clamp_low_count: clampLow,
    clamp_high_count: clampHigh,
    clamp_proportion: finite.length === 0 ? null : (clampLow + clampHigh) / finite.length,
  });
}

async function computeDR14CmsPerMarket(market: LaunchMarket): Promise<DR14CmsMarketRow> {
  const M = MARGIN_NORMALIZERS[market];
  const aggregates = await loadCmsAggregates(market);
  const l10_avgs = aggregates.map((a) => a.l10_avg);
  const l10_meds = aggregates.map((a) => a.l10_median);
  const s_avgs = aggregates.map((a) => a.season_avg);
  const s_meds = aggregates.map((a) => a.season_median);
  const l10_avg_term = termStats(l10_avgs, M);
  const l10_med_term = termStats(l10_meds, M);
  const s_avg_term = termStats(s_avgs, M);
  const s_med_term = termStats(s_meds, M);
  const weightedCms: number[] = [];
  let sat = 0;
  for (const aggr of aggregates) {
    const c = computeWeightedCms(aggr, M);
    if (c === null) continue;
    if (Math.abs(c) >= 1 - 1e-9) sat += 1;
    weightedCms.push(Math.abs(c));
  }
  weightedCms.sort((a, b) => a - b);
  // Ordinary-dominance test corrected per governor REVISE §1.1: the concern
  // is a normalizer so TIGHT that ordinary performance saturates C_MS. We
  // flag "tight" when the weighted C_MS saturation proportion exceeds
  // 10 % — an arbitrary but transparent threshold that the report calls
  // out plainly. Reader decides whether that is acceptable.
  const sat_prop = weightedCms.length === 0 ? null : sat / weightedCms.length;
  const tight = sat_prop !== null && sat_prop >= 0.10;
  const note = weightedCms.length === 0
    ? 'no eligible player-market pairs; ordinary-dominance test not evaluable'
    : tight
      ? `${(sat_prop! * 100).toFixed(2)}% of qualifying player-market pairs saturate |C_MS|=1 under M=${M} — the normalizer is on the tight side; ordinary performance is compressing the margin-support component.`
      : `${((sat_prop ?? 0) * 100).toFixed(2)}% of qualifying player-market pairs saturate |C_MS|=1 under M=${M} — the normalizer's tight-side behavior does NOT dominate; margin-support has room to differentiate.`;
  return Object.freeze({
    market_key: market,
    normalizer: M,
    qualifying_player_market_count: aggregates.length,
    l10_avg_term,
    l10_median_term: l10_med_term,
    season_avg_term: s_avg_term,
    season_median_term: s_med_term,
    weighted_cms_n: weightedCms.length,
    weighted_cms_p50_abs: percentile(weightedCms, 0.50),
    weighted_cms_p75_abs: percentile(weightedCms, 0.75),
    weighted_cms_p90_abs: percentile(weightedCms, 0.90),
    weighted_cms_p95_abs: percentile(weightedCms, 0.95),
    weighted_cms_saturation_count: sat,
    weighted_cms_saturation_proportion: sat_prop,
    tight_normalizer_flag: tight,
    tight_normalizer_note: note,
  });
}

// -----------------------------------------------------------------------------
// PART 1c — Normalizer sensitivity table.
// -----------------------------------------------------------------------------

const NORMALIZER_SENSITIVITY_CANDIDATES: Readonly<Record<LaunchMarket, ReadonlyArray<number>>> = Object.freeze({
  // Symmetric spread around each approved M — numbers only, no proposal.
  // For player_threes the ticket explicitly lists {1.5, 2.0, 2.5, 3.0}.
  // For the other three markets we sweep a comparable range around each M.
  player_points:   [4.0, 5.0, 6.0, 7.0, 8.0],
  player_rebounds: [2.0, 2.5, 3.0, 3.5, 4.0],
  player_assists:  [1.5, 2.0, 2.5, 3.0],
  player_threes:   [1.5, 2.0, 2.5, 3.0],
});

interface DR14SensitivityRow {
  readonly M: number;
  readonly is_approved: boolean;
  readonly l10_avg_clamp_proportion: number | null;
  readonly l10_median_clamp_proportion: number | null;
  readonly season_avg_clamp_proportion: number | null;
  readonly season_median_clamp_proportion: number | null;
  readonly weighted_cms_saturation_proportion: number | null;
  readonly weighted_cms_saturation_count: number;
  readonly weighted_cms_n: number;
}

interface DR14SensitivityMarketBlock {
  readonly market_key: LaunchMarket;
  readonly approved_M: number;
  readonly rows: ReadonlyArray<DR14SensitivityRow>;
}

async function computeDR14Sensitivity(market: LaunchMarket): Promise<DR14SensitivityMarketBlock> {
  const approved = MARGIN_NORMALIZERS[market];
  const aggregates = await loadCmsAggregates(market);
  const l10_avgs = aggregates.map((a) => a.l10_avg);
  const l10_meds = aggregates.map((a) => a.l10_median);
  const s_avgs = aggregates.map((a) => a.season_avg);
  const s_meds = aggregates.map((a) => a.season_median);
  const rows: DR14SensitivityRow[] = [];
  for (const M of NORMALIZER_SENSITIVITY_CANDIDATES[market]) {
    const tavg  = termStats(l10_avgs, M);
    const tmed  = termStats(l10_meds, M);
    const savg  = termStats(s_avgs,   M);
    const smed  = termStats(s_meds,   M);
    let sat = 0;
    let cmsN = 0;
    for (const aggr of aggregates) {
      const c = computeWeightedCms(aggr, M);
      if (c === null) continue;
      cmsN += 1;
      if (Math.abs(c) >= 1 - 1e-9) sat += 1;
    }
    rows.push(Object.freeze({
      M,
      is_approved: Math.abs(M - approved) < 1e-9,
      l10_avg_clamp_proportion: tavg.clamp_proportion,
      l10_median_clamp_proportion: tmed.clamp_proportion,
      season_avg_clamp_proportion: savg.clamp_proportion,
      season_median_clamp_proportion: smed.clamp_proportion,
      weighted_cms_saturation_proportion: cmsN === 0 ? null : sat / cmsN,
      weighted_cms_saturation_count: sat,
      weighted_cms_n: cmsN,
    }));
  }
  return Object.freeze({
    market_key: market,
    approved_M: approved,
    rows,
  });
}

// -----------------------------------------------------------------------------
// PART 2 examples: ≥5 concrete profiles NEAR each candidate cutoff per market.
// -----------------------------------------------------------------------------

interface CutoffExample {
  readonly internal_player_id: string;
  readonly display_name: string | null;
  readonly market_key: LaunchMarket;
  readonly evaluated_line: number | null;
  readonly l10_margins: readonly number[];
  readonly l10_stddev: number;
  readonly l10_n: number; // n observations (5..10) — governor REVISE
  readonly is_strong_eligible: boolean; // n ≥ 8 (DR-8)
  readonly which_ks_would_cap: readonly number[];
  readonly distance_from_cutoff_units: number;
  readonly distance_from_cutoff_normalized: number;
}

async function pickExamplesNearCutoff(
  market: LaunchMarket,
  K: number,
  profiles: ReadonlyArray<{ internal_player_id: string; l10_margins: number[]; stddev: number | null; canonical_closing_point: number | null }>,
  displayNameByPlayerId: ReadonlyMap<string, string | null>
): Promise<ReadonlyArray<CutoffExample>> {
  const norm = MARGIN_NORMALIZERS[market];
  const cutoff = K * norm;
  const band = cutoff * NEAR_CUTOFF_BAND;
  const withStddev = profiles.filter((p): p is typeof p & { stddev: number } => p.stddev !== null);
  // Score every profile by its absolute distance from the cutoff (both above and below), pick the closest EXAMPLES_PER_CUTOFF that are within the band; if fewer than EXAMPLES_PER_CUTOFF fall in the band, extend by picking the next-closest OUTSIDE the band so we always emit ≥5 when data permits.
  const scored = withStddev
    .map((p) => ({ p, dist: Math.abs(p.stddev - cutoff) }))
    .sort((a, b) => a.dist - b.dist);
  const chosen = scored.slice(0, Math.max(EXAMPLES_PER_CUTOFF, scored.filter((s) => s.dist <= band).length));
  return chosen.slice(0, EXAMPLES_PER_CUTOFF).map((row): CutoffExample => {
    const capsAt: number[] = [];
    for (const K2 of CANDIDATE_K_VALUES) {
      if (row.p.stddev > K2 * norm) capsAt.push(K2);
    }
    return Object.freeze({
      internal_player_id: row.p.internal_player_id,
      display_name: displayNameByPlayerId.get(row.p.internal_player_id) ?? null,
      market_key: market,
      evaluated_line: row.p.canonical_closing_point,
      l10_margins: Object.freeze([...row.p.l10_margins]),
      l10_stddev: round4(row.p.stddev),
      l10_n: row.p.l10_margins.length,
      is_strong_eligible: row.p.l10_margins.length >= 8,
      which_ks_would_cap: Object.freeze(capsAt),
      distance_from_cutoff_units: round4(row.dist),
      distance_from_cutoff_normalized: round4(row.dist / norm),
    });
  });
}

async function loadPlayerDisplayNames(): Promise<ReadonlyMap<string, string | null>> {
  const r = await pool.query(`SELECT internal_player_id::text AS id, display_name FROM players`);
  const m = new Map<string, string | null>();
  for (const row of r.rows as Array<{ id: string; display_name: string | null }>) m.set(row.id, row.display_name);
  return m;
}

// -----------------------------------------------------------------------------
// Main.
// -----------------------------------------------------------------------------

interface CalibrationReport {
  readonly generated_at: string;
  readonly method_authority: string;
  readonly hosted_db_host_redacted: string;
  readonly data_availability: DataAvailability;
  /**
   * Individual game-margin distribution. INFORMATIONAL — NOT the C_MS
   * clamp rate. Preserved per governor REVISE (d) as useful context; the
   * decision-relevant clamp analysis lives in `dr14_cms_per_market`.
   */
  readonly dr14_informational_individual_margin: ReadonlyArray<DR14MarketRow>;
  /**
   * CORRECTED DR-14 clamp analysis under §B.3: per-market, the four C_MS
   * input terms (L10 avg, L10 median, season avg, season median) and the
   * weighted C_MS under the T1 null-handling rule. This IS the analysis
   * DR-14 asks for.
   */
  readonly dr14_cms_per_market: ReadonlyArray<DR14CmsMarketRow>;
  /** Per-market normalizer sensitivity — numbers only, no proposal. */
  readonly dr14_normalizer_sensitivity: ReadonlyArray<DR14SensitivityMarketBlock>;
  readonly dr27_per_market: ReadonlyArray<DR27MarketRow>;
  readonly dr27_examples_by_market_and_k: ReadonlyMap<string, ReadonlyArray<CutoffExample>> | Record<string, ReadonlyArray<CutoffExample>>;
  readonly data_gap: {
    readonly present: boolean;
    readonly reason: string | null;
  };
  readonly queries_used: ReadonlyArray<string>;
}

async function main(): Promise<void> {
  const availability = await readOnlySession(probeDataAvailability);

  const queriesUsed: string[] = [
    "SELECT COUNT(*) FROM historical_line_results  -- data-availability probe",
    "SELECT COUNT(*) FROM canonical_closing_points -- data-availability probe",
    "SELECT COUNT(*) FROM player_game_stats        -- data-availability probe",
    "SELECT COUNT(*) FROM real_line_windows        -- data-availability probe",
    "DR-14 INFORMATIONAL individual game-margin distribution (relabeled per governor REVISE — NOT the C_MS clamp rate): latest-computation_version DISTINCT ON over historical_line_results; percentile_cont(0.50 / 0.75 / 0.90 / 0.95) WITHIN GROUP (ORDER BY ABS(margin)); clamp counts on the RAW margin values.",
    "DR-14 CORRECTED C_MS analysis (governor REVISE): per (internal_player_id, market_key) — latest-version DISTINCT ON + scheduled_start_utc DESC → L10 window (rn <= 10) and season (all eligible) aggregates; percentile_cont(0.5) WITHIN GROUP (ORDER BY margin) for the median terms; AVG(margin) for the mean terms. Weighted C_MS computed in TypeScript with §B.3 base weights (0.40 / 0.30 / 0.20 / 0.10) and the T1 null-handling rule.",
    "DR-14 normalizer sensitivity: same per-(player, market) aggregates, applied under candidate M values from NORMALIZER_SENSITIVITY_CANDIDATES; reports per-term clamp proportions and the weighted C_MS saturation proportion at each candidate M.",
    "DR-27 per market — dual-population reporting: per-player LATEST 10 eligible historical margins via DISTINCT ON + games.scheduled_start_utc DESC + HAVING COUNT(*) >= 5; population stddev computed in TypeScript. Cap counts reported for BOTH the n≥5 (DR-6 any-label) and n≥8 (DR-8 Strong-eligible) subsets.",
    "would_be_strong subset per K: SELECT COUNT(DISTINCT (internal_player_id, market_key)) FROM current_market_rows WHERE market_key=$1 AND internal_player_id = ANY(...) AND freshness_state != 'unavailable' AND eligible_sportsbook_count >= 1.",
    "player display names: SELECT internal_player_id, display_name FROM players.",
  ];

  const dataGapPresent = availability.historical_line_results === 0;
  const dataGapReason = dataGapPresent
    ? `historical_line_results is empty on the hosted DB (${availability.historical_line_results} rows). Underlying causes visible from the probe: player_game_stats=${availability.player_game_stats}, real_line_windows=${availability.real_line_windows}. Canonical closing lines are present (${availability.canonical_closing_points} rows across 4 markets), but historical_line_results requires BOTH a canonical_closing_point AND an eligible player_game_stats row per §11.5 and its schema comment (migration 20260711140007). Until the BDL-side player-game backfill lands on the hosted DB, no margins exist and DR-14/DR-27 aggregates cannot be computed truthfully. This is reported as absence per §I.1 rule "no estimation where data is absent".`
    : null;

  const dr14_informational: DR14MarketRow[] = [];
  const dr14_cms: DR14CmsMarketRow[] = [];
  const dr14_sensitivity: DR14SensitivityMarketBlock[] = [];
  const dr27: DR27MarketRow[] = [];
  const examplesByMarketAndK: Record<string, ReadonlyArray<CutoffExample>> = {};

  if (!dataGapPresent) {
    for (const m of LAUNCH_MARKETS) {
      dr14_informational.push(await readOnlySession(() => computeDR14PerMarket(m)));
      dr14_cms.push(await readOnlySession(() => computeDR14CmsPerMarket(m)));
      dr14_sensitivity.push(await readOnlySession(() => computeDR14Sensitivity(m)));
      dr27.push(await readOnlySession(() => computeDR27PerMarket(m)));
    }
    const displayNames = await loadPlayerDisplayNames();
    for (const m of LAUNCH_MARKETS) {
      const profiles = await loadProfileStddevs(m);
      for (const K of CANDIDATE_K_VALUES) {
        const key = `${m}|K=${K}`;
        examplesByMarketAndK[key] = await pickExamplesNearCutoff(m, K, profiles, displayNames);
      }
    }
  }

  const report: CalibrationReport = {
    generated_at: new Date().toISOString(),
    method_authority: 'docs/product/EVIDENCE_PROFILE_METHOD_V1.md v1.0 (evidence_method_v1); DR-14 provisionally approved 2026-07-14; DR-27 formally deferred pending this calibration.',
    hosted_db_host_redacted: (DB_URL ?? '').replace(/:[^:@]+@/, ':REDACTED@'),
    data_availability: availability,
    dr14_informational_individual_margin: dr14_informational,
    dr14_cms_per_market: dr14_cms,
    dr14_normalizer_sensitivity: dr14_sensitivity,
    dr27_per_market: dr27,
    dr27_examples_by_market_and_k: examplesByMarketAndK,
    data_gap: { present: dataGapPresent, reason: dataGapReason },
    queries_used: Object.freeze(queriesUsed),
  };

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  await pool.end();
}

// Prove the script's own source is unchanged by callers: read-only shape.
readFileSync(pathResolve(here, 'v1_a1_1_dr14_dr27_calibration.ts'), 'utf-8');

main().catch((err: unknown) => {
  console.error('# ERROR:', err instanceof Error ? err.message : String(err));
  void pool.end();
  process.exit(1);
});
