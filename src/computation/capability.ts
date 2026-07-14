// V1-5 capability fixtures.
//
// Per ticket queue §1.5 and GD-6: pre-V1-9 tickets use CLEARLY LABELED
// PROVISIONAL FIXTURE VALUES for free / paid capabilities. There is no
// Stripe, no account state, no Supabase Auth. Production entitlement is
// activated in V1-9.
//
// Each capability is boolean-explicit. The serializer strips paid fields
// from the payload before it leaves the server for a caller lacking the
// paid capability (§16.7 explicit: "Protected data is never sent to an
// unauthorized client and merely hidden in the interface.").

export type CapabilityKind =
  /** Detailed per-book offerings; free tier sees consensus only. */
  | 'view_book_detail'
  /** Detailed movement summary. Aggregates (count of changes, net) exposed
   *  even to free; the raw event stream is paid. */
  | 'view_full_movement_detail'
  /** L10 / L20 detail. Free tier gets L5 and season summary only per
   *  §16.3. Exact preview-row counts are V1-9 config. */
  | 'view_extended_windows'
  /** Threshold-window calculations against a user-supplied threshold
   *  (Compare Your Line). Free tier gets N/day; paid gets full. Exact
   *  N is V1-9 config; here we only expose the boolean gate. */
  | 'view_threshold_windows'
  /** Availability context is a paid field per §16.4. */
  | 'view_availability_context';

/** A capability record for a caller. Fixture-driven; no account state. */
export interface Capability {
  /** Provisional label so no reviewer confuses this with a production
   *  entitlement decision. Load-bearing: any serialization pipeline that
   *  writes a payload for a request whose capability lacks the label
   *  `provisional_fixture_v1_5` must halt. See V1-9 for production. */
  readonly source_label: 'provisional_fixture_v1_5';
  readonly grants: Readonly<Record<CapabilityKind, boolean>>;
}

const zeroGrants: Readonly<Record<CapabilityKind, boolean>> = Object.freeze({
  view_book_detail: false,
  view_full_movement_detail: false,
  view_extended_windows: false,
  view_threshold_windows: false,
  view_availability_context: false,
});

/** Anonymous / unauthorized caller. */
export const CAPABILITY_ANONYMOUS: Capability = Object.freeze({
  source_label: 'provisional_fixture_v1_5' as const,
  grants: zeroGrants,
});

/** Free tier. Provisional. Exact preview limits are V1-9 config. */
export const CAPABILITY_FREE: Capability = Object.freeze({
  source_label: 'provisional_fixture_v1_5' as const,
  grants: Object.freeze({
    view_book_detail: false,
    view_full_movement_detail: false,
    view_extended_windows: false,
    view_threshold_windows: false,
    view_availability_context: false,
  }),
});

/** Paid tier. Provisional. */
export const CAPABILITY_PAID: Capability = Object.freeze({
  source_label: 'provisional_fixture_v1_5' as const,
  grants: Object.freeze({
    view_book_detail: true,
    view_full_movement_detail: true,
    view_extended_windows: true,
    view_threshold_windows: true,
    view_availability_context: true,
  }),
});

/** Internal / admin. All grants. */
export const CAPABILITY_INTERNAL_ADMIN: Capability = Object.freeze({
  source_label: 'provisional_fixture_v1_5' as const,
  grants: Object.freeze({
    view_book_detail: true,
    view_full_movement_detail: true,
    view_extended_windows: true,
    view_threshold_windows: true,
    view_availability_context: true,
  }),
});

export function hasCapability(cap: Capability, kind: CapabilityKind): boolean {
  if (cap.source_label !== 'provisional_fixture_v1_5') {
    throw new Error(
      `V1-5 capability check refused: source_label=${cap.source_label} is not the provisional fixture label. ` +
      `Production entitlement is a V1-9 obligation.`
    );
  }
  return cap.grants[kind];
}
