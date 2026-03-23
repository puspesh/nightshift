import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCitizenConfig, resolveCitizenProps, DEFAULT_ROLE_COLORS, DEFAULT_CODER_COLOR } from '../lib/citizen-config.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'nightshift-citizen-test-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('loadCitizenConfig', () => {
  it('returns empty object when file does not exist', () => {
    const result = loadCitizenConfig(tmp, 'dev');
    assert.deepEqual(result, {});
  });

  it('returns parsed overrides from valid JSON', () => {
    const dir = join(tmp, '.claude', 'nightshift');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'ns-dev-citizens.json'), JSON.stringify({
      producer: { displayName: 'Boss', color: '#ff0000' },
    }));

    const result = loadCitizenConfig(tmp, 'dev');
    assert.deepEqual(result, { producer: { displayName: 'Boss', color: '#ff0000' } });
  });

  it('returns empty object on malformed JSON', () => {
    const dir = join(tmp, '.claude', 'nightshift');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'ns-dev-citizens.json'), '{invalid json!!!');

    const result = loadCitizenConfig(tmp, 'dev');
    assert.deepEqual(result, {});
  });
});

describe('resolveCitizenProps', () => {
  it('returns exact override when present', () => {
    const overrides = {
      producer: { displayName: 'Boss', color: '#ff0000' },
    };
    const result = resolveCitizenProps('producer', overrides);
    assert.equal(result.displayName, 'Boss');
    assert.equal(result.color, '#ff0000');
  });

  it('uses "coder" wildcard for coder-N roles', () => {
    const overrides = {
      coder: { displayName: null, color: '#aabbcc' },
    };
    const result = resolveCitizenProps('coder-1', overrides);
    assert.equal(result.displayName, 'coder-1');
    assert.equal(result.color, '#aabbcc');
  });

  it('exact coder-N overrides take precedence over wildcard', () => {
    const overrides = {
      coder: { displayName: null, color: '#aabbcc' },
      'coder-1': { displayName: 'Alpha Coder', color: '#112233' },
    };
    const result = resolveCitizenProps('coder-1', overrides);
    assert.equal(result.displayName, 'Alpha Coder');
    assert.equal(result.color, '#112233');
  });

  it('falls back to built-in defaults when no override', () => {
    const result = resolveCitizenProps('producer', {});
    assert.equal(result.displayName, 'producer');
    assert.equal(result.color, DEFAULT_ROLE_COLORS['producer']);
  });

  it('falls back to coder default color for coder-N with no override', () => {
    const result = resolveCitizenProps('coder-2', {});
    assert.equal(result.displayName, 'coder-2');
    assert.equal(result.color, DEFAULT_CODER_COLOR);
  });

  it('handles partial override with only displayName', () => {
    const overrides = {
      planner: { displayName: 'Architect' },
    };
    const result = resolveCitizenProps('planner', overrides);
    assert.equal(result.displayName, 'Architect');
    assert.equal(result.color, DEFAULT_ROLE_COLORS['planner']);
  });

  it('handles partial override with only color', () => {
    const overrides = {
      reviewer: { color: '#999999' },
    };
    const result = resolveCitizenProps('reviewer', overrides);
    assert.equal(result.displayName, 'reviewer');
    assert.equal(result.color, '#999999');
  });

  it('uses role name when displayName is null', () => {
    const overrides = {
      tester: { displayName: null, color: '#00ff00' },
    };
    const result = resolveCitizenProps('tester', overrides);
    assert.equal(result.displayName, 'tester');
    assert.equal(result.color, '#00ff00');
  });
});
