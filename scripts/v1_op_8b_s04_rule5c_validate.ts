// V1-OP-8b §0.4 — STANDING RULE 5c validation pass (ZERO COST, read-only).
//
// Rule 5c: any output-producing component whose correctness depends on
// production data characteristics must be validated against representative
// PRODUCTION data before any paid execution. Synthetic fixtures verify the
// implementation; real data verifies the assumptions.
//
// GAP-41 is exactly what this catches: the matcher was fixture-green while
// silently forcing every POR/TOR game to (c), because no fixture contained a
// city-less `teams.display_name`. This pass runs the REAL matcher over the REAL
// 24-game plan against the REAL `teams` rows and the REAL provider vocabulary,
// and FAILS if any game is unmatchable for a reason that originates on our side.
//
// The provider vocabulary is the UNION of two free sources:
//   (1) `/v4/sports/{sport}/events` — verified `x-requests-last: 0`, but it
//       only covers TODAY's slate, so on its own it under-tests the matcher;
//   (2) `provider_games.raw_*_team` + `oddsapi_event_snapshots.raw_*_team` —
//       the provider's OWN strings, already persisted by prior paid calls.
// Together they cover the full league. No historical endpoint is touched, so
// this pass cannot spend a credit.

import { openPool } from '../src/db/connection.js';
import { matchTeamName, nameTokens } from '../src/lines/discoveryTeamMatch.js';
import { buildProbePlan, type UnmappedGame } from '../src/lines/unmappedDiscoverySample.js';
import { readFileSync } from 'node:fs';

interface ProviderEvent { readonly home_team?: string; readonly away_team?: string }

async function main(): Promise<void> {
  const plan_path = process.argv[2] ?? 'docs/product/manifests/V1_OP_8B_S04_DISCOVERY_PLAN.jsonl';
  const games: UnmappedGame[] = readFileSync(plan_path, 'utf8')
    .split('\n').filter((l) => l.trim() !== '' && !l.trimStart().startsWith('#'))
    .map((l) => JSON.parse(l) as UnmappedGame);

  // ---- 1. The live provider vocabulary (FREE endpoint) ----
  const key = process.env.ODDS_API_KEY ?? '';
  if (key === '') throw new Error('ODDS_API_KEY required (read-only, free endpoint)');
  const res = await fetch(`https://api.the-odds-api.com/v4/sports/basketball_wnba/events?apiKey=${key}`);
  const cost = res.headers.get('x-requests-last');
  const events = (await res.json()) as ProviderEvent[];
  const vocab = [...new Set(events.flatMap((e) => [e.home_team, e.away_team]).filter((x): x is string => !!x))].sort();
  console.log('=== RULE 5c VALIDATION — §0.4 discovery matcher vs PRODUCTION data ===');
  console.log(`  provider vocabulary: ${vocab.length} names from /v4/sports/.../events`);
  console.log(`  COST of this pass:   x-requests-last = ${cost}  (must be 0)`);
  if (cost !== '0') throw new Error(`expected a free endpoint, observed x-requests-last=${cost}`);

  // ---- 2. Our team identities, as actually stored ----
  const db_url = process.env.SLIPLABZ_HOSTED_DATABASE_URL ?? '';
  const pool = openPool({ connectionString: db_url, max: 2, statement_timeout_ms: 30_000, ssl: 'require' });
  const teams = (await pool.query(
    `SELECT abbreviation ab, display_name dn FROM teams ORDER BY abbreviation`, [])).rows as Array<{ ab: string; dn: string }>;
  // (2) the provider's own strings, from calls we already paid for.
  const stored = (await pool.query(`SELECT DISTINCT n FROM (
      SELECT raw_home_team n FROM provider_games WHERE provider='odds_api' UNION ALL
      SELECT raw_away_team FROM provider_games WHERE provider='odds_api' UNION ALL
      SELECT raw_home_team FROM oddsapi_event_snapshots UNION ALL
      SELECT raw_away_team FROM oddsapi_event_snapshots) s WHERE n IS NOT NULL`, [])).rows as Array<{ n: string }>;
  await pool.end();
  for (const r of stored) if (!vocab.includes(r.n)) vocab.push(r.n);
  vocab.sort();
  console.log(`  + ${stored.length} provider names already stored in the DB -> ${vocab.length} total`);

  // ---- 3. Which of OUR names can reach SOME provider name at all? ----
  const used = new Set(games.flatMap((g) => [g.home_name, g.away_name]).filter((x): x is string => !!x));
  console.log('\n  our display_name -> provider match reachability (names used by the 24 plan games):');
  const unreachable: string[] = [];
  for (const ours of [...used].sort()) {
    const hits = vocab.filter((v) => matchTeamName(ours, v) !== 'none');
    const kind = hits.length === 1 ? matchTeamName(ours, hits[0]!) : hits.length === 0 ? 'NONE' : 'AMBIGUOUS';
    const flag = hits.length === 1 ? '   ' : ' <<';
    console.log(`   ${flag} ${ours.padEnd(24)} -> ${(hits[0] ?? '(none)').padEnd(24)} [${kind}]`);
    if (hits.length !== 1) unreachable.push(`${ours} (${hits.length} provider matches)`);
  }

  // ---- 4. The artifact check: is any game (c) for a reason on OUR side? ----
  const cityless = teams.filter((t) => nameTokens(t.dn).length === 1 && !/^(tbd|east|west)$/i.test(t.dn));
  console.log('\n  city-less display_name rows (the GAP-41 shape):');
  for (const t of cityless) {
    const hits = vocab.filter((v) => matchTeamName(t.dn, v) !== 'none');
    console.log(`      ${t.ab.padEnd(5)}${t.dn.padEnd(12)} -> ${hits.length === 1 ? `${hits[0]} [RESOLVED]` : `${hits.length} matches [UNRESOLVED]`}`);
  }

  // ---- 5. Probe plan (GAP-42) ----
  const { groups, no_boundary } = buildProbePlan(games);
  console.log(`\n  GAP-42 probe plan: ${groups.length} distinct close boundaries for ${games.length} games`
    + `  (unprobed, no boundary: ${no_boundary.length})`);
  console.log(`  earliest probe ${groups[0]?.probe_at}   latest ${groups[groups.length - 1]?.probe_at}`);
  const badPrecision = groups.filter((g) => !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(g.probe_at));
  const endOfDay = groups.filter((g) => g.probe_at.endsWith('23:59:59Z'));
  console.log(`  malformed timestamps: ${badPrecision.length}   end-of-day (GAP-42 defect) probes: ${endOfDay.length}`);

  // ---- VERDICT ----
  // TBD has no team identity at all, so it is a CORRECT (c) — never an artifact.
  const realFailures = unreachable.filter((u) => !u.startsWith('TBD'));
  const fail = realFailures.length > 0 || badPrecision.length > 0 || endOfDay.length > 0;
  console.log('\n=== VERDICT ===');
  if (unreachable.length > 0) {
    console.log('  names not resolving to exactly one provider team:');
    for (const u of unreachable) console.log(`    - ${u}`);
  }
  console.log(fail
    ? '  FAIL — a name gap on OUR side would still be absorbed into (c). Do NOT re-fire.'
    : '  PASS — every plan team resolves to exactly one provider team (TBD excepted by definition),\n         probes are boundary-anchored and well-formed. Gate cleared for a paid re-fire.');
  if (fail) process.exit(1);
}

main().catch((e: unknown) => { console.error(e); process.exit(1); });
