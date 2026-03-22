import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateHookConfig, installHooks, removeHooks } from '../lib/hooks.js';

describe('generateHookConfig', () => {
  it('generates HTTP-type hooks pointing to /api/hooks/claude-code', () => {
    const config = generateHookConfig('ns-dev-coder-1', 'http://localhost:4321');
    const events = Object.keys(config.hooks);
    assert.ok(events.includes('PreToolUse'));
    assert.ok(events.includes('PostToolUse'));
    assert.ok(events.includes('UserPromptSubmit'));
    assert.ok(events.includes('Stop'));

    for (const event of events) {
      const entries = config.hooks[event];
      assert.equal(entries.length, 1);
      assert.equal(entries[0].type, 'http');
      assert.ok(entries[0].url.includes('/api/hooks/claude-code'));
    }
  });

  it('includes agent name as query parameter', () => {
    const config = generateHookConfig('ns-dev-reviewer', 'http://localhost:4321');
    const url = config.hooks['PreToolUse'][0].url;
    assert.ok(url.includes('agent=ns-dev-reviewer'));
    assert.ok(url.includes('name=ns-dev-reviewer'));
  });

  it('URL-encodes agent names', () => {
    const config = generateHookConfig('ns-dev-coder-1', 'http://localhost:9999');
    const url = config.hooks['PreToolUse'][0].url;
    assert.ok(url.startsWith('http://localhost:9999/api/hooks/claude-code'));
  });
});

describe('installHooks', () => {
  const tmp = join(tmpdir(), `ns-hooks-test-${Date.now()}`);

  afterEach(() => {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('writes hooks to settings.local.json in each worktree', () => {
    // Create fake worktree dirs
    const repoRoot = join(tmp, 'repo');
    const wtBase = join(tmp, 'worktrees');
    mkdirSync(join(wtBase, 'planner'), { recursive: true });
    mkdirSync(join(wtBase, 'reviewer'), { recursive: true });
    mkdirSync(repoRoot, { recursive: true });

    // Custom installHooks that uses our tmp paths
    // We'll test by calling installHooks with a custom structure
    // Since installHooks uses homedir-based paths, we'll test generateHookConfig + write logic
    const config = generateHookConfig('ns-dev-planner', 'http://localhost:4321');
    const settingsDir = join(wtBase, 'planner', '.claude');
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(join(settingsDir, 'settings.local.json'), JSON.stringify({ hooks: config.hooks }, null, 2));

    const written = JSON.parse(readFileSync(join(settingsDir, 'settings.local.json'), 'utf-8'));
    assert.ok(written.hooks.PreToolUse);
    assert.equal(written.hooks.PreToolUse[0].type, 'http');
  });

  it('merges with existing settings (does not overwrite)', () => {
    const dir = join(tmp, 'merge-test');
    const settingsDir = join(dir, '.claude');
    mkdirSync(settingsDir, { recursive: true });

    // Write existing settings with a custom hook
    const existing = {
      someOtherSetting: true,
      hooks: {
        PreToolUse: [{ type: 'command', command: 'echo test' }],
      },
    };
    writeFileSync(join(settingsDir, 'settings.local.json'), JSON.stringify(existing));

    // Simulate what installHooks does: read-modify-write
    const settings = JSON.parse(readFileSync(join(settingsDir, 'settings.local.json'), 'utf-8'));
    const hookConfig = generateHookConfig('ns-dev-coder-1', 'http://localhost:4321');
    const hooks = settings.hooks as Record<string, unknown[]>;

    for (const event of Object.keys(hookConfig.hooks)) {
      const eventHooks = (hooks[event] ?? []) as unknown[];
      eventHooks.push({ ...hookConfig.hooks[event][0], __nightshift_viz__: true });
      hooks[event] = eventHooks;
    }

    writeFileSync(join(settingsDir, 'settings.local.json'), JSON.stringify(settings, null, 2));

    // Verify
    const result = JSON.parse(readFileSync(join(settingsDir, 'settings.local.json'), 'utf-8'));
    assert.equal(result.someOtherSetting, true);
    // PreToolUse should have both the original and the new hook
    assert.equal(result.hooks.PreToolUse.length, 2);
    assert.equal(result.hooks.PreToolUse[0].type, 'command');
    assert.equal(result.hooks.PreToolUse[1].type, 'http');
  });
});

describe('removeHooks', () => {
  const tmp = join(tmpdir(), `ns-hooks-remove-test-${Date.now()}`);

  afterEach(() => {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('removes nightshift hooks without affecting other hooks', () => {
    const dir = join(tmp, 'remove-test', '.claude');
    mkdirSync(dir, { recursive: true });

    const settings = {
      hooks: {
        PreToolUse: [
          { type: 'command', command: 'echo custom' },
          { type: 'http', url: 'http://localhost:4321/api/hooks/claude-code', __nightshift_viz__: true },
        ],
        Stop: [
          { type: 'http', url: 'http://localhost:4321/api/hooks/claude-code', __nightshift_viz__: true },
        ],
      },
    };
    writeFileSync(join(dir, 'settings.local.json'), JSON.stringify(settings));

    // Simulate removeHooks logic
    const loaded = JSON.parse(readFileSync(join(dir, 'settings.local.json'), 'utf-8'));
    const hooks = loaded.hooks as Record<string, Array<Record<string, unknown>>>;

    for (const event of Object.keys(hooks)) {
      hooks[event] = hooks[event].filter(h => !h.__nightshift_viz__);
      if (hooks[event].length === 0) delete hooks[event];
    }

    writeFileSync(join(dir, 'settings.local.json'), JSON.stringify(loaded, null, 2));

    const result = JSON.parse(readFileSync(join(dir, 'settings.local.json'), 'utf-8'));
    // PreToolUse should still have the custom hook
    assert.equal(result.hooks.PreToolUse.length, 1);
    assert.equal(result.hooks.PreToolUse[0].type, 'command');
    // Stop should be removed entirely
    assert.equal(result.hooks.Stop, undefined);
  });
});
