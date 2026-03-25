import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAgentConfig, resolveAgentConfig, buildRunnerForAgent } from '../lib/agent-config.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'nightshift-agent-config-test-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('loadAgentConfig', () => {
  it('returns empty object when file does not exist', () => {
    const result = loadAgentConfig(tmp, 'dev');
    assert.deepEqual(result, {});
  });

  it('parses valid JSON and strips _comment keys', () => {
    const dir = join(tmp, '.claude', 'nightshift');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'ns-dev-agents.json'), JSON.stringify({
      _comment: 'This should be stripped',
      producer: { model: 'sonnet' },
      coder: { model: 'opus', thinkingBudget: 'high' },
    }));
    const result = loadAgentConfig(tmp, 'dev');
    assert.deepEqual(result, {
      producer: { model: 'sonnet' },
      coder: { model: 'opus', thinkingBudget: 'high' },
    });
  });

  it('returns empty object on invalid JSON', () => {
    const dir = join(tmp, '.claude', 'nightshift');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'ns-dev-agents.json'), '{ broken json');
    const result = loadAgentConfig(tmp, 'dev');
    assert.deepEqual(result, {});
  });
});

describe('resolveAgentConfig', () => {
  const configs = {
    producer: { model: 'sonnet' },
    coder: { model: 'opus', thinkingBudget: 'high' },
    'coder-1': { model: 'haiku' },
  };

  it('returns exact match for coder-1', () => {
    const result = resolveAgentConfig('coder-1', configs);
    assert.deepEqual(result, { model: 'haiku' });
  });

  it('falls back to coder wildcard for coder-2', () => {
    const result = resolveAgentConfig('coder-2', configs);
    assert.deepEqual(result, { model: 'opus', thinkingBudget: 'high' });
  });

  it('returns exact match for producer', () => {
    const result = resolveAgentConfig('producer', configs);
    assert.deepEqual(result, { model: 'sonnet' });
  });

  it('returns empty config for unknown roles', () => {
    const result = resolveAgentConfig('reviewer', configs);
    assert.deepEqual(result, {});
  });
});

describe('buildRunnerForAgent', () => {
  const base = 'claude --dangerously-skip-permissions';

  it('returns base runner unchanged with empty config', () => {
    assert.equal(buildRunnerForAgent(base, {}), base);
  });

  it('appends --model flag', () => {
    const result = buildRunnerForAgent(base, { model: 'opus' });
    assert.equal(result, `${base} --model opus`);
  });

  it('appends --thinking-budget flag', () => {
    const result = buildRunnerForAgent(base, { thinkingBudget: '10000' });
    assert.equal(result, `${base} --thinking-budget 10000`);
  });

  it('appends --reasoning-effort flag', () => {
    const result = buildRunnerForAgent(base, { reasoningEffort: 'high' });
    assert.equal(result, `${base} --reasoning-effort high`);
  });

  it('appends multiple flags simultaneously', () => {
    const result = buildRunnerForAgent(base, {
      model: 'opus',
      thinkingBudget: 'high',
      reasoningEffort: 'medium',
    });
    assert.equal(result, `${base} --model opus --thinking-budget high --reasoning-effort medium`);
  });

  it('replaces existing --model flag in base runner', () => {
    const withModel = `${base} --model sonnet`;
    const result = buildRunnerForAgent(withModel, { model: 'opus' });
    assert.equal(result, `${base} --model opus`);
  });

  it('replaces existing flag and appends new ones', () => {
    const withModel = `${base} --model sonnet`;
    const result = buildRunnerForAgent(withModel, { model: 'opus', thinkingBudget: 'high' });
    assert.equal(result, `${base} --model opus --thinking-budget high`);
  });
});
