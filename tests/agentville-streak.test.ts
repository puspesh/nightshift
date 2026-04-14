import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStreak } from '../lib/agentville/streak.js';

describe('evaluateStreak', () => {
  it('same day: no change', () => {
    const now = new Date('2026-04-14T15:00:00Z');
    const result = evaluateStreak(
      { streakDays: 5, lastActiveDate: '2026-04-14', timezone: 'UTC' },
      now,
    );
    assert.equal(result.streakDays, 5);
    assert.equal(result.lastActiveDate, '2026-04-14');
  });

  it('next day: increment', () => {
    const now = new Date('2026-04-15T10:00:00Z');
    const result = evaluateStreak(
      { streakDays: 5, lastActiveDate: '2026-04-14', timezone: 'UTC' },
      now,
    );
    assert.equal(result.streakDays, 6);
    assert.equal(result.lastActiveDate, '2026-04-15');
  });

  it('skipped day: reset to 0', () => {
    const now = new Date('2026-04-16T10:00:00Z');
    const result = evaluateStreak(
      { streakDays: 5, lastActiveDate: '2026-04-14', timezone: 'UTC' },
      now,
    );
    assert.equal(result.streakDays, 0);
    assert.equal(result.lastActiveDate, '2026-04-16');
  });

  it('first day (streakDays 0, next day): goes to 1', () => {
    const now = new Date('2026-04-15T10:00:00Z');
    const result = evaluateStreak(
      { streakDays: 0, lastActiveDate: '2026-04-14', timezone: 'UTC' },
      now,
    );
    assert.equal(result.streakDays, 1);
    assert.equal(result.lastActiveDate, '2026-04-15');
  });

  it('timezone handling: late UTC is same local day', () => {
    // 2026-04-15 at 03:00 UTC = 2026-04-14 at 20:00 in America/Los_Angeles (PDT, UTC-7)
    const now = new Date('2026-04-15T03:00:00Z');
    const result = evaluateStreak(
      { streakDays: 3, lastActiveDate: '2026-04-14', timezone: 'America/Los_Angeles' },
      now,
    );
    // In LA timezone, it's still April 14 → no change
    assert.equal(result.streakDays, 3);
    assert.equal(result.lastActiveDate, '2026-04-14');
  });

  it('timezone handling: past midnight local time increments', () => {
    // 2026-04-15 at 08:00 UTC = 2026-04-15 at 01:00 in America/Los_Angeles
    const now = new Date('2026-04-15T08:00:00Z');
    const result = evaluateStreak(
      { streakDays: 3, lastActiveDate: '2026-04-14', timezone: 'America/Los_Angeles' },
      now,
    );
    assert.equal(result.streakDays, 4);
    assert.equal(result.lastActiveDate, '2026-04-15');
  });

  it('many days skipped resets', () => {
    const now = new Date('2026-04-20T10:00:00Z');
    const result = evaluateStreak(
      { streakDays: 10, lastActiveDate: '2026-04-14', timezone: 'UTC' },
      now,
    );
    assert.equal(result.streakDays, 0);
    assert.equal(result.lastActiveDate, '2026-04-20');
  });
});
