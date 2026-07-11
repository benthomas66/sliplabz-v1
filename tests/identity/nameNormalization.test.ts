import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName } from '../../src/identity/nameNormalization.js';

describe('normalizeName', () => {
  it('lowercases ASCII', () => {
    assert.equal(normalizeName('Gabby Williams'), 'gabby williams');
  });

  it('collapses combining-mark diacritics', () => {
    // "Camméro" written with combining acute (U+0301) on the e.
    const withCombining = 'Camméro';
    assert.equal(normalizeName(withCombining), 'cammero');
  });

  it('collapses precomposed accented letters via NFKD', () => {
    assert.equal(normalizeName('Camméró'), 'cammero');
  });

  it('treats curly and straight apostrophes as the same collapse', () => {
    assert.equal(normalizeName("O'Neal"), normalizeName('O’Neal'));
    assert.equal(normalizeName("O'Neal"), 'o neal');
  });

  it('treats hyphens like whitespace', () => {
    assert.equal(normalizeName('Reyes-Vega'), 'reyes vega');
  });

  it('collapses whitespace runs', () => {
    assert.equal(normalizeName('  Gabby   Williams  '), 'gabby williams');
  });

  it('returns empty string on empty input without throwing', () => {
    assert.equal(normalizeName(''), '');
  });

  it('is deterministic on rerun', () => {
    const name = 'Camméró-O’Neal';
    assert.equal(normalizeName(name), normalizeName(name));
  });

  it('never produces alphanumeric leakage from stripped diacritics', () => {
    // Combining-cedilla, tilde, circumflex etc. should all vanish.
    assert.equal(normalizeName('Ça Vã Ĉo'), 'ca va co');
  });
});
