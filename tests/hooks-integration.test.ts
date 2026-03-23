import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateHookConfig } from '../lib/hooks.js';

describe('generateHookConfig includes SessionStart', () => {
  it('generates hooks for all 5 events including SessionStart', () => {
    const config = generateHookConfig('ns-dev-tester', 'http://localhost:4321');
    const events = Object.keys(config.hooks);
    assert.equal(events.length, 5);
    assert.ok(events.includes('SessionStart'), 'SessionStart must be included');
    assert.ok(events.includes('PreToolUse'));
    assert.ok(events.includes('PostToolUse'));
    assert.ok(events.includes('UserPromptSubmit'));
    assert.ok(events.includes('Stop'));
  });

  it('SessionStart hook includes agent and name query params', () => {
    const config = generateHookConfig('ns-dev-tester', 'http://localhost:4321');
    const cmd = config.hooks['SessionStart'][0].hooks[0].command;
    assert.ok(cmd.includes('agent=ns-dev-tester'), 'must include agent query param');
    assert.ok(cmd.includes('name=ns-dev-tester'), 'must include name query param');
  });

  it('SessionStart hook includes correct event name in POST body', () => {
    const config = generateHookConfig('ns-dev-coder-1', 'http://localhost:4321');
    const cmd = config.hooks['SessionStart'][0].hooks[0].command;
    assert.ok(cmd.includes('"hook_event_name":"SessionStart"'));
  });

  it('all events use fire-and-forget curl pattern', () => {
    const config = generateHookConfig('ns-dev-producer', 'http://localhost:4321');
    for (const event of Object.keys(config.hooks)) {
      const cmd = config.hooks[event][0].hooks[0].command;
      assert.ok(cmd.includes('curl -s -o /dev/null'), `${event} must use silent curl`);
      assert.ok(cmd.includes('|| true'), `${event} must have || true fallback`);
    }
  });
});
