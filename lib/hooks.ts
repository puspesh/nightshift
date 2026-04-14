import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { HookConfig, HookEntry } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HOOK_EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop'] as const;
const HOOK_URL_PATTERN = '/api/hooks/claude-code';
const HEARTBEAT_SCRIPT = join(__dirname, '..', 'bin', 'ns-heartbeat.sh');

/**
 * Check if a hook entry is a nightshift visualization hook.
 * Identified by URL containing the agentville claude-code hook endpoint.
 */
function isNightshiftHook(hook: Record<string, unknown>): boolean {
  if (Array.isArray(hook.hooks)) {
    return hook.hooks.some((h: Record<string, unknown>) =>
      typeof h.command === 'string' && (h.command.includes(HOOK_URL_PATTERN) || h.command.includes('ns-heartbeat.sh'))
    );
  }
  // Legacy format: {type: "http", url: "..."}
  return typeof hook.url === 'string' && hook.url.includes(HOOK_URL_PATTERN);
}

/**
 * Generate a Claude Code hook configuration for a single agent.
 * All hooks point to the agentville-native /api/hooks/claude-code endpoint
 * which handles event-to-state mapping internally.
 */
export function generateHookConfig(agentName: string, serverUrl: string): HookConfig {
  const hooks: Record<string, HookEntry[]> = {};

  for (const event of HOOK_EVENTS) {
    hooks[event] = [{
      matcher: '',
      hooks: [{
        type: 'command',
        command: `"${HEARTBEAT_SCRIPT}" "${serverUrl}" "${agentName}" "${event}"`,
      }],
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
      // Remove any previous nightshift hooks (identified by URL pattern)
      const filtered = eventHooks.filter(h => !isNightshiftHook(h));
      // Add the new hook
      filtered.push(hookConfig.hooks[event][0] as unknown as Record<string, unknown>);
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

      const filtered = eventHooks.filter(h => !isNightshiftHook(h));
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
