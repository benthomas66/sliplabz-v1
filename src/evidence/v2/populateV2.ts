// V1-A2-2 REVISE — v2 populator.
//
// Owner R4 timing: the populator captures ONE `evaluation_reference_time`
// at BATCH START and passes THE SAME VALUE to every grain in the batch.
// Per-grain processing latency does not shift any grain across a v2
// boundary.
//
// BEYOND-HORIZON HANDLING (owner ruling repair 5):
//   `computeEvidenceProfileV2` returns a discriminated union. This
//   populator SKIPS beyond-horizon results without calling the writer.
//   No `evidence_profiles` row is inserted for a beyond-horizon grain.
//   Counters expose the skip so the caller can audit.
//
// This populator is a THIN driver over the v2 engine + v2 writer. It
// consumes an injected `V2BuildProfileInput` builder (tests supply one).
// v1 populator (`src/evidence/driver/populate.ts`) is untouched.

import { randomUUID } from 'node:crypto';
import { withTransaction, type Tx } from '../../db/transaction.js';
import { openPool } from '../../db/connection.js';
import type { SliplabzPool } from '../../db/connection.js';
import type { EvidenceProfileInput } from '../types.js';
import type { EvidenceProfileAuditRefs } from '../writer.js';
import {
  computeEvidenceProfileV2,
  type EvidenceProfileInputV2,
} from './engineV2.js';
import { writeV2EvidenceProfile } from './writerV2.js';

export type V2BuildProfileInput = (
  grain: V2EvidenceGrain,
  tx: Tx
) => Promise<{
  readonly input: EvidenceProfileInput;
  readonly line_observed_at: string | null;
  readonly audit: EvidenceProfileAuditRefs;
} | null>;

export interface V2EvidenceGrain {
  readonly internal_game_id: string;
  readonly internal_player_id: string;
  readonly market_key: string;
  readonly current_market_row_id: string;
  readonly source_read_model_computation_version: number;
}

export interface V2PopulatorOptions {
  readonly grains: ReadonlyArray<V2EvidenceGrain>;
  readonly build_profile_input: V2BuildProfileInput;
  readonly connection_string: string;
  readonly dry_run?: boolean;
  /**
   * Explicit override for evaluation_reference_time; when omitted the
   * populator uses `new Date().toISOString()`. Tests supply an explicit
   * value to make the batch-drift assertion deterministic.
   */
  readonly evaluation_reference_time?: string;
  /** Explicit override for profile_generated_at "clock". */
  readonly profile_generated_at_clock?: () => string;
}

export interface V2PopulatorCounters {
  readonly grains_observed: number;
  readonly grains_skipped_no_input: number;
  /**
   * Beyond-horizon grains that reached the engine and were classified
   * as non-persistable. Counted, not written.
   */
  readonly grains_skipped_beyond_horizon: number;
  readonly profiles_inserted: number;
  readonly profiles_updated: number;
  readonly evaluation_reference_time: string;
  readonly run_id: string;
  readonly started_at: string;
  readonly finished_at: string;
}

/**
 * Run the v2 populator against the caller-supplied grain list.
 */
export async function runEvidencePopulatorV2(
  options: V2PopulatorOptions
): Promise<V2PopulatorCounters> {
  const evaluation_reference_time =
    options.evaluation_reference_time ?? new Date().toISOString();
  const pga_clock = options.profile_generated_at_clock
    ?? (() => new Date().toISOString());
  const run_id = randomUUID();
  const started_at = new Date().toISOString();
  const dry_run = options.dry_run ?? false;

  const cumulative = {
    grains_observed: 0,
    grains_skipped_no_input: 0,
    grains_skipped_beyond_horizon: 0,
    profiles_inserted: 0,
    profiles_updated: 0,
  };

  const pool: SliplabzPool = openPool({
    connectionString: options.connection_string,
    max: 1, statement_timeout_ms: 30_000,
    ssl: options.connection_string.includes('supabase.') ? 'require' : 'disable',
  });
  try {
    await withTransaction(pool, async (tx) => {
      for (const grain of options.grains) {
        cumulative.grains_observed += 1;
        const built = await options.build_profile_input(grain, tx);
        if (built === null) {
          cumulative.grains_skipped_no_input += 1;
          continue;
        }
        const v2_input: EvidenceProfileInputV2 = Object.freeze({
          ...built.input,
          line_observed_at: built.line_observed_at,
          evaluation_reference_time,
        });
        const result = computeEvidenceProfileV2(v2_input);
        if (result.kind === 'beyond_horizon') {
          // Owner ruling repair 5: no row inserted for beyond-horizon.
          cumulative.grains_skipped_beyond_horizon += 1;
          continue;
        }
        const timing = Object.freeze({
          evaluation_reference_time,
          profile_generated_at: pga_clock(),
        });
        const w = await writeV2EvidenceProfile(tx, v2_input, result, built.audit, timing);
        if (w.inserted) cumulative.profiles_inserted += 1;
        else cumulative.profiles_updated += 1;
      }
      if (dry_run) throw new DryRunRollbackV2();
    }).catch((err) => {
      if (err instanceof DryRunRollbackV2) return;
      throw err;
    });
  } finally { await pool.end(); }

  return Object.freeze({
    grains_observed: cumulative.grains_observed,
    grains_skipped_no_input: cumulative.grains_skipped_no_input,
    grains_skipped_beyond_horizon: cumulative.grains_skipped_beyond_horizon,
    profiles_inserted: cumulative.profiles_inserted,
    profiles_updated: cumulative.profiles_updated,
    evaluation_reference_time,
    run_id, started_at,
    finished_at: new Date().toISOString(),
  });
}

class DryRunRollbackV2 extends Error {
  constructor() { super('v2 dry-run rollback'); }
}
