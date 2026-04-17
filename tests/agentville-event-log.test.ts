import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EventLogPersistence,
  isSignificant,
  formatSummary,
  type LogEntry,
} from '../lib/agentville/server/event-log-persistence.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'nightshift-eventlog-test-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('EventLogPersistence', () => {
  describe('append', () => {
    it('writes a JSONL line to the log file', () => {
      const log = new EventLogPersistence(tmp);
      const entry = log.append({
        timestamp: 1000,
        agentKey: 'nightshift/planner',
        type: 'work:completed',
        summary: 'merged PR #42',
      });
      assert.equal(entry.id, 1);
      assert.equal(entry.agentKey, 'nightshift/planner');
      assert.equal(entry.type, 'work:completed');
      assert.equal(entry.summary, 'merged PR #42');

      const raw = readFileSync(join(tmp, 'events.log'), 'utf-8').trim();
      const parsed = JSON.parse(raw);
      assert.equal(parsed.id, 1);
      assert.equal(parsed.agentKey, 'nightshift/planner');
    });

    it('creates the file if it does not exist', () => {
      const log = new EventLogPersistence(tmp);
      log.append({
        timestamp: 1000,
        agentKey: 'test/agent',
        type: 'work:completed',
        summary: 'test',
      });
      const content = readFileSync(join(tmp, 'events.log'), 'utf-8');
      assert.ok(content.length > 0);
    });

    it('appends (does not overwrite) on subsequent calls', () => {
      const log = new EventLogPersistence(tmp);
      log.append({ timestamp: 1, agentKey: 'a', type: 'work:completed', summary: 's1' });
      log.append({ timestamp: 2, agentKey: 'b', type: 'work:completed', summary: 's2' });
      log.append({ timestamp: 3, agentKey: 'c', type: 'work:completed', summary: 's3' });

      const lines = readFileSync(join(tmp, 'events.log'), 'utf-8').trim().split('\n');
      assert.equal(lines.length, 3);
    });
  });

  describe('loadRecent', () => {
    it('returns the last N entries in chronological order', () => {
      const log = new EventLogPersistence(tmp);
      for (let i = 1; i <= 10; i++) {
        log.append({ timestamp: i * 100, agentKey: `a${i}`, type: 'work:completed', summary: `s${i}` });
      }

      const recent = log.loadRecent(5);
      assert.equal(recent.length, 5);
      assert.equal(recent[0].id, 6);
      assert.equal(recent[4].id, 10);
    });

    it('returns all entries when fewer than N exist', () => {
      const log = new EventLogPersistence(tmp);
      log.append({ timestamp: 1, agentKey: 'a', type: 'work:completed', summary: 's1' });
      log.append({ timestamp: 2, agentKey: 'b', type: 'work:completed', summary: 's2' });

      const recent = log.loadRecent(50);
      assert.equal(recent.length, 2);
    });

    it('returns empty array from empty/missing file', () => {
      const log = new EventLogPersistence(tmp);
      const recent = log.loadRecent();
      assert.deepEqual(recent, []);
    });
  });

  describe('loadBefore', () => {
    it('returns entries older than the given id', () => {
      const log = new EventLogPersistence(tmp);
      for (let i = 1; i <= 20; i++) {
        log.append({ timestamp: i * 100, agentKey: `a${i}`, type: 'work:completed', summary: `s${i}` });
      }

      const entries = log.loadBefore(15, 5);
      assert.equal(entries.length, 5);
      assert.equal(entries[0].id, 10);
      assert.equal(entries[4].id, 14);
    });
  });

  describe('corrupt lines', () => {
    it('skips corrupt lines gracefully', () => {
      // Write mix of valid and invalid JSON
      const validEntry = JSON.stringify({ id: 1, timestamp: 100, agentKey: 'a', type: 'work:completed', summary: 's1' });
      const corruptLine = 'this is not json{{{';
      const validEntry2 = JSON.stringify({ id: 2, timestamp: 200, agentKey: 'b', type: 'work:completed', summary: 's2' });
      writeFileSync(join(tmp, 'events.log'), [validEntry, corruptLine, validEntry2].join('\n') + '\n');

      const log = new EventLogPersistence(tmp);
      const recent = log.loadRecent();
      assert.equal(recent.length, 2);
      assert.equal(recent[0].id, 1);
      assert.equal(recent[1].id, 2);
    });
  });

  describe('nextId initialization', () => {
    it('resumes id from existing log file', () => {
      const log1 = new EventLogPersistence(tmp);
      log1.append({ timestamp: 1, agentKey: 'a', type: 'work:completed', summary: 's1' });
      log1.append({ timestamp: 2, agentKey: 'b', type: 'work:completed', summary: 's2' });
      log1.append({ timestamp: 3, agentKey: 'c', type: 'work:completed', summary: 's3' });

      // Create a new instance — should resume from id 4
      const log2 = new EventLogPersistence(tmp);
      const entry = log2.append({ timestamp: 4, agentKey: 'd', type: 'work:completed', summary: 's4' });
      assert.equal(entry.id, 4);
    });
  });
});

describe('isSignificant', () => {
  it('returns true for work:completed', () => assert.equal(isSignificant('work:completed'), true));
  it('returns true for agent:spawned', () => assert.equal(isSignificant('agent:spawned'), true));
  it('returns true for agent:spawn-ended', () => assert.equal(isSignificant('agent:spawn-ended'), true));
  it('returns true for agent:error', () => assert.equal(isSignificant('agent:error'), true));
  it('returns false for agent:heartbeat', () => assert.equal(isSignificant('agent:heartbeat'), false));
  it('returns false for agent:idle', () => assert.equal(isSignificant('agent:idle'), false));
  it('returns false for state:update', () => assert.equal(isSignificant('state:update'), false));
});

describe('formatSummary', () => {
  it('uses description for work:completed', () => {
    const result = formatSummary('work:completed', 'nightshift/coder', { description: 'merged PR #42' });
    assert.equal(result, 'merged PR #42');
  });

  it('falls back to workType for work:completed without description', () => {
    const result = formatSummary('work:completed', 'nightshift/coder', { workType: 'commit' });
    assert.equal(result, 'commit');
  });

  it('formats agent:spawned', () => {
    const result = formatSummary('agent:spawned', 'nightshift/coder', { child: 'sub-1' });
    assert.equal(result, 'spawned sub-agent sub-1');
  });

  it('formats agent:spawn-ended', () => {
    const result = formatSummary('agent:spawn-ended', 'nightshift/coder', { child: 'sub-1' });
    assert.equal(result, 'sub-agent sub-1 finished');
  });

  it('formats agent:error', () => {
    const result = formatSummary('agent:error', 'nightshift/coder', { error: 'out of memory' });
    assert.equal(result, 'error: out of memory');
  });

  it('returns type for unknown event types', () => {
    const result = formatSummary('unknown:type', 'nightshift/coder', {});
    assert.equal(result, 'unknown:type');
  });
});

describe('In-memory buffer', () => {
  it('loadRecent serves from memory without re-reading disk', () => {
    const log = new EventLogPersistence(tmp);
    for (let i = 1; i <= 10; i++) {
      log.append({ timestamp: i * 100, agentKey: `a${i}`, type: 'work:completed', summary: `s${i}` });
    }

    // Delete the file to prove loadRecent uses the buffer, not disk
    unlinkSync(join(tmp, 'events.log'));

    const recent = log.loadRecent(5);
    assert.equal(recent.length, 5);
    assert.equal(recent[0].id, 6);
    assert.equal(recent[4].id, 10);
  });

  it('buffer is seeded from existing file on construction', () => {
    const log1 = new EventLogPersistence(tmp);
    for (let i = 1; i <= 5; i++) {
      log1.append({ timestamp: i * 100, agentKey: `a${i}`, type: 'work:completed', summary: `s${i}` });
    }

    // New instance should have the buffer seeded from disk
    const log2 = new EventLogPersistence(tmp);
    // Delete file to prove it uses the buffer
    unlinkSync(join(tmp, 'events.log'));

    const recent = log2.loadRecent(3);
    assert.equal(recent.length, 3);
    assert.equal(recent[0].id, 3);
    assert.equal(recent[2].id, 5);
  });

  it('loadBefore uses buffer when it has enough entries', () => {
    const log = new EventLogPersistence(tmp);
    for (let i = 1; i <= 20; i++) {
      log.append({ timestamp: i * 100, agentKey: `a${i}`, type: 'work:completed', summary: `s${i}` });
    }

    // Delete file to prove loadBefore can use the buffer
    unlinkSync(join(tmp, 'events.log'));

    const entries = log.loadBefore(15, 5);
    assert.equal(entries.length, 5);
    assert.equal(entries[0].id, 10);
    assert.equal(entries[4].id, 14);
  });
});

describe('Log rotation', () => {
  it('rotates files over 10MB', () => {
    const log = new EventLogPersistence(tmp);

    // Write enough data to exceed 10MB
    // Each entry is roughly 1100 bytes as JSON with big summary, so ~10000 entries ≈ 11MB
    const bigSummary = 'x'.repeat(1000);
    for (let i = 0; i < 11000; i++) {
      log.append({
        timestamp: i,
        agentKey: 'test/agent',
        type: 'work:completed',
        summary: bigSummary,
      });
    }

    // File should have been rotated — events.log.1 should exist
    assert.ok(existsSync(join(tmp, 'events.log.1')), 'rotated file should exist');

    // Current events.log should be smaller than 10MB (it was just created after rotation)
    const stat = statSync(join(tmp, 'events.log'));
    assert.ok(stat.size < 10 * 1024 * 1024, 'current log should be under 10MB after rotation');
  });

  it('concurrent appends do not corrupt the file', () => {
    const log = new EventLogPersistence(tmp);

    // Rapid sequential appends
    for (let i = 0; i < 100; i++) {
      log.append({
        timestamp: i,
        agentKey: `agent-${i % 5}`,
        type: 'work:completed',
        summary: `task ${i}`,
      });
    }

    // All lines should be valid JSON
    const entries = log.loadRecent(200);
    assert.equal(entries.length, 100);
    for (let i = 0; i < 100; i++) {
      assert.equal(entries[i].summary, `task ${i}`);
    }
  });
});
