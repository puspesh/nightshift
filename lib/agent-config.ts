import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentModelConfig, AgentConfigs } from './types.js';

/**
 * Load agent model config from .claude/nightshift/ns-{team}-agents.json.
 * Returns empty object if file doesn't exist or is invalid.
 */
export function loadAgentConfig(repoRoot: string, team: string): AgentConfigs {
  const configPath = join(repoRoot, '.claude', 'nightshift', `ns-${team}-agents.json`);
  if (!existsSync(configPath)) return {};

  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    const result: AgentConfigs = {};
    for (const [key, val] of Object.entries(raw)) {
      if (!key.startsWith('_') && typeof val === 'object' && val !== null) {
        result[key] = val as AgentModelConfig;
      }
    }
    return result;
  } catch {
    console.warn('Warning: Could not parse agent config, using defaults');
    return {};
  }
}

/**
 * Resolve model config for a specific role.
 * Resolution order:
 *   1. Exact role match (e.g., "coder-1")
 *   2. Base role wildcard (e.g., "coder" for any "coder-N")
 *   3. Empty config (inherit from global runner)
 */
export function resolveAgentConfig(
  role: string,
  configs: AgentConfigs,
): AgentModelConfig {
  if (configs[role]) return configs[role];
  if (role.startsWith('coder-') && configs['coder']) return configs['coder'];
  return {};
}

/**
 * Build a runner command for a specific agent by applying config overrides
 * to the base runner. Replaces existing flags or appends new ones.
 */
export function buildRunnerForAgent(
  baseRunner: string,
  config: AgentModelConfig,
): string {
  let runner = baseRunner;

  if (config.model) {
    runner = replaceOrAppendFlag(runner, '--model', config.model);
  }
  if (config.thinkingBudget) {
    runner = replaceOrAppendFlag(runner, '--thinking-budget', config.thinkingBudget);
  }
  if (config.reasoningEffort) {
    runner = replaceOrAppendFlag(runner, '--reasoning-effort', config.reasoningEffort);
  }

  return runner;
}

function replaceOrAppendFlag(cmd: string, flag: string, value: string): string {
  const regex = new RegExp(`${flag.replace(/-/g, '\\-')}\\s+\\S+`);
  if (regex.test(cmd)) {
    return cmd.replace(regex, `${flag} ${value}`);
  }
  return `${cmd} ${flag} ${value}`;
}
