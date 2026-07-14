// V1-5 availability context per BDL §13, §20 and complete spec §11.3.
//
// Absence from an availability feed is NEVER labeled "healthy". This
// module surfaces the reviewed presence state as-is; a null return
// means the availability feed has no observation of this player, which
// is a distinct product state from "healthy".

import { methodVersionOf } from './computationVersion.js';
import type { AvailabilityContextResult } from './types.js';

export interface AvailabilityContextInput {
  readonly presence_state:
    | 'currently_reported'
    | 'not_returned_latest_complete_snapshot'
    | 'stale_feed'
    | 'unresolved_player'
    | 'source_unavailable';
  readonly source_status: string;
  readonly source_comment: string;
  readonly source_return_date_text: string;
  readonly observed_at: string | null;
}

export function computeAvailabilityContext(
  input: AvailabilityContextInput | null
): AvailabilityContextResult | null {
  if (input === null) return null;
  return Object.freeze({
    presence_state: input.presence_state,
    source_status: input.source_status,
    source_comment: input.source_comment,
    source_return_date_text: input.source_return_date_text,
    observed_at: input.observed_at,
    method_version: methodVersionOf('availability_context'),
  });
}
