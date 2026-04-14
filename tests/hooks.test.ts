import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateHookConfig } from '../lib/hooks.js';

describe('generateHookConfig', () => {
  it('generates command hooks using ns-heartbeat.sh script', () => {
    const config = generateHookConfig('ns-dev-coder-1', 'http://localhost:4321');
    const events = Object.keys(config.hooks);
    assert.equal(events.length, 9);
    assert.ok(events.includes('SessionStart'));
    assert.ok(events.includes('PreToolUse'));
    assert.ok(events.includes('PostToolUse'));
    assert.ok(events.includes('PostToolUseFailure'));
    assert.ok(events.includes('UserPromptSubmit'));
    assert.ok(events.includes('Stop'));
    assert.ok(events.includes('SubagentStart'));
    assert.ok(events.includes('SubagentStop'));
    assert.ok(events.includes('SessionEnd'));

    for (const event of events) {
      const entries = config.hooks[event];
      assert.equal(entries.length, 1);
      assert.equal(entries[0].matcher, '');
      assert.equal(entries[0].hooks.length, 1);
      assert.equal(entries[0].hooks[0].type, 'command');
      assert.ok(entries[0].hooks[0].command.includes('ns-heartbeat.sh'));
    }
  });

  it('includes agent name in command', () => {
    const config = generateHookConfig('ns-dev-reviewer', 'http://localhost:4321');
    const cmd = config.hooks['PreToolUse'][0].hooks[0].command;
    assert.ok(cmd.includes('ns-dev-reviewer'));
  });

  it('uses correct server URL', () => {
    const config = generateHookConfig('ns-dev-coder-1', 'http://localhost:9999');
    const cmd = config.hooks['PreToolUse'][0].hooks[0].command;
    assert.ok(cmd.includes('http://localhost:9999'));
  });

  it('includes event name in command args', () => {
    const config = generateHookConfig('ns-dev-coder-1', 'http://localhost:4321');
    const cmd = config.hooks['Stop'][0].hooks[0].command;
    assert.ok(cmd.includes('"Stop"'));
  });

  it('SessionStart hook includes correct event name', () => {
    const config = generateHookConfig('ns-dev-coder-1', 'http://localhost:4321');
    const cmd = config.hooks['SessionStart'][0].hooks[0].command;
    assert.ok(cmd.includes('"SessionStart"'));
  });
});

describe('installHooks (integration via file simulation)', () => {
  const tmp = join(tmpdir(), `ns-hooks-test-${Date.now()}`);

  afterEach(() => {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('writes hooks to settings.local.json', () => {
    const config = generateHookConfig('ns-dev-planner', 'http://localhost:4321');
    const settingsDir = join(tmp, 'planner', '.claude');
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(join(settingsDir, 'settings.local.json'), JSON.stringify({ hooks: config.hooks }, null, 2));

    const written = JSON.parse(readFileSync(join(settingsDir, 'settings.local.json'), 'utf-8'));
    assert.ok(written.hooks.PreToolUse);
    assert.equal(written.hooks.PreToolUse[0].matcher, '');
    assert.ok(written.hooks.PreToolUse[0].hooks[0].command.includes('ns-heartbeat.sh'));
  });

  it('merges with existing settings (does not overwrite)', () => {
    const dir = join(tmp, 'merge-test');
    const settingsDir = join(dir, '.claude');
    mkdirSync(settingsDir, { recursive: true });

    const existing = {
      someOtherSetting: true,
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo test' }] }],
      },
    };
    writeFileSync(join(settingsDir, 'settings.local.json'), JSON.stringify(existing));

    const settings = JSON.parse(readFileSync(join(settingsDir, 'settings.local.json'), 'utf-8'));
    const hookConfig = generateHookConfig('ns-dev-coder-1', 'http://localhost:4321');
    const hooks = settings.hooks as Record<string, unknown[]>;

    for (const event of Object.keys(hookConfig.hooks)) {
      const eventHooks = (hooks[event] ?? []) as Array<Record<string, unknown>>;
      hooks[event] = [...eventHooks, hookConfig.hooks[event][0] as unknown as Record<string, unknown>];
    }

    writeFileSync(join(settingsDir, 'settings.local.json'), JSON.stringify(settings, null, 2));

    const result = JSON.parse(readFileSync(join(settingsDir, 'settings.local.json'), 'utf-8'));
    assert.equal(result.someOtherSetting, true);
    // PreToolUse should have both the original and the new hook
    assert.equal(result.hooks.PreToolUse.length, 2);
    assert.equal(result.hooks.PreToolUse[0].matcher, 'Bash');
    assert.equal(result.hooks.PreToolUse[1].matcher, '');
  });
});
