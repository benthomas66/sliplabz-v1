// BDL cursor pagination.
//
// Authority:
//   BDL sub-spec §5 (cursor-based pagination, per_page=100, follow exact
//     meta.next_cursor, never derive)
//   BDL sub-spec §19.1 (complete run: every page succeeds, exact cursor
//     chain followed, final response has no next_cursor, row-level
//     validation completes)
//   Complete spec §9.2 (partial traversal cannot advance watermark)
//   Ticket V1-2 hard invariant: partial imports never advance completeness.
//
// This module is TEST-ONLY driven — the HTTP client is injected. No live
// provider call happens in this module or its tests.
//
// The traversal is exhaustive by design: it walks until the provider
// returns `next_cursor: null | undefined | absent`. A partial page (fetcher
// error, HTTP non-2xx, parse failure) closes the run with a non-complete
// completion state and returns whatever pages did succeed for diagnosis.

import type {
  BdlPaginatedResponse,
  RawResponsePage,
} from './types.js';
import type { BdlRunState } from '../shared/enums.js';

export interface CursorTraversalPageResult<T> {
  /** The exact page envelope observed. */
  readonly response: BdlPaginatedResponse<T>;
  /** The raw response representation as it would be recorded. */
  readonly raw: RawResponsePage;
}

/**
 * Function contract for a page fetcher. Implementations MUST NOT derive the
 * cursor — they simply forward the token they were given. On success, the
 * fetcher returns a page result. On failure, it returns `{ error }` with
 * a run-state classification per BDL §15A / §15.
 *
 * Fetchers are pure with respect to their input: given the same cursor
 * they return the same page (that is what makes the cursor chain
 * reproducible in tests).
 */
export type PageFetcher<T> = (
  cursor: string | null,
  page_index: number
) => Promise<
  | { readonly ok: true; readonly page: CursorTraversalPageResult<T> }
  | { readonly ok: false; readonly error: PageFetchError }
>;

export interface PageFetchError {
  readonly kind: BdlRunState; // one of the failed_* states or partial_pagination
  readonly detail: string;
  readonly http_status: number | null;
  readonly content_type: string | null;
  readonly response_headers: Readonly<Record<string, string | number>>;
  /**
   * The raw response body (text) observed on the failed attempt, when the
   * fetcher was able to read one. Retained for diagnosis; never committed
   * to the watermark path.
   */
  readonly raw_body_text: string | null;
}

export interface CursorTraversalResult<T> {
  readonly pages: ReadonlyArray<CursorTraversalPageResult<T>>;
  readonly row_count: number;
  readonly cursor_chain_sent: ReadonlyArray<string | null>;
  readonly cursor_chain_returned: ReadonlyArray<string | null>;
  readonly completion_state: BdlRunState;
  readonly failure_detail: string | null;
  readonly http_status_last: number | null;
  readonly content_type_last: string | null;
  readonly response_headers_last: Readonly<Record<string, string | number>>;
}

/**
 * Walk the provider's cursor chain to exhaustion.
 *
 * The traversal:
 *   1. Starts with `cursor = null` (first page).
 *   2. Sends `cursor` verbatim to the fetcher.
 *   3. Records the returned page in `pages`.
 *   4. Reads `meta.next_cursor` VERBATIM.
 *      - If it is absent, null, empty string, or explicitly `undefined`,
 *        the traversal is complete.
 *      - Otherwise, the traversal continues with the returned cursor as
 *        the next `cursor`.
 *   5. If the fetcher returns an error, the traversal STOPS and the run
 *      closes with the fetcher's `kind` (never `complete`).
 *
 * Invariants tested:
 *   * cursor_chain_sent[i] equals the fetcher's `cursor` arg at page i.
 *   * cursor_chain_returned[i] equals meta.next_cursor exactly (or null).
 *   * The traversal never invents, transforms, or increments a cursor.
 *   * `completion_state === 'complete'` iff every page succeeded AND
 *      the final page returned no next_cursor.
 */
export async function traverseCursor<T>(
  fetcher: PageFetcher<T>,
  opts?: { readonly max_pages?: number }
): Promise<CursorTraversalResult<T>> {
  const pages: Array<CursorTraversalPageResult<T>> = [];
  const cursor_chain_sent: Array<string | null> = [];
  const cursor_chain_returned: Array<string | null> = [];
  let http_status_last: number | null = null;
  let content_type_last: string | null = null;
  let response_headers_last: Record<string, string | number> = {};

  const max_pages = opts?.max_pages ?? 1000;

  let cursor: string | null = null;
  let page_index = 0;

  // Bounded loop; never derive the cursor value.
  while (page_index < max_pages) {
    cursor_chain_sent.push(cursor);
    const attempt = await fetcher(cursor, page_index);
    if (!attempt.ok) {
      return {
        pages: Object.freeze(pages.slice()) as ReadonlyArray<
          CursorTraversalPageResult<T>
        >,
        row_count: pages.reduce((n, p) => n + p.response.data.length, 0),
        cursor_chain_sent: Object.freeze(cursor_chain_sent.slice()) as ReadonlyArray<string | null>,
        cursor_chain_returned: Object.freeze(cursor_chain_returned.slice()) as ReadonlyArray<string | null>,
        completion_state: attempt.error.kind,
        failure_detail: attempt.error.detail,
        http_status_last: attempt.error.http_status,
        content_type_last: attempt.error.content_type,
        response_headers_last: Object.freeze({
          ...attempt.error.response_headers,
        }) as Readonly<Record<string, string | number>>,
      };
    }
    pages.push(attempt.page);
    http_status_last = attempt.page.raw.http_status;
    content_type_last = attempt.page.raw.content_type;
    response_headers_last = { ...attempt.page.raw.response_headers };

    // Read next_cursor VERBATIM. Never coerce empty string to a non-null.
    const raw_next = attempt.page.response.meta?.next_cursor;
    const next_cursor =
      raw_next === undefined || raw_next === null || raw_next === ''
        ? null
        : raw_next;
    cursor_chain_returned.push(next_cursor);

    if (next_cursor === null) {
      // Provider signalled exhaustion. Traversal succeeded end-to-end.
      return {
        pages: Object.freeze(pages.slice()) as ReadonlyArray<
          CursorTraversalPageResult<T>
        >,
        row_count: pages.reduce((n, p) => n + p.response.data.length, 0),
        cursor_chain_sent: Object.freeze(cursor_chain_sent.slice()) as ReadonlyArray<string | null>,
        cursor_chain_returned: Object.freeze(cursor_chain_returned.slice()) as ReadonlyArray<string | null>,
        completion_state: 'complete',
        failure_detail: null,
        http_status_last,
        content_type_last,
        response_headers_last: Object.freeze(response_headers_last) as Readonly<
          Record<string, string | number>
        >,
      };
    }

    cursor = next_cursor;
    page_index += 1;
  }

  // Bounded exit: the provider still had more pages after max_pages. Return
  // partial_pagination so the watermark cannot advance.
  return {
    pages: Object.freeze(pages.slice()) as ReadonlyArray<
      CursorTraversalPageResult<T>
    >,
    row_count: pages.reduce((n, p) => n + p.response.data.length, 0),
    cursor_chain_sent: Object.freeze(cursor_chain_sent.slice()) as ReadonlyArray<string | null>,
    cursor_chain_returned: Object.freeze(cursor_chain_returned.slice()) as ReadonlyArray<string | null>,
    completion_state: 'partial_pagination',
    failure_detail: `traversal exceeded max_pages=${max_pages} without exhausting cursor`,
    http_status_last,
    content_type_last,
    response_headers_last: Object.freeze(response_headers_last) as Readonly<
      Record<string, string | number>
    >,
  };
}
