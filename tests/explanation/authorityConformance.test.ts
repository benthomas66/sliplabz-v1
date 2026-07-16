// V1-A1-4 authority-conformance test — reads EVIDENCE_PROFILE_METHOD_V1.md
// at test time and asserts three things pin to the authority verbatim:
//
//   1. The two §G disclosure texts hard-coded in `EXEMPT_ALLOWLIST_STRINGS`
//      (src/explanation/copySafetyTerms.ts) appear byte-identically in the
//      authority.
//   2. The two §G disclosure texts hard-coded in
//      `DISCLOSURE_G1_TEXT` / `DISCLOSURE_G2_TEXT`
//      (src/explanation/disclosures.ts) equal the allowlist literals AND
//      appear byte-identically in the authority.
//   3. Every §E reason translation in
//      `REASON_TRANSLATIONS` (src/explanation/vocabulary.ts) appears
//      byte-identically inside the §E section of the authority.
//
// Why this exists (governor REVISE 2026-07-15): before this test,
// "verbatim" was a promise in a report. Now it is a machine-checked fact.
// An edit to either the code OR the authority that drifts them apart
// fails this test.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXEMPT_ALLOWLIST_STRINGS } from '../../src/explanation/copySafetyTerms.js';
import {
  DISCLOSURE_G1_TEXT,
  DISCLOSURE_G2_TEXT,
} from '../../src/explanation/disclosures.js';
import { REASON_TRANSLATIONS } from '../../src/explanation/vocabulary.js';
import type { EvidenceReasonCode } from '../../src/shared/enums.js';
import { EVIDENCE_REASON_CODES } from '../../src/shared/enums.js';

const here = dirname(fileURLToPath(import.meta.url));
const AUTHORITY_PATH = pathResolve(here, '..', '..', 'docs', 'product', 'EVIDENCE_PROFILE_METHOD_V1.md');

/** Read the authority once per test file. Cached in module scope. */
const AUTHORITY_TEXT = readFileSync(AUTHORITY_PATH, 'utf-8');

describe('authority conformance — the code and the authority stay pinned together', () => {
  it('AUTHORITY exists at the expected path and is non-empty', () => {
    assert.ok(AUTHORITY_TEXT.length > 0, `authority file empty or missing: ${AUTHORITY_PATH}`);
    // Sanity: the file begins with the method-authority title.
    assert.ok(
      AUTHORITY_TEXT.startsWith('# SlipLabz Evidence Profile Method'),
      `authority file does not begin with the expected title; path likely wrong`
    );
  });

  it('EXEMPT_ALLOWLIST_STRINGS contains EXACTLY the two §G disclosure literals — no wildcards, no additions', () => {
    assert.equal(
      EXEMPT_ALLOWLIST_STRINGS.length, 2,
      `EXEMPT_ALLOWLIST_STRINGS must have exactly 2 entries (§G.1 and §G.2); got ${EXEMPT_ALLOWLIST_STRINGS.length}`
    );
  });

  it('EXEMPT_ALLOWLIST_STRINGS[0] (§G.1) appears verbatim in the authority', () => {
    const g1 = EXEMPT_ALLOWLIST_STRINGS[0]!;
    assert.ok(
      AUTHORITY_TEXT.includes(g1),
      `§G.1 exemption literal not found verbatim in authority.\nLiteral: ${JSON.stringify(g1)}`
    );
  });

  it('EXEMPT_ALLOWLIST_STRINGS[1] (§G.2) appears verbatim in the authority', () => {
    const g2 = EXEMPT_ALLOWLIST_STRINGS[1]!;
    assert.ok(
      AUTHORITY_TEXT.includes(g2),
      `§G.2 exemption literal not found verbatim in authority.\nLiteral: ${JSON.stringify(g2)}`
    );
  });

  it('LOAD-BEARING: disclosures.ts constants equal EXEMPT_ALLOWLIST_STRINGS byte-for-byte (no silent drift possible)', () => {
    // If disclosures.ts is edited to drift from the authority, this
    // assertion fires. If EXEMPT_ALLOWLIST_STRINGS is edited to drift
    // from disclosures.ts, this assertion fires. If either drifts from
    // the authority, the two prior tests fire.
    assert.equal(DISCLOSURE_G1_TEXT, EXEMPT_ALLOWLIST_STRINGS[0],
      'DISCLOSURE_G1_TEXT must equal EXEMPT_ALLOWLIST_STRINGS[0] byte-for-byte');
    assert.equal(DISCLOSURE_G2_TEXT, EXEMPT_ALLOWLIST_STRINGS[1],
      'DISCLOSURE_G2_TEXT must equal EXEMPT_ALLOWLIST_STRINGS[1] byte-for-byte');
  });

  it('LOAD-BEARING: every §E translation in vocabulary.ts appears verbatim inside the §E section of the authority', () => {
    // Locate the §E section boundaries so a substring match that lands
    // elsewhere in the document (e.g. §I.3 quoting a translation) is
    // rejected as insufficient evidence of §E conformance.
    const eStart = AUTHORITY_TEXT.indexOf('## E. Reason codes — closed vocabulary');
    const eEnd = AUTHORITY_TEXT.indexOf('## F. Worked examples');
    assert.ok(eStart >= 0, '§E anchor not found in authority');
    assert.ok(eEnd > eStart, '§F anchor not found after §E in authority');
    const eSection = AUTHORITY_TEXT.slice(eStart, eEnd);

    const missing: Array<{ code: EvidenceReasonCode; translation: string }> = [];
    for (const code of EVIDENCE_REASON_CODES) {
      if (code === 'abnormal_dispersion') continue; // RESERVED — empty translation by design
      const translation = REASON_TRANSLATIONS[code];
      // §E is a Markdown table with pipe delimiters. Substring match
      // inside the §E slice is sufficient — the translation text is
      // long enough (each is a complete sentence) that a coincidental
      // match elsewhere is not credible.
      if (!eSection.includes(translation)) {
        missing.push({ code, translation });
      }
    }
    assert.deepEqual(
      missing, [],
      `§E translations not found verbatim in the authority's §E section — either the code paraphrased the authority OR the authority was edited without updating the code. Report as GOVERNANCE FINDING; do NOT resolve by editing the authority. Details: ${JSON.stringify(missing, null, 2)}`
    );
  });

  it('LOAD-BEARING: RESERVED reason code (abnormal_dispersion) has no translation in code AND the authority marks it RESERVED', () => {
    // Complements the previous test: prove the RESERVED exclusion is
    // authorized by the authority, not silently omitted.
    assert.equal(REASON_TRANSLATIONS.abnormal_dispersion, '',
      'RESERVED code abnormal_dispersion must have no translation in code');
    // The authority marks it: search for the RESERVED marker text.
    assert.ok(
      AUTHORITY_TEXT.includes('`ABNORMAL_DISPERSION`') && AUTHORITY_TEXT.includes('RESERVED'),
      'authority must mark ABNORMAL_DISPERSION as RESERVED'
    );
  });
});
