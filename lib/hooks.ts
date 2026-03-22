import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { HookConfig, HookEntry } from './types.js';

const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop'] as const;
const HOOK_MARKER = '__nightshift_viz__';

/**
 * Generate a Claude Code hook configuration for a single agent.
 * All hooks point to the miniverse-native /api/hooks/claude-code endpoint
 * which handles event-to-state mapping internally.
 */
export function generateHookConfig(agentName: string, serverUrl: string): HookConfig {
  const hooks: Record<string, HookEntry[]> = {};

  for (const event of HOOK_EVENTS) {
    hooks[event] = [{
      type: 'http',
      url: `${serverUrl}/api/hooks/claude-code?agent=${encodeURIComponent(agentName)}&name=${encodeURIComponent(agentName)}`,
    }];
  }

  return { hooks };
}

/**
 * Get the path to settings.local.json for a given worktree or repo root.
 */
function getSettingsPath(dir: string): string {
  return join(dir, '.claude', 'settings.local.json');
}

/**
 * Install visualization hooks in each agent's worktree settings.local.json.
 * Merges with existing settings (read-modify-write).
 */
export function installHooks(
  repoName: string,
  team: string,
  roles: string[],
  serverUrl: string,
  repoRoot: string,
): void {
  for (const role of roles) {
    const agentName = `ns-${team}-${role}`;

    // Determine the worktree path
    let dir: string;
    if (role === 'producer') {
      dir = repoRoot;
    } else {
      dir = join(homedir(), '.nightshift', repoName, team, 'worktrees', role);
    }

    if (!existsSync(dir)) continue;

    const hookConfig = generateHookConfig(agentName, serverUrl);
    const settingsPath = getSettingsPath(dir);

    // Read existing settings
    let settings: Record<string, unknown> = {};
    if (existsSync(settingsPath)) {
      try {
        settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      } catch {
        settings = {};
      }
    }

    // Merge hooks — add nightshift hooks alongside any existing hooks
    const existingHooks = (settings.hooks ?? {}) as Record<string, unknown[]>;

    for (const event of HOOK_EVENTS) {
      const eventHooks = (existingHooks[event] ?? []) as Array<Record<string, unknown>>;
      // Remove any previous nightshift hooks (identified by marker)
      const filtered = eventHooks.filter(h => !(h as Record<string, unknown>)[HOOK_MARKER]);
      // Add the new hook with marker
      const newHook = {
        ...hookConfig.hooks[event][0],
        [HOOK_MARKER]: true,
      };
      filtered.push(newHook);
      existingHooks[event] = filtered;
    }

    settings.hooks = existingHooks;

    // Write settings
    mkdirSync(join(dir, '.claude'), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  }
}

/**
 * Remove nightshift visualization hooks from each agent's worktree settings.
 * Leaves other hook entries untouched.
 */
export function removeHooks(
  repoName: string,
  team: string,
  roles: string[],
  repoRoot: string,
): void {
  for (const role of roles) {
    let dir: string;
    if (role === 'producer') {
      dir = repoRoot;
    } else {
      dir = join(homedir(), '.nightshift', repoName, team, 'worktrees', role);
    }

    const settingsPath = getSettingsPath(dir);
    if (!existsSync(settingsPath)) continue;

    let settings: Record<string, unknown>;
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    } catch {
      continue;
    }

    const hooks = settings.hooks as Record<string, unknown[]> | undefined;
    if (!hooks) continue;

    let modified = false;
    for (const event of HOOK_EVENTS) {
      const eventHooks = hooks[event] as Array<Record<string, unknown>> | undefined;
      if (!eventHooks) continue;

      const filtered = eventHooks.filter(h => !h[HOOK_MARKER]);
      if (filtered.length !== eventHooks.length) {
        modified = true;
        if (filtered.length === 0) {
          delete hooks[event];
        } else {
          hooks[event] = filtered;
        }
      }
    }

    if (modified) {
      // If hooks object is now empty, remove it
      if (Object.keys(hooks).length === 0) {
        delete settings.hooks;
      }

      // If settings is now empty, we could delete the file,
      // but it's safer to keep it with empty object
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    }
  }
}
