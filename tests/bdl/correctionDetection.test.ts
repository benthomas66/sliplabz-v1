// Ticket §6 required tests covered here:
//   - duplicate player-game source key (idempotent upsert produces no material change)
//   - final-stat correction (change_kind='material_correction', invalidations fire)
//
// Ticket hard invariants:
//   - Historical player-game rows are stable and correction-safe
//   - Source corrections detected, recorded, and trigger invalidation hooks
//     — never silent overwrites

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseBdlMinutes } from '../../src/bdl/minutes.js';
import {
  extractRawCountingStats,
  normalizeCountingStats,
} from '../../src/bdl/countingStats.js';
import { canonicalSourceHash } from '../../src/bdl/sourceHash.js';
import { detectCorrection } from '../../src/bdl/correctionDetection.js';
import { buildStatCorrectionInvalidations } from '../../src/bdl/recomputationInvalidation.js';
import type { NormalizedPlayerGameStat } from '../../src/bdl/types.js';

const firstCapture = JSON.parse(
  readFileSync(
    new URL('../fixtures/bdl/game-24752-first-capture.json', import.meta.url),
    'utf8'
  )
);
const secondCapture = JSON.parse(
  readFileSync(
    new URL('../fixtures/bdl/game-24752-second-capture.json', import.meta.url),
    'utf8'
  )
);
const correction = JSON.parse(
  readFileSync(
    new URL('../fixtures/bdl/final-stat-correction.json', import.meta.url),
    'utf8'
  )
);

function normalizeRow(
  row: any,
  eligibleWhenPlayed: boolean
): NormalizedPlayerGameStat {
  const minutes = parseBdlMinutes(row.min);
  const rawStats = extractRawCountingStats(row);
  const normalizedStats = normalizeCountingStats(
    rawStats,
    minutes.status,
    eligibleWhenPlayed && minutes.status === 'played'
  );
  const source_hash = canonicalSourceHash({
    provider_player_id: String(row.player.id),
    provider_game_id: String(row.game.id),
    provider_team_id: row.team?.id !== undefined ? String(row.team.id) : null,
    minutes_status: minutes.status,
    parsed_minutes: minutes.parsed_minutes,
    raw_minutes: minutes.raw_minutes,
    raw_stats: rawStats,
  });
  return Object.freeze({
    provider: 'balldontlie' as const,
    provider_player_id: String(row.player.id),
    provider_game_id: String(row.game.id),
    provider_team_id: row.team?.id !== undefined ? String(row.team.id) : null,
    raw_minutes: minutes.raw_minutes,
    parsed_minutes: minutes.parsed_minutes,
    minutes_status: minutes.status,
    raw_stats: rawStats,
    normalized_stats: normalizedStats,
    source_hash,
    eligibility_state:
      minutes.status === 'played' && eligibleWhenPlayed
        ? 'eligible'
        : minutes.status === 'played'
        ? 'live_or_non_final'
        : minutes.status === 'dnp'
        ? 'non_participation'
        : 'unresolved_minutes',
    quarantine_reason: null,
    season: row.game.season ?? null,
    season_type: row.game.season_type ?? null,
    normalization_version: 1,
  });
}

describe('duplicate source key & idempotent rerun (BDL §6.3, §12C.2)', () => {
  it('LOAD-BEARING: two byte-identical captures produce identical source_hash for every row', () => {
    const firstRows = (firstCapture.response.data as any[]).map((r) =>
      normalizeRow(r, true)
    );
    const secondRows = (secondCapture.response.data as any[]).map((r) =>
      normalizeRow(r, true)
    );
    assert.equal(firstRows.length, secondRows.length);
    for (let i = 0; i < firstRows.length; i += 1) {
      assert.equal(
        firstRows[i]!.source_hash,
        secondRows[i]!.source_hash,
        `row ${i} hash mismatch — idempotent rerun broken`
      );
    }
  });

  it('detectCorrection: identical incoming vs prior → change_kind = metadata_change; empty changed_fields', () => {
    const rows_first = (firstCapture.response.data as any[]).map((r) =>
      normalizeRow(r, true)
    );
    const rows_second = (secondCapture.response.data as any[]).map((r) =>
      normalizeRow(r, true)
    );
    for (let i = 0; i < rows_first.length; i += 1) {
      const diff = detectCorrection(rows_second[i]!, rows_first[i]!);
      assert.equal(diff.change_kind, 'metadata_change');
      assert.deepEqual(diff.changed_fields, []);
      assert.equal(diff.minutes_state_changed, false);
    }
  });

  it('idempotent upsert on the SAME row twice → no invalidations emitted', () => {
    const rows_first = (firstCapture.response.data as any[]).map((r) =>
      normalizeRow(r, true)
    );
    const prior = rows_first[0]!;
    const incoming = rows_first[0]!;
    const diff = detectCorrection(incoming, prior);
    const invalidations = buildStatCorrectionInvalidations({
      diff,
      incoming,
      internal_player_id: 'p001',
      internal_game_id: 'g001',
      player_game_stat_id: 'pgs001',
      triggering_history_id: 'hist001',
      triggering_observation_id: null,
      observed_at: '2026-07-11T15:00:00Z',
    });
    assert.equal(invalidations.length, 0);
  });
});

describe('final-stat correction (BDL §12C.5)', () => {
  it('LOAD-BEARING: correction changes pts+reb+dreb+fgm+plus_minus → change_kind=material_correction; changed_fields lists them; NOT minutes_state_changed', () => {
    const first_row = normalizeRow(
      correction.first_capture.response.data[0],
      true
    );
    const second_row = normalizeRow(
      correction.second_capture.response.data[0],
      true
    );
    const diff = detectCorrection(second_row, first_row);
    assert.equal(diff.change_kind, 'material_correction');
    assert.notEqual(diff.new_source_hash, diff.prior_source_hash);
    assert.ok(diff.changed_fields.includes('pts'));
    assert.ok(diff.changed_fields.includes('reb'));
    assert.ok(diff.changed_fields.includes('dreb'));
    assert.ok(diff.changed_fields.includes('fgm'));
    assert.equal(diff.minutes_state_changed, false);
  });

  it('LOAD-BEARING: material correction emits invalidation events for stat + player + game', () => {
    const first_row = normalizeRow(
      correction.first_capture.response.data[0],
      true
    );
    const second_row = normalizeRow(
      correction.second_capture.response.data[0],
      true
    );
    const diff = detectCorrection(second_row, first_row);
    const invalidations = buildStatCorrectionInvalidations({
      diff,
      incoming: second_row,
      internal_player_id: 'p900001',
      internal_game_id: 'g99001',
      player_game_stat_id: 'pgs900001',
      triggering_history_id: 'hist-correction-1',
      triggering_observation_id: null,
      observed_at: correction.second_capture.retrieved_at,
    });
    const kinds = invalidations.map((i) => i.entity_kind);
    const reasons = invalidations.map((i) => i.reason);
    assert.ok(kinds.includes('player_game_stat'));
    assert.ok(kinds.includes('internal_player'));
    assert.ok(kinds.includes('internal_game'));
    assert.ok(reasons.includes('material_stat_change'));
    for (const inv of invalidations) {
      // Every invalidation must reference the triggering history row.
      assert.equal(inv.triggering_history_id, 'hist-correction-1');
      assert.equal(inv.provider, 'balldontlie');
    }
  });

  it('minutes state transition (played → dnp) emits an ADDITIONAL minutes_state_change invalidation', () => {
    const played_row = normalizeRow(
      {
        min: '28',
        pts: 12, reb: 5, ast: 3, fg3m: 1,
        player: { id: 900002, team: { id: 3 } },
        game: { id: 99002, season: 2026, season_type: 2, status: 'Final' },
        team: { id: 3 },
      },
      true
    );
    const dnp_row = normalizeRow(
      {
        min: '0',
        pts: null, reb: null, ast: null, fg3m: null,
        player: { id: 900002, team: { id: 3 } },
        game: { id: 99002, season: 2026, season_type: 2, status: 'Final' },
        team: { id: 3 },
      },
      true
    );
    const diff = detectCorrection(dnp_row, played_row);
    assert.equal(diff.change_kind, 'material_correction');
    assert.equal(diff.minutes_state_changed, true);
    const invalidations = buildStatCorrectionInvalidations({
      diff,
      incoming: dnp_row,
      internal_player_id: 'p900002',
      internal_game_id: 'g99002',
      player_game_stat_id: 'pgs900002',
      triggering_history_id: 'hist-min-change',
      triggering_observation_id: null,
      observed_at: '2026-07-11T16:00:00Z',
    });
    const reasons = invalidations.map((i) => i.reason);
    assert.ok(reasons.includes('minutes_state_change'));
  });
});
