// V1-4b Stage 2 Phase A supplement 2 — offline team-mapping review.
//
// What this does (governor-authorized scope):
//   1. Quarantines the two BDL provider_teams the governor ruled
//      out-of-product-scope (provider_team_id 18 "Team WNBA" / all-stars
//      and 29 "Puerto Rico" / national team), and appends the corresponding
//      mapping_history rows. This is the ONLY hosted-DB write in the
//      supplement 2 pass.
//   2. Extracts every distinct Odds API team identity string from the 59
//      cached discovery responses, with per-string event counts, and
//      produces a proposed mapping table (provider string → proposed
//      internal team + evidence). Every string is included, even ones with
//      no plausible internal match. Governor approves line by line; no
//      odds_api provider_teams row is written.
//   3. Re-runs the what-if resolution OFFLINE against the same cache and
//      the current hosted-DB game/team state, then explains every one of
//      the 88 what-if-queued events: which team string, tolerance failure,
//      or ambiguity.
//
// Zero live-provider credits. Reads cache files + hosted DB only.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = pathResolve(here, '../docs/product/reports/_stage2_discovery_cache');
const REPORT_OUT = pathResolve(here, '../docs/product/reports/V1_4B_STAGE2_MAPPING_REVIEW.md');

const DB_URL = process.env['SLIPLABZ_HOSTED_DATABASE_URL'];
if (DB_URL === undefined || DB_URL === '') {
  console.error('SLIPLABZ_HOSTED_DATABASE_URL required');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: DB_URL, max: 4 });

interface CachedDiscovery {
  slate_date: string;
  at_timestamp: string;
  http_status: number;
  body: { data?: unknown[] };
}
interface CachedEvent {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
}
interface InternalTeam {
  internal_team_id: string;
  display_name: string;
  abbreviation: string;
  classification: string;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’'`\-‐‑‒–—_.,]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lastToken(s: string): string {
  const parts = normalize(s).split(' ').filter((x) => x.length > 0);
  return parts.length === 0 ? '' : parts[parts.length - 1]!;
}

// ---------- (1) Quarantine ----------

async function quarantinePendingReviewTeams(): Promise<{ updated: number; historyRows: number }> {
  const targets: Array<{ pid: string; label: string }> = [
    { pid: '18', label: 'Team WNBA / WNBASTARS (all-star)' },
    { pid: '29', label: 'Puerto Rico / PUERTORICO (national team)' },
  ];
  let updated = 0;
  let historyRows = 0;
  for (const t of targets) {
    const cur = await pool.query(
      `SELECT provider_team_row_id, internal_team_id, mapping_state
         FROM provider_teams
         WHERE provider='balldontlie' AND provider_team_id=$1`,
      [t.pid]
    );
    if (cur.rowCount === 0) {
      console.log(`# provider_team_id=${t.pid}: no row found; skipping.`);
      continue;
    }
    const row = cur.rows[0] as {
      provider_team_row_id: string;
      internal_team_id: string | null;
      mapping_state: string;
    };
    if (row.mapping_state === 'quarantined') {
      console.log(`# provider_team_id=${t.pid} already quarantined; skipping update, but ensuring history.`);
    } else {
      await pool.query(
        `UPDATE provider_teams SET mapping_state='quarantined', updated_at=now()
           WHERE provider_team_row_id=$1`,
        [row.provider_team_row_id]
      );
      updated += 1;
    }
    // Append mapping_history row per action; idempotency check: skip if the
    // most recent history row for this entity is already the same action+reason.
    const last = await pool.query(
      `SELECT action, reason FROM mapping_history
         WHERE provider='balldontlie' AND entity_kind='team' AND provider_entity_id=$1
         ORDER BY created_at DESC LIMIT 1`,
      [t.pid]
    );
    const lastRow = (last.rows[0] ?? null) as { action: string; reason: string } | null;
    if (lastRow !== null && lastRow.action === 'quarantined' && lastRow.reason === 'out_of_product_scope') {
      console.log(`# mapping_history for pid=${t.pid} already terminal at quarantined/out_of_product_scope.`);
      continue;
    }
    await pool.query(
      `INSERT INTO mapping_history
         (provider, entity_kind, provider_entity_id, internal_entity_id,
          prior_internal_entity_id, action, reason, actor, actor_note)
       VALUES ('balldontlie','team',$1,$2,$2,'quarantined','out_of_product_scope','v1_4b_supp2','governor ruling: ${t.label.replace(/'/g, "''")}')`,
      [t.pid, row.internal_team_id]
    );
    historyRows += 1;
    console.log(`# quarantined pid=${t.pid} (${t.label})`);
  }
  return { updated, historyRows };
}

// ---------- (2) Distinct provider strings + proposed mapping ----------

async function loadInternalTeams(): Promise<InternalTeam[]> {
  const r = await pool.query(
    `SELECT internal_team_id, display_name, abbreviation, classification FROM teams ORDER BY display_name`
  );
  return r.rows as InternalTeam[];
}

interface ProposedMapping {
  provider_string: string;
  event_ref_count: number;
  evidence: 'exact' | 'normalized_lastword' | 'none';
  proposed_internal_team_id: string | null;
  proposed_internal_display_name: string | null;
  notes: string;
}

function proposeMapping(providerString: string, teams: InternalTeam[]): Omit<ProposedMapping, 'provider_string' | 'event_ref_count'> {
  const providerNorm = normalize(providerString);
  // 1. Exact case-insensitive display_name match.
  for (const t of teams) {
    if (normalize(t.display_name) === providerNorm) {
      return {
        evidence: 'exact',
        proposed_internal_team_id: t.internal_team_id,
        proposed_internal_display_name: t.display_name,
        notes: `exact case-insensitive normalized display_name match`,
      };
    }
  }
  // 2. Last-word token match (handles expansion teams where BDL raw_full_name
  //    is missing the city — e.g. Odds API "Portland Fire" vs BDL "Fire").
  const providerLast = lastToken(providerString);
  const candidates = teams.filter((t) => {
    if (t.classification !== 'current_franchise' && t.classification !== 'unknown') return false;
    const teamNorm = normalize(t.display_name);
    // The internal display_name must equal a single token AND be the last
    // token of the provider string. This avoids matching "New York Liberty"
    // against internal "New" or similar accidents.
    return teamNorm.split(' ').length === 1 && teamNorm === providerLast;
  });
  if (candidates.length === 1) {
    const t = candidates[0]!;
    return {
      evidence: 'normalized_lastword',
      proposed_internal_team_id: t.internal_team_id,
      proposed_internal_display_name: t.display_name,
      notes: `provider last token '${providerLast}' equals single-token internal display_name — likely an expansion team where BDL raw_full_name omits the city (BDL §12B.7)`,
    };
  }
  if (candidates.length > 1) {
    return {
      evidence: 'none',
      proposed_internal_team_id: null,
      proposed_internal_display_name: null,
      notes: `AMBIGUOUS last-token match against ${candidates.length} internal teams: ${candidates.map((c) => c.display_name).join(', ')} — governor must disambiguate`,
    };
  }
  return {
    evidence: 'none',
    proposed_internal_team_id: null,
    proposed_internal_display_name: null,
    notes: 'no exact display_name match; last-word token has no unique single-token internal candidate',
  };
}

function loadAllCachedEvents(): {
  discoveries: CachedDiscovery[];
  events_raw: Array<{ slate_date: string; event: CachedEvent }>;
  events_unique: Array<{ first_seen_on_slate: string; event: CachedEvent }>;
} {
  const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json')).sort();
  const discoveries: CachedDiscovery[] = [];
  const events_raw: Array<{ slate_date: string; event: CachedEvent }> = [];
  const byId = new Map<string, { first_seen_on_slate: string; event: CachedEvent }>();
  for (const f of files) {
    const raw = readFileSync(pathResolve(CACHE_DIR, f), 'utf-8');
    const d = JSON.parse(raw) as CachedDiscovery;
    discoveries.push(d);
    const evs = (d.body.data ?? []) as CachedEvent[];
    for (const e of evs) {
      // filter to well-formed events (mirrors discovery validator)
      if (typeof e?.id !== 'string' || typeof e?.home_team !== 'string' || typeof e?.away_team !== 'string' || typeof e?.commence_time !== 'string') continue;
      events_raw.push({ slate_date: d.slate_date, event: e });
      // The Odds API historical events endpoint returns forward-looking
      // events at the snapshot boundary, so the same event id appears in
      // multiple slate-date discovery responses. Phase B needs one
      // event-odds call per unique event id — deduplicate here.
      if (!byId.has(e.id)) byId.set(e.id, { first_seen_on_slate: d.slate_date, event: e });
    }
  }
  return { discoveries, events_raw, events_unique: Array.from(byId.values()) };
}

// ---------- (3) What-if resolution offline ----------

interface HostedGameRow {
  internal_game_id: string;
  home_team_id: string;
  away_team_id: string;
  scheduled_start_utc: string;
}
async function loadHostedGamesFinal(): Promise<HostedGameRow[]> {
  const r = await pool.query(
    `SELECT internal_game_id, home_team_id, away_team_id, scheduled_start_utc::text AS scheduled_start_utc
       FROM games WHERE status='final'`
  );
  return r.rows as HostedGameRow[];
}

interface WhatIfEventOutcome {
  slate_date: string;
  provider_event_id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  kind: 'resolved_exact' | 'resolved_tolerance' | 'queued';
  reason: string;
  detail: string;
}

function whatIfPerEvent(
  ev: { slate_date: string; event: CachedEvent },
  provStringToInternal: Map<string, string>,
  games: HostedGameRow[]
): WhatIfEventOutcome {
  const homeKey = normalize(ev.event.home_team);
  const awayKey = normalize(ev.event.away_team);
  const homeInt = provStringToInternal.get(homeKey) ?? null;
  const awayInt = provStringToInternal.get(awayKey) ?? null;

  const base = {
    slate_date: ev.slate_date,
    provider_event_id: ev.event.id,
    home_team: ev.event.home_team,
    away_team: ev.event.away_team,
    commence_time: ev.event.commence_time,
  };
  if (homeInt === null || awayInt === null) {
    return {
      ...base,
      kind: 'queued' as const,
      reason: 'unresolved_provider_team',
      detail: `home='${ev.event.home_team}'→${homeInt === null ? 'UNMAPPED' : 'ok'} away='${ev.event.away_team}'→${awayInt === null ? 'UNMAPPED' : 'ok'}`,
    };
  }
  if (homeInt === awayInt) {
    return { ...base, kind: 'queued', reason: 'self_match_invalid', detail: `both teams resolved to internal ${homeInt}` };
  }
  const commenceMs = Date.parse(ev.event.commence_time);
  const ordered = games.filter((g) => g.home_team_id === homeInt && g.away_team_id === awayInt);
  if (ordered.length === 0) {
    const reversed = games.filter((g) => g.home_team_id === awayInt && g.away_team_id === homeInt);
    if (reversed.length > 0) return { ...base, kind: 'queued', reason: 'ordered_teams_disagree', detail: `${reversed.length} reversed-ordered internal candidate(s)` };
    return { ...base, kind: 'queued', reason: 'unmatched', detail: `no internal game with (home,away) even after mapping teams` };
  }
  const withDelta = ordered.map((g) => ({
    game: g,
    delta_seconds: Math.round((Date.parse(g.scheduled_start_utc) - commenceMs) / 1000),
  }));
  const exact = withDelta.filter((c) => c.delta_seconds === 0);
  if (exact.length === 1) return { ...base, kind: 'resolved_exact', reason: '', detail: `internal_game_id=${exact[0]!.game.internal_game_id}` };
  if (exact.length > 1) return { ...base, kind: 'queued', reason: 'ambiguous_multiple_candidates', detail: `${exact.length} exact-time internal candidates` };
  const within = withDelta.filter((c) => Math.abs(c.delta_seconds) <= 15 * 60);
  if (within.length === 1) return { ...base, kind: 'resolved_tolerance', reason: '', detail: `internal_game_id=${within[0]!.game.internal_game_id} delta_seconds=${within[0]!.delta_seconds}` };
  if (within.length > 1) return { ...base, kind: 'queued', reason: 'ambiguous_multiple_candidates', detail: `${within.length} within-tolerance internal candidates` };
  // ordered exists but none within tolerance
  const closest = withDelta.reduce((a, b) => (Math.abs(a.delta_seconds) < Math.abs(b.delta_seconds) ? a : b));
  return {
    ...base,
    kind: 'queued',
    reason: 'time_window_exceeded',
    detail: `${ordered.length} ordered internal candidate(s); closest delta_seconds=${closest.delta_seconds}`,
  };
}

// ---------- Main ----------

async function main(): Promise<void> {
  console.log('# V1-4b supplement 2 offline analysis starting');
  console.log(`#   hosted DB: ${DB_URL!.replace(/:[^:@]+@/, ':REDACTED@')}`);

  // ---- (1) Quarantine ----
  console.log('\n===== step 1: quarantine pending_review teams =====');
  const q = await quarantinePendingReviewTeams();
  console.log(`# updated ${q.updated} provider_teams row(s); appended ${q.historyRows} mapping_history row(s)`);

  const teamsAfter = await pool.query(
    `SELECT provider_team_id, raw_full_name, raw_abbreviation, mapping_state
       FROM provider_teams
       WHERE provider='balldontlie' AND mapping_state <> 'approved'
       ORDER BY provider_team_id`
  );
  console.log('# non-approved BDL provider_teams NOW:');
  console.log(JSON.stringify(teamsAfter.rows, null, 2));

  // ---- (2) Cache extraction ----
  console.log('\n===== step 2: extract distinct odds_api team strings from cache =====');
  const { discoveries, events_raw, events_unique } = loadAllCachedEvents();
  console.log(`# cache files loaded: ${discoveries.length}`);
  console.log(`# events observed (raw across discoveries): ${events_raw.length}`);
  console.log(`# unique event ids (dedup by provider event id): ${events_unique.length}`);

  // String counts are based on UNIQUE events (each event id counted once).
  const stringCounts = new Map<string, number>();
  for (const e of events_unique) {
    for (const s of [e.event.home_team, e.event.away_team]) {
      stringCounts.set(s, (stringCounts.get(s) ?? 0) + 1);
    }
  }
  console.log(`# distinct provider team strings: ${stringCounts.size}`);

  const internalTeams = await loadInternalTeams();
  const proposals: ProposedMapping[] = [];
  for (const [s, n] of Array.from(stringCounts.entries()).sort((a, b) => b[1] - a[1])) {
    const proposal = proposeMapping(s, internalTeams);
    proposals.push({
      provider_string: s,
      event_ref_count: n,
      ...proposal,
    });
  }

  console.log('\n---- PROPOSED MAPPING TABLE (governor approves line by line) ----');
  const w1 = Math.max(15, ...proposals.map((p) => p.provider_string.length));
  const w2 = 5;
  const w3 = Math.max(20, ...proposals.map((p) => (p.proposed_internal_display_name ?? '').length));
  const w4 = 20;
  console.log(
    'provider_string'.padEnd(w1) + ' | ' +
    'refs'.padStart(w2) + ' | ' +
    'proposed_internal'.padEnd(w3) + ' | ' +
    'evidence'.padEnd(w4)
  );
  console.log('-'.repeat(w1) + '-+-' + '-'.repeat(w2) + '-+-' + '-'.repeat(w3) + '-+-' + '-'.repeat(w4));
  for (const p of proposals) {
    console.log(
      p.provider_string.padEnd(w1) + ' | ' +
      String(p.event_ref_count).padStart(w2) + ' | ' +
      (p.proposed_internal_display_name ?? '(none)').padEnd(w3) + ' | ' +
      p.evidence.padEnd(w4)
    );
  }

  // ---- (3) What-if per-event ----
  console.log('\n===== step 3: what-if resolution per event (offline) =====');
  // Build a map from normalized provider_string -> internal_team_id using
  // the exact-and-lastword proposals ONLY when the proposal has a target.
  // This mirrors the "if the governor approved every proposal" scenario.
  const provStringToInternal = new Map<string, string>();
  for (const p of proposals) {
    if (p.proposed_internal_team_id !== null) {
      provStringToInternal.set(normalize(p.provider_string), p.proposed_internal_team_id);
    }
  }
  console.log(`# provStringToInternal cache size: ${provStringToInternal.size} (out of ${proposals.length} distinct strings)`);

  const games = await loadHostedGamesFinal();
  const perEvent: WhatIfEventOutcome[] = events_unique.map((e) =>
    whatIfPerEvent({ slate_date: e.first_seen_on_slate, event: e.event }, provStringToInternal, games)
  );

  // Aggregate.
  const byKind: Record<string, number> = { resolved_exact: 0, resolved_tolerance: 0, queued: 0 };
  const queuedByReason: Record<string, number> = {};
  const queuedByString: Record<string, number> = {};
  const queuedByStringPair: Record<string, number> = {};
  for (const r of perEvent) {
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    if (r.kind === 'queued') {
      queuedByReason[r.reason] = (queuedByReason[r.reason] ?? 0) + 1;
      if (r.reason === 'unresolved_provider_team') {
        // Attribute to whichever string was UNMAPPED.
        if (!provStringToInternal.has(normalize(r.home_team))) {
          queuedByString[r.home_team] = (queuedByString[r.home_team] ?? 0) + 1;
        }
        if (!provStringToInternal.has(normalize(r.away_team))) {
          queuedByString[r.away_team] = (queuedByString[r.away_team] ?? 0) + 1;
        }
      } else {
        const pair = `${r.home_team} @ ${r.away_team}`;
        queuedByStringPair[pair] = (queuedByStringPair[pair] ?? 0) + 1;
      }
    }
  }
  console.log('# what-if aggregate:');
  console.log(JSON.stringify({ byKind, queuedByReason }, null, 2));
  console.log('# queued (unresolved_provider_team) attribution by unmapped string:');
  console.log(JSON.stringify(queuedByString, null, 2));
  console.log('# queued (other reasons) by pair:');
  console.log(JSON.stringify(queuedByStringPair, null, 2));

  // ---- Emit companion report file ----
  const md: string[] = [];
  md.push('# V1-4b Stage 2 Team Mapping Review (supplement 2)');
  md.push('');
  md.push('**Kind:** OFFLINE analysis. Zero live-provider credits (Odds API + BDL both idle).');
  md.push('**Hosted-DB writes performed:** quarantine of BDL provider_team_id 18 and 29 + two mapping_history rows.');
  md.push('**Hosted-DB writes withheld:** none of the `odds_api` proposals below have been persisted. Governor approves line by line before Phase B.');
  md.push('');
  md.push('## Step 1 — Quarantine outcome');
  md.push('');
  md.push(`Updated ${q.updated} provider_teams row(s); appended ${q.historyRows} mapping_history row(s).`);
  md.push('');
  md.push('Non-approved BDL provider_teams after quarantine:');
  md.push('');
  md.push('```json');
  md.push(JSON.stringify(teamsAfter.rows, null, 2));
  md.push('```');
  md.push('');
  md.push('## Step 2 — Proposed odds_api → internal team mapping table');
  md.push('');
  md.push(`Cache files loaded: ${discoveries.length}. Raw events across discoveries: ${events_raw.length}. **Unique event ids** (dedup by provider event id): ${events_unique.length}. Distinct provider team strings: ${stringCounts.size}.`);
  md.push('');
  md.push('_Note on dedup: the Odds API historical events endpoint returns forward-looking events, so a given game id appears in multiple slate-date discovery responses. Phase B needs one event-odds request per **unique** id — counts below are on the deduplicated universe. `event refs` = the number of unique-event pairs the string participates in (each unique event contributes at most 2 refs: one home, one away)._');
  md.push('');
  md.push('| provider_string | event refs | proposed internal (id) | proposed internal (display) | evidence | notes |');
  md.push('|---|---:|---|---|---|---|');
  for (const p of proposals) {
    md.push(
      `| \`${p.provider_string}\` | ${p.event_ref_count} | ${p.proposed_internal_team_id === null ? '(none)' : `\`${p.proposed_internal_team_id}\``} | ${p.proposed_internal_display_name === null ? '(none)' : `\`${p.proposed_internal_display_name}\``} | \`${p.evidence}\` | ${p.notes.replace(/\|/g, '\\|')} |`
    );
  }
  md.push('');
  md.push('Evidence key:');
  md.push('');
  md.push('- **exact** — the normalized (lowercase, punctuation-collapsed) provider string equals the normalized internal `display_name`.');
  md.push('- **normalized_lastword** — the last token of the normalized provider string equals a single-token internal `display_name` (handles BDL expansion teams whose `raw_full_name` omits the city per BDL §12B.7).');
  md.push('- **none** — no plausible internal candidate; governor must either mint a new internal team or reject the mapping. Zero of these should exist for a properly seeded 2026 season.');
  md.push('');
  md.push('## Step 3 — What-if-queued breakdown (governor-visible exclusion set)');
  md.push('');
  md.push('If the governor approves every non-`none` proposal in Step 2, projected outcome:');
  md.push('');
  md.push('| bucket | count |');
  md.push('|---|---:|');
  md.push(`| resolved_exact | ${byKind['resolved_exact']} |`);
  md.push(`| resolved_tolerance | ${byKind['resolved_tolerance']} |`);
  md.push(`| queued | ${byKind['queued']} |`);
  md.push(`| **total unique events** | ${events_unique.length} |`);
  md.push('');
  md.push(`**Phase B forecast (uses cached discovery, no new discovery credits needed):** ${(byKind['resolved_exact']! + byKind['resolved_tolerance']!) * 40} credits for event-odds calls only. Ceiling: 12,000. ${(byKind['resolved_exact']! + byKind['resolved_tolerance']!) * 40 > 12000 ? '**OVER CEILING** — Phase B must halt-before-exceed after ' + Math.floor(12000/40) + ' events (' + (12000/40*40) + ' credits), leaving ' + (byKind['resolved_exact']! + byKind['resolved_tolerance']! - Math.floor(12000/40)) + ' events unprocessed.' : 'Under ceiling by ' + (12000 - (byKind['resolved_exact']! + byKind['resolved_tolerance']!) * 40) + ' credits.'}`);
  md.push('');
  md.push('Queued breakdown by reason (all events; not just per-slice):');
  md.push('');
  md.push('| reason | count |');
  md.push('|---|---:|');
  for (const [reason, n] of Object.entries(queuedByReason).sort((a, b) => b[1] - a[1])) {
    md.push(`| ${reason} | ${n} |`);
  }
  md.push('');
  md.push('For queued `unresolved_provider_team` events, attribution to the specific unmapped provider string:');
  md.push('');
  md.push('| unmapped provider string | contributes to N queued events |');
  md.push('|---|---:|');
  const unmappedSorted = Object.entries(queuedByString).sort((a, b) => b[1] - a[1]);
  if (unmappedSorted.length === 0) md.push('| _(none)_ | 0 |');
  for (const [s, n] of unmappedSorted) md.push(`| \`${s}\` | ${n} |`);
  md.push('');
  md.push('For queued events with OTHER reasons (e.g. `time_window_exceeded`, `ambiguous_multiple_candidates`, `ordered_teams_disagree`, `unmatched`), grouped by the ordered team-string pair with per-event detail:');
  md.push('');
  md.push('| pair (home @ away) | reason | slate_date | commence_time | detail |');
  md.push('|---|---|---|---|---|');
  const otherReasoned = perEvent.filter((r) => r.kind === 'queued' && r.reason !== 'unresolved_provider_team');
  if (otherReasoned.length === 0) md.push('| _(none)_ | | | | |');
  for (const r of otherReasoned) {
    md.push(`| \`${r.home_team} @ ${r.away_team}\` | \`${r.reason}\` | ${r.slate_date} | ${r.commence_time} | ${r.detail.replace(/\|/g, '\\|')} |`);
  }
  md.push('');
  md.push('## Zero-spend confirmation');
  md.push('');
  md.push('- Odds API calls: **0** (analysis reads cache only).');
  md.push('- BDL calls: **0**.');
  md.push('- Hosted-DB writes: only the two team quarantines + two mapping_history rows described in Step 1.');
  md.push('- No `odds_api` `provider_teams` rows created; no `provider_games` rows created; no `event_reconciliation_queue` rows created.');
  md.push('');
  mkdirSync(dirname(REPORT_OUT), { recursive: true });
  writeFileSync(REPORT_OUT, md.join('\n'));
  console.log(`\n# supplement 2 report written to ${REPORT_OUT}`);
}

main()
  .catch((e) => {
    console.error('# supp2 failed:', e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
