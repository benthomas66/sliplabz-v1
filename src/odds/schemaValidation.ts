// Event-odds response schema validation & schema-drift detection.
//
// Authority:
//   Odds sub-spec §10.7 (response hierarchy)
//   Odds sub-spec §20 (schema drift: HTTP 200 with an invalid body →
//     preserve raw body; quarantine; NO blind retry)
//   Complete spec §15.6 (unknown schema)
//   Ticket V1-3 hard invariant: schema drift (HTTP 200 with invalid body)
//     quarantines with the raw payload preserved.

export interface SchemaValidationResult {
  readonly kind: 'valid' | 'valid_empty' | 'schema_drift';
  readonly detail: string;
}

/**
 * Validate an event-odds response body. Returns:
 *   * 'valid'         — body is an object with a bookmakers array that
 *                       matches the audited shape.
 *   * 'valid_empty'   — body is an object with an empty bookmakers array
 *                       (§10.14 successful-empty).
 *   * 'schema_drift'  — body is present but violates the audited shape;
 *                       raw body is preserved by the caller.
 */
export function validateEventOddsResponseShape(
  body: unknown
): SchemaValidationResult {
  if (body === null || body === undefined) {
    return { kind: 'schema_drift', detail: 'body is null or undefined' };
  }
  if (typeof body !== 'object') {
    return { kind: 'schema_drift', detail: `body is not an object: ${typeof body}` };
  }
  const b = body as Record<string, unknown>;
  const bookmakers = b['bookmakers'];
  if (bookmakers === undefined) {
    return { kind: 'schema_drift', detail: 'body missing `bookmakers` array' };
  }
  if (!Array.isArray(bookmakers)) {
    return {
      kind: 'schema_drift',
      detail: `body.bookmakers is not an array (got ${typeof bookmakers})`,
    };
  }
  if (bookmakers.length === 0) {
    return { kind: 'valid_empty', detail: 'no bookmakers returned' };
  }
  // Each bookmaker must be an object with a `key` and `markets` array.
  for (let i = 0; i < bookmakers.length; i += 1) {
    const bm = bookmakers[i];
    if (bm === null || typeof bm !== 'object') {
      return {
        kind: 'schema_drift',
        detail: `body.bookmakers[${i}] is not an object`,
      };
    }
    const bmr = bm as Record<string, unknown>;
    if (typeof bmr['key'] !== 'string' || (bmr['key'] as string) === '') {
      return {
        kind: 'schema_drift',
        detail: `body.bookmakers[${i}].key missing or not a string`,
      };
    }
    const markets = bmr['markets'];
    if (!Array.isArray(markets)) {
      return {
        kind: 'schema_drift',
        detail: `body.bookmakers[${i}].markets is not an array`,
      };
    }
    for (let j = 0; j < markets.length; j += 1) {
      const m = markets[j];
      if (m === null || typeof m !== 'object') {
        return {
          kind: 'schema_drift',
          detail: `body.bookmakers[${i}].markets[${j}] is not an object`,
        };
      }
      const mr = m as Record<string, unknown>;
      if (typeof mr['key'] !== 'string' || (mr['key'] as string) === '') {
        return {
          kind: 'schema_drift',
          detail: `body.bookmakers[${i}].markets[${j}].key missing`,
        };
      }
      // outcomes may be an empty array (source sparsity), but must be an
      // array when present.
      if (mr['outcomes'] !== undefined && !Array.isArray(mr['outcomes'])) {
        return {
          kind: 'schema_drift',
          detail: `body.bookmakers[${i}].markets[${j}].outcomes is not an array`,
        };
      }
    }
  }
  return { kind: 'valid', detail: 'shape matches audited event-odds contract' };
}
