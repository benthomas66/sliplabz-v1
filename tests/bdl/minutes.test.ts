// Ticket §6 required tests covered here:
//   - numeric minutes >0        → parseBdlMinutes → 'played'
//   - numeric zero               → parseBdlMinutes → 'dnp'
//   - `"--"` minutes             → parseBdlMinutes → 'unresolved_non_numeric', NOT DNP
//
// Ticket hard invariant: `"--"` is a distinct minutes-state, never coerced
// to zero, never treated as DNP.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseBdlMinutes } from '../../src/bdl/minutes.js';

describe('parseBdlMinutes — three canonical states (BDL §7.2)', () => {
  it('numeric string > 0 → played', () => {
    const r = parseBdlMinutes('28');
    assert.equal(r.status, 'played');
    assert.equal(r.parsed_minutes, 28);
    assert.equal(r.raw_minutes, '28');
  });

  it('low-minute appearance (1) still counts as played (BDL §7.4)', () => {
    const r = parseBdlMinutes('1');
    assert.equal(r.status, 'played');
    assert.equal(r.parsed_minutes, 1);
  });

  it('numeric string "0" → dnp with parsed_minutes = 0', () => {
    const r = parseBdlMinutes('0');
    assert.equal(r.status, 'dnp');
    assert.equal(r.parsed_minutes, 0);
    assert.equal(r.raw_minutes, '0');
  });

  it('numeric 0 (number) → dnp with parsed_minutes = 0', () => {
    const r = parseBdlMinutes(0);
    assert.equal(r.status, 'dnp');
    assert.equal(r.parsed_minutes, 0);
  });

  it('LOAD-BEARING: "--" → unresolved_non_numeric; NEVER DNP; parsed_minutes=null; raw preserved', () => {
    const r = parseBdlMinutes('--');
    assert.equal(r.status, 'unresolved_non_numeric');
    assert.equal(r.parsed_minutes, null);
    assert.equal(r.raw_minutes, '--');
    assert.notEqual(r.status, 'dnp');
  });

  it('null → unresolved_non_numeric; raw_minutes null (not "null" string)', () => {
    const r = parseBdlMinutes(null);
    assert.equal(r.status, 'unresolved_non_numeric');
    assert.equal(r.parsed_minutes, null);
    assert.equal(r.raw_minutes, null);
  });

  it('undefined → unresolved_non_numeric; raw_minutes null', () => {
    const r = parseBdlMinutes(undefined);
    assert.equal(r.status, 'unresolved_non_numeric');
    assert.equal(r.parsed_minutes, null);
    assert.equal(r.raw_minutes, null);
  });

  it('empty string → unresolved_non_numeric', () => {
    const r = parseBdlMinutes('');
    assert.equal(r.status, 'unresolved_non_numeric');
    assert.equal(r.parsed_minutes, null);
  });

  it('MM:SS clock 0:00 → dnp', () => {
    const r = parseBdlMinutes('0:00');
    assert.equal(r.status, 'dnp');
    assert.equal(r.parsed_minutes, 0);
  });

  it('MM:SS clock 24:35 → played with fractional minutes', () => {
    const r = parseBdlMinutes('24:35');
    assert.equal(r.status, 'played');
    assert.ok(r.parsed_minutes !== null && r.parsed_minutes > 24);
    assert.ok(r.parsed_minutes! < 25);
  });

  it('newly observed non-integer format ("N/A") → unresolved_non_numeric (BDL §7.3)', () => {
    const r = parseBdlMinutes('N/A');
    assert.equal(r.status, 'unresolved_non_numeric');
    assert.equal(r.parsed_minutes, null);
    assert.equal(r.raw_minutes, 'N/A');
  });

  it('negative number → unresolved_non_numeric (never a DNP)', () => {
    const r = parseBdlMinutes(-5);
    assert.equal(r.status, 'unresolved_non_numeric');
    assert.equal(r.parsed_minutes, null);
    assert.notEqual(r.status, 'dnp');
  });
});
