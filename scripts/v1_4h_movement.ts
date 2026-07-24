// V1-4h Measurement M — movement analysis.
//
// Reads /tmp/v14h/master_artifact.json (produced by v1_4h_master.ts) and
// computes the point / price / timestamp movement curve for each pair of
// polls, plus per-bookmaker breakdowns.
//
// Report both CUMULATIVE (vs poll 1) and CONSECUTIVE (poll N-1 → N).
// Owner ruling 3: track point and price movement independently.

import { readFileSync, writeFileSync } from 'node:fs';

interface OfferingRow {
  poll_label: string;
  provider_event_id: string;
  bookmaker_key: string;
  market_key: string;
  normalized_player_name: string;
  side: string;
  point: number;
  raw_price_american: number | null;
  provider_last_update: string | null;
  observed_at: string;
}
interface PollRecord {
  label: string;
  target_offset_sec: number;
  start_at: string;
  persist_end_at: string;
}
interface Artifact {
  polls: PollRecord[];
  offerings: OfferingRow[];
}

function keyOf(o: Pick<OfferingRow, 'provider_event_id' | 'bookmaker_key' | 'market_key' | 'normalized_player_name' | 'side'>): string {
  return `${o.provider_event_id}|${o.bookmaker_key}|${o.market_key}|${o.normalized_player_name}|${o.side}`;
}
function tsKeyOf(o: Pick<OfferingRow, 'provider_event_id' | 'bookmaker_key' | 'market_key'>): string {
  return `${o.provider_event_id}|${o.bookmaker_key}|${o.market_key}`;
}

interface PairwiseCounts {
  pair: string;
  minutes_elapsed: number;
  n_compared_point: number;
  n_changed_point: number;
  frac_point: number;
  n_compared_price: number;
  n_changed_price: number;
  frac_price: number;
  n_compared_ts: number;
  n_changed_ts: number;
  frac_ts: number;
}

function compare(a: OfferingRow[], b: OfferingRow[], label_a: string, label_b: string, minutes_elapsed: number): PairwiseCounts {
  // Build indexes for each side.
  const a_line = new Map<string, OfferingRow>();
  const b_line = new Map<string, OfferingRow>();
  for (const o of a) a_line.set(keyOf(o), o);
  for (const o of b) b_line.set(keyOf(o), o);
  const a_ts = new Map<string, OfferingRow>();
  const b_ts = new Map<string, OfferingRow>();
  for (const o of a) if (!a_ts.has(tsKeyOf(o))) a_ts.set(tsKeyOf(o), o);
  for (const o of b) if (!b_ts.has(tsKeyOf(o))) b_ts.set(tsKeyOf(o), o);

  let n_p = 0, cp = 0, n_pr = 0, cpr = 0;
  for (const [k, oa] of a_line.entries()) {
    const ob = b_line.get(k);
    if (ob === undefined) continue;
    n_p += 1;
    if (oa.point !== ob.point) cp += 1;
    n_pr += 1;
    if (oa.raw_price_american !== ob.raw_price_american) cpr += 1;
  }
  let n_t = 0, ct = 0;
  for (const [k, oa] of a_ts.entries()) {
    const ob = b_ts.get(k);
    if (ob === undefined) continue;
    n_t += 1;
    if (oa.provider_last_update !== ob.provider_last_update) ct += 1;
  }
  return {
    pair: `${label_a}→${label_b}`, minutes_elapsed,
    n_compared_point: n_p, n_changed_point: cp, frac_point: n_p ? cp / n_p : 0,
    n_compared_price: n_pr, n_changed_price: cpr, frac_price: n_pr ? cpr / n_pr : 0,
    n_compared_ts: n_t, n_changed_ts: ct, frac_ts: n_t ? ct / n_t : 0,
  };
}

function perBook(a: OfferingRow[], b: OfferingRow[]): Array<{
  bookmaker_key: string;
  n_point: number; ch_point: number; frac_point: number;
  n_price: number; ch_price: number; frac_price: number;
  n_ts: number; ch_ts: number; frac_ts: number;
}> {
  const a_line = new Map<string, OfferingRow>();
  const b_line = new Map<string, OfferingRow>();
  for (const o of a) a_line.set(keyOf(o), o);
  for (const o of b) b_line.set(keyOf(o), o);
  const a_ts = new Map<string, OfferingRow>();
  const b_ts = new Map<string, OfferingRow>();
  for (const o of a) if (!a_ts.has(tsKeyOf(o))) a_ts.set(tsKeyOf(o), o);
  for (const o of b) if (!b_ts.has(tsKeyOf(o))) b_ts.set(tsKeyOf(o), o);
  const per: Record<string, { n_point: number; ch_point: number; n_price: number; ch_price: number; n_ts: number; ch_ts: number }> = {};
  const ensure = (k: string) => (per[k] ??= { n_point: 0, ch_point: 0, n_price: 0, ch_price: 0, n_ts: 0, ch_ts: 0 });
  for (const [k, oa] of a_line.entries()) {
    const ob = b_line.get(k);
    if (ob === undefined) continue;
    const p = ensure(oa.bookmaker_key);
    p.n_point += 1; if (oa.point !== ob.point) p.ch_point += 1;
    p.n_price += 1; if (oa.raw_price_american !== ob.raw_price_american) p.ch_price += 1;
  }
  for (const [k, oa] of a_ts.entries()) {
    const ob = b_ts.get(k);
    if (ob === undefined) continue;
    const p = ensure(oa.bookmaker_key);
    p.n_ts += 1; if (oa.provider_last_update !== ob.provider_last_update) p.ch_ts += 1;
  }
  return Object.entries(per).map(([book, v]) => ({
    bookmaker_key: book,
    n_point: v.n_point, ch_point: v.ch_point, frac_point: v.n_point ? v.ch_point / v.n_point : 0,
    n_price: v.n_price, ch_price: v.ch_price, frac_price: v.n_price ? v.ch_price / v.n_price : 0,
    n_ts: v.n_ts, ch_ts: v.ch_ts, frac_ts: v.n_ts ? v.ch_ts / v.n_ts : 0,
  })).sort((x, y) => x.bookmaker_key.localeCompare(y.bookmaker_key));
}

function main(): void {
  const artifact_path = process.argv[2] ?? '/tmp/v14h/master_artifact.json';
  const out_path = process.argv[3] ?? '/tmp/v14h/movement_analysis.json';
  const art: Artifact = JSON.parse(readFileSync(artifact_path, 'utf-8'));
  const poll_offerings = new Map<string, OfferingRow[]>();
  for (const p of art.polls) poll_offerings.set(p.label, []);
  for (const o of art.offerings) poll_offerings.get(o.poll_label)?.push(o);

  const T = new Map<string, number>();
  for (const p of art.polls) T.set(p.label, Date.parse(p.start_at));

  const labels = art.polls.map((p) => p.label);
  const p1 = labels[0]!;
  const p1_off = poll_offerings.get(p1) ?? [];

  // Cumulative vs poll 1
  const cumulative: Array<PairwiseCounts & { per_bookmaker: ReturnType<typeof perBook> }> = [];
  for (let i = 1; i < labels.length; i += 1) {
    const li = labels[i]!;
    const off_i = poll_offerings.get(li) ?? [];
    const minutes = Math.round((T.get(li)! - T.get(p1)!) / 60000);
    const counts = compare(p1_off, off_i, p1, li, minutes);
    const book = perBook(p1_off, off_i);
    cumulative.push({ ...counts, per_bookmaker: book });
  }

  // Consecutive
  const consecutive: Array<PairwiseCounts & { per_bookmaker: ReturnType<typeof perBook> }> = [];
  for (let i = 1; i < labels.length; i += 1) {
    const la = labels[i - 1]!;
    const lb = labels[i]!;
    const a_off = poll_offerings.get(la) ?? [];
    const b_off = poll_offerings.get(lb) ?? [];
    const minutes = Math.round((T.get(lb)! - T.get(la)!) / 60000);
    const counts = compare(a_off, b_off, la, lb, minutes);
    const book = perBook(a_off, b_off);
    consecutive.push({ ...counts, per_bookmaker: book });
  }

  // Per-poll offering counts.
  const per_poll_offerings: Array<{ label: string; offerings: number; distinct_lines: number; distinct_ts_grains: number }> = [];
  for (const l of labels) {
    const off = poll_offerings.get(l) ?? [];
    const line_keys = new Set<string>();
    const ts_keys = new Set<string>();
    for (const o of off) { line_keys.add(keyOf(o)); ts_keys.add(tsKeyOf(o)); }
    per_poll_offerings.push({ label: l, offerings: off.length, distinct_lines: line_keys.size, distinct_ts_grains: ts_keys.size });
  }

  // Candidate threshold arithmetic — measurement C.
  // P(line still current | age <= t) = 1 - P(point changed by t).
  // Use cumulative POINT rows keyed by minutes elapsed.
  const p_current_at: Array<{ threshold_min: number; frac_changed_by: number; p_still_current: number; n: number }> = [];
  for (const c of cumulative) {
    p_current_at.push({
      threshold_min: c.minutes_elapsed,
      frac_changed_by: c.frac_point,
      p_still_current: 1 - c.frac_point,
      n: c.n_compared_point,
    });
  }

  const summary = {
    ticket: 'V1-4h', step: 'M', poll_labels: labels,
    per_poll_offerings, cumulative, consecutive, candidate_threshold_arithmetic: p_current_at,
  };
  writeFileSync(out_path, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({
    poll_labels: labels,
    per_poll_offerings,
    cumulative_summary: cumulative.map((c) => ({
      pair: c.pair, minutes: c.minutes_elapsed,
      point: `${c.n_changed_point}/${c.n_compared_point} = ${(c.frac_point*100).toFixed(2)}%`,
      price: `${c.n_changed_price}/${c.n_compared_price} = ${(c.frac_price*100).toFixed(2)}%`,
      ts: `${c.n_changed_ts}/${c.n_compared_ts} = ${(c.frac_ts*100).toFixed(2)}%`,
    })),
    consecutive_summary: consecutive.map((c) => ({
      pair: c.pair, minutes: c.minutes_elapsed,
      point: `${c.n_changed_point}/${c.n_compared_point} = ${(c.frac_point*100).toFixed(2)}%`,
      price: `${c.n_changed_price}/${c.n_compared_price} = ${(c.frac_price*100).toFixed(2)}%`,
      ts: `${c.n_changed_ts}/${c.n_compared_ts} = ${(c.frac_ts*100).toFixed(2)}%`,
    })),
  }, null, 2));
  console.log(`# artifact: ${out_path}`);
}

main();
