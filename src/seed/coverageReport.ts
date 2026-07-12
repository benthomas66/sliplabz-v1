// Coverage report generator.
//
// Authority:
//   Complete spec §3.6 (show the resulting coverage honestly; missing
//     slices remain missing and are labeled)
//   Ticket §8b required behavior: produce a coverage report by date,
//     market, source, player, and exclusion reason.
//
// The report is a plain data structure the pipeline (or the operator probe
// script) serializes into markdown. This module produces the structure and
// the markdown formatter.

import type {
  CoverageReportRow,
  QuotaLedgerEntry,
  SeedRunClosed,
} from './types.js';

export interface CoverageReportInput {
  readonly run: SeedRunClosed;
  readonly rows: ReadonlyArray<CoverageReportRow>;
  readonly quota_ledger: ReadonlyArray<QuotaLedgerEntry>;
}

/**
 * Aggregate coverage counts per (slate_date, market_key, bookmaker_key).
 */
export interface CoverageAggregate {
  readonly key: string; // slate_date|market_key|bookmaker_key
  readonly slate_date: string;
  readonly market_key: string;
  readonly bookmaker_key: string;
  readonly admitted: number;
  readonly no_snapshot: number;
  readonly close_capture_stale: number;
  readonly unlaunched_market_key: number;
  readonly unallowlisted_bookmaker_key: number;
  readonly dfs_pickem_excluded: number;
  readonly unresolved_event_mapping: number;
  readonly unresolved_player_mapping: number;
}

export function aggregateCoverage(
  rows: ReadonlyArray<CoverageReportRow>
): ReadonlyArray<CoverageAggregate> {
  const by_key = new Map<string, CoverageAggregate>();
  for (const r of rows) {
    const key = `${r.slate_date}|${r.market_key}|${r.bookmaker_key}`;
    const prior = by_key.get(key) ?? {
      key,
      slate_date: r.slate_date,
      market_key: r.market_key,
      bookmaker_key: r.bookmaker_key,
      admitted: 0,
      no_snapshot: 0,
      close_capture_stale: 0,
      unlaunched_market_key: 0,
      unallowlisted_bookmaker_key: 0,
      dfs_pickem_excluded: 0,
      unresolved_event_mapping: 0,
      unresolved_player_mapping: 0,
    };
    const next: CoverageAggregate = { ...prior };
    switch (r.outcome) {
      case 'admitted':
        (next as any).admitted += 1;
        break;
      case 'no_snapshot':
        (next as any).no_snapshot += 1;
        break;
      case 'close_capture_stale':
        (next as any).close_capture_stale += 1;
        break;
      case 'unlaunched_market_key':
        (next as any).unlaunched_market_key += 1;
        break;
      case 'unallowlisted_bookmaker_key':
        (next as any).unallowlisted_bookmaker_key += 1;
        break;
      case 'dfs_pickem_excluded_from_sportsbook_consensus':
        (next as any).dfs_pickem_excluded += 1;
        break;
      case 'unresolved_event_mapping':
        (next as any).unresolved_event_mapping += 1;
        break;
      case 'unresolved_player_mapping':
        (next as any).unresolved_player_mapping += 1;
        break;
    }
    by_key.set(key, Object.freeze(next));
  }
  const list = Array.from(by_key.values()).sort((a, b) => a.key.localeCompare(b.key));
  return Object.freeze(list);
}

/**
 * Emit the coverage-report markdown for the given input.
 */
export function formatCoverageReportMarkdown(input: CoverageReportInput): string {
  const agg = aggregateCoverage(input.rows);
  const lines: string[] = [];
  lines.push(`# V1-4b Stage 1 Coverage Probe Report`);
  lines.push('');
  lines.push(`**Run kind:** ${input.run.scope.run_kind}`);
  lines.push(`**Label:** ${input.run.scope.label}`);
  lines.push(`**Started at:** ${input.run.started_at}`);
  lines.push(`**Completed at:** ${input.run.completed_at}`);
  lines.push(`**Completion state:** \`${input.run.completion_state}\``);
  if (input.run.failure_detail !== null) {
    lines.push(`**Failure detail:** ${input.run.failure_detail}`);
  }
  lines.push('');
  lines.push(`**Credit budget:** ${input.run.scope.credit_budget}`);
  lines.push(`**Credits observed total:** ${input.run.credits_observed_total}`);
  lines.push(
    `**Events probed / admitted / stale / no_snapshot:** ${input.run.events_probed} / ${input.run.events_admitted} / ${input.run.events_stale_rejected} / ${input.run.events_no_snapshot}`
  );
  lines.push('');
  lines.push(`**Requested markets:** ${input.run.scope.requested_market_keys.join(', ')}`);
  lines.push(`**Requested bookmakers:** ${input.run.scope.requested_bookmaker_keys.join(', ')}`);
  lines.push(`**Attempted slate dates:** ${input.run.scope.attempted_slate_dates.join(', ')}`);
  lines.push('');
  lines.push(`## Per-request quota ledger`);
  lines.push('');
  lines.push(
    `| # | at | endpoint | forecast | observed (x-requests-last) | remaining (header) | running total | budget remaining |`
  );
  lines.push(`|---|---|---|---:|---:|---:|---:|---:|`);
  input.quota_ledger.forEach((q, i) => {
    lines.push(
      `| ${i + 1} | ${q.at} | ${q.endpoint} | ${q.forecast} | ${q.observed_x_requests_last ?? '—'} | ${q.x_requests_remaining ?? '—'} | ${q.running_total} | ${q.budget_remaining} |`
    );
  });
  lines.push('');
  lines.push(`## Per-slice coverage (slate_date × market × bookmaker)`);
  lines.push('');
  lines.push(
    `| slate | market | book | admitted | no_snapshot | stale | unlaunched | unallow | dfs_excl | unresolved_evt | unresolved_plr |`
  );
  lines.push(`|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|`);
  for (const a of agg) {
    lines.push(
      `| ${a.slate_date} | ${a.market_key} | ${a.bookmaker_key} | ${a.admitted} | ${a.no_snapshot} | ${a.close_capture_stale} | ${a.unlaunched_market_key} | ${a.unallowlisted_bookmaker_key} | ${a.dfs_pickem_excluded} | ${a.unresolved_event_mapping} | ${a.unresolved_player_mapping} |`
    );
  }
  lines.push('');
  lines.push(`## Every exclusion (raw rows)`);
  lines.push('');
  const exclusions = input.rows.filter((r) => r.outcome !== 'admitted');
  if (exclusions.length === 0) {
    lines.push(`_No exclusions recorded._`);
  } else {
    lines.push(`| slate | market | book | player | outcome | reason |`);
    lines.push(`|---|---|---|---|---|---|`);
    for (const r of exclusions) {
      lines.push(
        `| ${r.slate_date} | ${r.market_key} | ${r.bookmaker_key} | ${r.player_display ?? '—'} | \`${r.outcome}\` | ${r.reason_detail} |`
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}
