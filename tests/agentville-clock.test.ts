import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatClockTime } from '../lib/agentville/clock.js';

describe('formatClockTime', () => {
  it('returns HH:MM in 24h format', () => {
    // 2026-04-17 14:30:00 UTC
    const date = new Date('2026-04-17T14:30:00Z');
    const result = formatClockTime('UTC', date);
    assert.equal(result, '14:30');
  });

  it('uses timezone correctly', () => {
    // Same timestamp, different timezone should give different hour
    const date = new Date('2026-04-17T14:30:00Z');
    const utcResult = formatClockTime('UTC', date);
    const tokyoResult = formatClockTime('Asia/Tokyo', date);
    assert.notEqual(utcResult, tokyoResult);
    // Tokyo is UTC+9, so 14:30 UTC = 23:30 JST
    assert.equal(tokyoResult, '23:30');
  });

  it('pads single-digit hours and minutes', () => {
    // 2026-01-15 09:05:00 UTC
    const date = new Date('2026-01-15T09:05:00Z');
    const result = formatClockTime('UTC', date);
    assert.equal(result, '09:05');
  });

  it('handles UTC', () => {
    const date = new Date('2026-04-17T00:00:00Z');
    const result = formatClockTime('UTC', date);
    assert.equal(result, '00:00');
  });

  it('handles midnight in a timezone', () => {
    // 2026-04-17 15:00:00 UTC = 2026-04-18 00:00:00 Asia/Tokyo (UTC+9)
    const date = new Date('2026-04-17T15:00:00Z');
    const result = formatClockTime('Asia/Tokyo', date);
    assert.equal(result, '00:00');
  });
});
