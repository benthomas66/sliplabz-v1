// Ticket §6 required tests covered here:
//   - 41-page season fixture (or equivalent multipage fixture)
//   - exact cursor chain
//   - failed page
//   - partial page traversal
//
// Ticket hard invariant: partial imports never advance completeness watermarks.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  traverseCursor,
  type PageFetcher,
} from '../../src/bdl/cursorPagination.js';
import {
  advanceWatermark,
  emptyWatermark,
} from '../../src/bdl/watermark.js';
import { closeRun, openRun } from '../../src/bdl/ingestionRun.js';
import type { BdlPaginatedResponse, RawResponsePage } from '../../src/bdl/types.js';

const seasonFixture = JSON.parse(
  readFileSync(
    new URL('../fixtures/bdl/season-2026-multipage.json', import.meta.url),
    'utf8'
  )
) as {
  total_pages: number;
  total_rows: number;
  pages: Array<{
    page_index: number;
    cursor_sent: string | null;
    response: BdlPaginatedResponse<unknown>;
  }>;
};

const failedPageFixture = JSON.parse(
  readFileSync(
    new URL('../fixtures/bdl/failed-page.json', import.meta.url),
    'utf8'
  )
) as {
  total_pages_expected: number;
  pages: Array<
    | {
        page_index: number;
        cursor_sent: string | null;
        ok: true;
        response: BdlPaginatedResponse<unknown>;
      }
    | {
        page_index: number;
        cursor_sent: string | null;
        ok: false;
        error: {
          http_status: number;
          content_type: string;
          raw_body_text: string;
          kind: 'failed_transport';
          detail: string;
        };
      }
  >;
};

function buildFetcherFromFixture(): PageFetcher<unknown> {
  return async (cursor, page_index) => {
    const page = seasonFixture.pages[page_index];
    if (page === undefined) {
      return {
        ok: false as const,
        error: {
          kind: 'failed_transport',
          detail: `no fixture page at index ${page_index}`,
          http_status: 500,
          content_type: 'text/plain',
          response_headers: {},
          raw_body_text: null,
        },
      };
    }
    // Sanity check that the caller passed the EXACT cursor the fixture recorded.
    assert.equal(
      cursor,
      page.cursor_sent,
      `page ${page_index}: cursor sent must equal cursor_sent recorded in fixture`
    );
    const raw: RawResponsePage = {
      raw_response_id: `raw-${page_index}`,
      bdl_ingestion_run_id: 'run-season',
      page_index,
      cursor_used_to_fetch: cursor,
      cursor_returned_next: page.response.meta?.next_cursor ?? null,
      retrieved_at: `2026-07-11T12:00:${String(page_index).padStart(2, '0')}Z`,
      http_status: 200,
      content_type: 'application/json',
      response_headers: {},
      response_body: page.response,
      response_body_text: JSON.stringify(page.response),
      response_body_bytes: JSON.stringify(page.response).length,
      observed_row_count: page.response.data.length,
    };
    return { ok: true as const, page: { response: page.response, raw } };
  };
}

describe('cursor pagination (BDL §5, §19.1)', () => {
  it('41-page season fixture: traversal completes; row_count sums correctly', async () => {
    const result = await traverseCursor(buildFetcherFromFixture());
    assert.equal(result.completion_state, 'complete');
    assert.equal(result.pages.length, seasonFixture.total_pages);
    assert.equal(result.row_count, seasonFixture.total_rows);
  });

  it('LOAD-BEARING: exact cursor chain — sent[i]===fixture.cursor_sent[i] AND returned[i]===meta.next_cursor exactly', async () => {
    const result = await traverseCursor(buildFetcherFromFixture());
    for (let i = 0; i < seasonFixture.total_pages; i += 1) {
      const fixture_page = seasonFixture.pages[i]!;
      const nextCursor = fixture_page.response.meta?.next_cursor ?? null;
      assert.equal(
        result.cursor_chain_sent[i],
        fixture_page.cursor_sent,
        `cursor_chain_sent[${i}] must equal fixture cursor_sent`
      );
      assert.equal(
        result.cursor_chain_returned[i],
        nextCursor,
        `cursor_chain_returned[${i}] must equal fixture meta.next_cursor verbatim`
      );
    }
    // Last returned cursor MUST be null (that's what ended the traversal).
    assert.equal(
      result.cursor_chain_returned[result.cursor_chain_returned.length - 1],
      null
    );
  });

  it('complete run advances a watermark; partial run does NOT', async () => {
    const started_at = '2026-07-11T12:00:00Z';
    const completed_at = '2026-07-11T12:05:00Z';
    const traversal = await traverseCursor(buildFetcherFromFixture());
    const open = openRun({
      bdl_ingestion_run_id: 'run-season',
      endpoint: 'player_stats',
      query_scope_key: 'season=2026',
      started_at,
    });
    const closed_complete = closeRun({
      open,
      completed_at,
      page_count: traversal.pages.length,
      row_count: traversal.row_count,
      cursor_chain_sent: traversal.cursor_chain_sent,
      cursor_chain_returned: traversal.cursor_chain_returned,
      http_status_last: traversal.http_status_last,
      content_type_last: traversal.content_type_last,
      response_headers_last: traversal.response_headers_last,
      completion_state: 'complete',
      failure_detail: null,
    });
    const wm = emptyWatermark('player_stats', 'season=2026');
    const advanced = advanceWatermark(wm, closed_complete);
    assert.equal(advanced.advanced, true);
    assert.equal(advanced.next.completed_at, completed_at);
    assert.equal(advanced.next.completed_row_count, seasonFixture.total_rows);

    // Now simulate a partial run on the same scope.
    const closed_partial = closeRun({
      open,
      completed_at: '2026-07-11T13:00:00Z',
      page_count: 5,
      row_count: 25,
      cursor_chain_sent: ['s1', 's2', 's3', 's4', 's5'],
      cursor_chain_returned: ['r1', 'r2', 'r3', 'r4', 'r5'],
      http_status_last: 500,
      content_type_last: 'text/plain',
      response_headers_last: {},
      completion_state: 'partial_pagination',
      failure_detail: 'page 5 failed',
    });
    const partial = advanceWatermark(advanced.next, closed_partial);
    assert.equal(partial.advanced, false);
    assert.notEqual(partial.refusal_reason, null);
    // Watermark unchanged.
    assert.equal(partial.next.completed_at, completed_at);
  });
});

describe('failed page — traversal (§19.1)', () => {
  it('page 10 fails; traversal returns completion_state=failed_transport with pages 0..9 retained', async () => {
    const fetcher: PageFetcher<unknown> = async (cursor, page_index) => {
      const page = failedPageFixture.pages[page_index];
      assert.ok(page !== undefined, `fetcher over-ran fixture at index ${page_index}`);
      assert.equal(
        cursor,
        page.cursor_sent,
        `cursor mismatch at page ${page_index}`
      );
      if (page.ok === false) {
        return {
          ok: false as const,
          error: {
            kind: 'failed_transport',
            detail: page.error.detail,
            http_status: page.error.http_status,
            content_type: page.error.content_type,
            response_headers: {},
            raw_body_text: page.error.raw_body_text,
          },
        };
      }
      const raw: RawResponsePage = {
        raw_response_id: `raw-fp-${page_index}`,
        bdl_ingestion_run_id: 'run-failed',
        page_index,
        cursor_used_to_fetch: cursor,
        cursor_returned_next: page.response.meta?.next_cursor ?? null,
        retrieved_at: '2026-07-11T14:00:00Z',
        http_status: 200,
        content_type: 'application/json',
        response_headers: {},
        response_body: page.response,
        response_body_text: JSON.stringify(page.response),
        response_body_bytes: JSON.stringify(page.response).length,
        observed_row_count: page.response.data.length,
      };
      return { ok: true as const, page: { response: page.response, raw } };
    };
    const result = await traverseCursor(fetcher);
    assert.equal(result.completion_state, 'failed_transport');
    // Prior pages retained (10 succeeded before page 10 failed).
    assert.equal(result.pages.length, 10);
    // Cursor chain records the cursor SENT on the failed attempt too.
    assert.equal(result.cursor_chain_sent.length, 11);
    // Row count is the sum of prior successful pages only.
    assert.equal(result.row_count, 10);
    assert.ok(result.failure_detail !== null);
  });

  it('LOAD-BEARING: failed traversal does NOT advance a watermark', () => {
    const open = openRun({
      bdl_ingestion_run_id: 'run-failed',
      endpoint: 'player_stats',
      query_scope_key: 'season=2026',
      started_at: '2026-07-11T14:00:00Z',
    });
    const closed = closeRun({
      open,
      completed_at: '2026-07-11T14:05:00Z',
      page_count: 10,
      row_count: 10,
      cursor_chain_sent: ['a', 'b', 'c'],
      cursor_chain_returned: ['b', 'c', 'd'],
      http_status_last: 500,
      content_type_last: 'text/plain',
      response_headers_last: {},
      completion_state: 'failed_transport',
      failure_detail: 'HTTP 500 on page 10',
    });
    const wm = emptyWatermark('player_stats', 'season=2026');
    const attempt = advanceWatermark(wm, closed);
    assert.equal(attempt.advanced, false);
    assert.equal(attempt.next.completed_at, null);
    assert.equal(attempt.next.completed_by_run_id, null);
  });
});

describe('partial page traversal — abandonment', () => {
  it('traversal aborted via max_pages returns partial_pagination and does not advance watermark', async () => {
    // Use only 5 max_pages against the 41-page fixture.
    const result = await traverseCursor(buildFetcherFromFixture(), {
      max_pages: 5,
    });
    assert.equal(result.completion_state, 'partial_pagination');
    assert.equal(result.pages.length, 5);

    const open = openRun({
      bdl_ingestion_run_id: 'run-abandoned',
      endpoint: 'player_stats',
      query_scope_key: 'season=2026',
      started_at: '2026-07-11T15:00:00Z',
    });
    const closed = closeRun({
      open,
      completed_at: '2026-07-11T15:01:00Z',
      page_count: result.pages.length,
      row_count: result.row_count,
      cursor_chain_sent: result.cursor_chain_sent,
      cursor_chain_returned: result.cursor_chain_returned,
      http_status_last: result.http_status_last,
      content_type_last: result.content_type_last,
      response_headers_last: result.response_headers_last,
      completion_state: result.completion_state,
      failure_detail: result.failure_detail,
    });
    const attempt = advanceWatermark(
      emptyWatermark('player_stats', 'season=2026'),
      closed
    );
    assert.equal(attempt.advanced, false);
    assert.equal(attempt.next.completed_at, null);
  });
});
