import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAgentConfig, buildRunnerForAgent } from '../lib/agent-config.js';
import type { AgentDefinition } from '../lib/team-config.js';

// Minimal AgentDefinition stubs for testing
function stubDef(overrides: Partial<AgentDefinition>): AgentDefinition {
  return {
    description: '', watches: [], transitions: {}, tools: [], model: '',
    ...overrides,
  };
}

describe('resolveAgentConfig', () => {
  const configs: Record<string, AgentDefinition> = {
    producer: stubDef({ model: 'sonnet' }),
    coder: stubDef({ model: 'opus', thinking_budget: 'high' }),
    'coder-1': stubDef({ model: 'haiku' }),
  };

  it('returns exact match for coder-1', () => {
    const result = resolveAgentConfig('coder-1', configs);
    assert.equal(result?.model, 'haiku');
  });

  it('falls back to coder wildcard for coder-2', () => {
    const result = resolveAgentConfig('coder-2', configs);
    assert.equal(result?.model, 'opus');
    assert.equal(result?.thinking_budget, 'high');
  });

  it('returns exact match for producer', () => {
    const result = resolveAgentConfig('producer', configs);
    assert.equal(result?.model, 'sonnet');
  });

  it('returns undefined for unknown roles', () => {
    const result = resolveAgentConfig('reviewer', configs);
    assert.equal(result, undefined);
  });

  it('falls back to base role for any scalable agent (not just coder)', () => {
    const custom: Record<string, AgentDefinition> = {
      worker: stubDef({ model: 'opus' }),
    };
    assert.equal(resolveAgentConfig('worker-1', custom)?.model, 'opus');
    assert.equal(resolveAgentConfig('worker-3', custom)?.model, 'opus');
  });

  it('exact match takes priority over base role for any scalable agent', () => {
    const custom: Record<string, AgentDefinition> = {
      worker: stubDef({ model: 'sonnet' }),
      'worker-2': stubDef({ model: 'haiku' }),
    };
    assert.equal(resolveAgentConfig('worker-1', custom)?.model, 'sonnet');
    assert.equal(resolveAgentConfig('worker-2', custom)?.model, 'haiku');
  });
});

describe('buildRunnerForAgent', () => {
  const base = 'claude --dangerously-skip-permissions';

  it('returns base runner unchanged with undefined config', () => {
    assert.equal(buildRunnerForAgent(base, undefined), base);
  });

  it('appends --model flag', () => {
    const result = buildRunnerForAgent(base, stubDef({ model: 'opus' }));
    assert.equal(result, `${base} --model opus`);
  });

  it('appends --thinking-budget flag', () => {
    const result = buildRunnerForAgent(base, stubDef({ thinking_budget: '10000' }));
    assert.equal(result, `${base} --thinking-budget 10000`);
  });

  it('appends --reasoning-effort flag', () => {
    const result = buildRunnerForAgent(base, stubDef({ reasoning_effort: 'high' }));
    assert.equal(result, `${base} --reasoning-effort high`);
  });

  it('appends multiple flags simultaneously', () => {
    const result = buildRunnerForAgent(base, stubDef({
      model: 'opus',
      thinking_budget: 'high',
      reasoning_effort: 'medium',
    }));
    assert.equal(result, `${base} --model opus --thinking-budget high --reasoning-effort medium`);
  });

  it('replaces existing --model flag in base runner', () => {
    const withModel = `${base} --model sonnet`;
    const result = buildRunnerForAgent(withModel, stubDef({ model: 'opus' }));
    assert.equal(result, `${base} --model opus`);
  });

  it('replaces existing flag and appends new ones', () => {
    const withModel = `${base} --model sonnet`;
    const result = buildRunnerForAgent(withModel, stubDef({ model: 'opus', thinking_budget: 'high' }));
    assert.equal(result, `${base} --model opus --thinking-budget high`);
  });
});
