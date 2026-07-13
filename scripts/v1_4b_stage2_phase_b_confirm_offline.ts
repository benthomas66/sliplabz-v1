// V1-4b Stage 2 Phase B — P2 confirmation.
//
// Re-runs event resolution OFFLINE from the discovery cache, this time using
// the wired path (loadSeedResolutionContext + resolveOddsapiEventForSeed)
// against the LIVE hosted DB (which now has the 15 approved odds_api team
// mappings from P1). Confirms the projected 141+29=170 resolved / 6 queued
// outcome and halts if materially different.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import {
  loadSeedResolutionContext,
  resolveOddsapiEventForSeed,
  type SeedEventResolutionOutcome,
} from '../src/seed/orchestrator/eventResolutionForSeed.js';
import type { EventReconciliationInput } from '../src/identity/types.js';
import type { SliplabzPool } from '../src/db/connection.js';

const here = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = pathResolve(here, '../docs/product/reports/_stage2_discovery_cache');

const rawPool = new pg.Pool({ connectionString: process.env['SLIPLABZ_HOSTED_DATABASE_URL']!, max: 4 });
const pool: SliplabzPool = Object.freeze({
  raw: rawPool,
  query: (sql: string, params?: unknown[]) => (params === undefined ? rawPool.query(sql) : rawPool.query(sql, params)),
  connect: () => rawPool.connect(),
  end: () => rawPool.end(),
});

interface CachedEvent { id: string; home_team: string; away_team: string; commence_time: string }

function loadUnique(): Array<{ first_seen_on_slate: string; event: CachedEvent }> {
  const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json')).sort();
  const byId = new Map<string, { first_seen_on_slate: string; event: CachedEvent }>();
  for (const f of files) {
    const raw = readFileSync(pathResolve(CACHE_DIR, f), 'utf-8');
    const d = JSON.parse(raw) as { slate_date: string; body: { data?: CachedEvent[] } };
    for (const e of d.body.data ?? []) {
      if (typeof e?.id !== 'string' || typeof e?.home_team !== 'string' || typeof e?.away_team !== 'string' || typeof e?.commence_time !== 'string') continue;
      if (!byId.has(e.id)) byId.set(e.id, { first_seen_on_slate: d.slate_date, event: e });
    }
  }
  return Array.from(byId.values());
}

const PROJECTED = { resolved_exact: 141, resolved_tolerance: 29, queued: 6 };

async function main(): Promise<void> {
  const events = loadUnique();
  console.log(`# unique events from cache: ${events.length}`);
  console.log(`# projected outcome (supplement 2 T3): ${PROJECTED.resolved_exact}+${PROJECTED.resolved_tolerance}=${PROJECTED.resolved_exact + PROJECTED.resolved_tolerance} resolved, ${PROJECTED.queued} queued`);

  const byKind: Record<string, number> = { resolved_exact: 0, resolved_tolerance: 0, queued: 0 };
  const queuedByReason: Record<string, number> = {};
  const perEvent: Array<{ id: string; kind: string; reason: string | null; detail: string }> = [];

  for (const { event: ev } of events) {
    const ctx = await loadSeedResolutionContext(pool, { provider: 'odds_api', raw_commence_time_utc: ev.commence_time });
    const input: EventReconciliationInput = {
      provider: 'odds_api',
      provider_game_id: ev.id,
      raw_home_team: ev.home_team,
      raw_away_team: ev.away_team,
      raw_commence_time: ev.commence_time,
    };
    const outcome: SeedEventResolutionOutcome = resolveOddsapiEventForSeed(input, ctx);
    byKind[outcome.kind] = (byKind[outcome.kind] ?? 0) + 1;
    if (outcome.kind === 'queued') {
      queuedByReason[outcome.reason] = (queuedByReason[outcome.reason] ?? 0) + 1;
      perEvent.push({ id: ev.id, kind: outcome.kind, reason: outcome.reason, detail: outcome.reason_detail });
    }
  }

  console.log('# ACTUAL outcome via wired path:');
  console.log(JSON.stringify({ byKind, queuedByReason }, null, 2));

  const actualResolved = (byKind['resolved_exact'] ?? 0) + (byKind['resolved_tolerance'] ?? 0);
  const projectedResolved = PROJECTED.resolved_exact + PROJECTED.resolved_tolerance;
  const divergence: string[] = [];
  if ((byKind['resolved_exact'] ?? 0) !== PROJECTED.resolved_exact) {
    divergence.push(`resolved_exact: actual=${byKind['resolved_exact']} projected=${PROJECTED.resolved_exact}`);
  }
  if ((byKind['resolved_tolerance'] ?? 0) !== PROJECTED.resolved_tolerance) {
    divergence.push(`resolved_tolerance: actual=${byKind['resolved_tolerance']} projected=${PROJECTED.resolved_tolerance}`);
  }
  if ((byKind['queued'] ?? 0) !== PROJECTED.queued) {
    divergence.push(`queued: actual=${byKind['queued']} projected=${PROJECTED.queued}`);
  }

  if (divergence.length === 0) {
    console.log(`\n# CONFIRMED: live-wired resolution matches supplement 2 projection exactly ` +
      `(${actualResolved} resolved, ${byKind['queued']} queued).`);
    console.log('# safe to proceed to Phase B B1-B4.');
    process.exitCode = 0;
    return;
  }

  console.log(`\n# DIVERGENCE from projection (halting per governor instruction):`);
  for (const d of divergence) console.log(`#   - ${d}`);
  console.log(`# actual resolved=${actualResolved} vs projected=${projectedResolved}`);
  console.log(`# queued event details:`);
  for (const q of perEvent) console.log(`#   evt=${q.id} reason=${q.reason} detail=${q.detail}`);
  process.exitCode = 2; // material divergence
}

main().catch((e) => { console.error('# confirm failed:', e); process.exitCode = 1; }).finally(() => pool.end());
