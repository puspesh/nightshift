import type { AgentDefinition } from './team-config.js';

/**
 * Resolve model config for a specific role from team.yaml agent definitions.
 * Resolution order:
 *   1. Exact role match (e.g., "coder-1")
 *   2. Base role wildcard (e.g., "coder" for any "coder-N") — works for any scalable agent
 *   3. undefined (inherit from global runner)
 */
export function resolveAgentConfig(
  role: string,
  agents: Record<string, AgentDefinition>,
): AgentDefinition | undefined {
  if (agents[role]) return agents[role];
  // Try base role: strip trailing -N (e.g., "coder-1" → "coder")
  const baseMatch = role.match(/^(.+)-\d+$/);
  if (baseMatch && agents[baseMatch[1]]) return agents[baseMatch[1]];
  return undefined;
}

/**
 * Build a runner command for a specific agent by applying config overrides
 * to the base runner. Replaces existing flags or appends new ones.
 * If agentName is provided, also injects --agent <name>.
 */
export function buildRunnerForAgent(
  baseRunner: string,
  agentDef?: AgentDefinition,
  agentName?: string,
): string {
  let runner = baseRunner;

  if (agentDef?.model) {
    runner = replaceOrAppendFlag(runner, '--model', agentDef.model);
  }
  if (agentDef?.thinking_budget) {
    runner = replaceOrAppendFlag(runner, '--thinking-budget', agentDef.thinking_budget);
  }
  if (agentDef?.reasoning_effort) {
    runner = replaceOrAppendFlag(runner, '--reasoning-effort', agentDef.reasoning_effort);
  }
  if (agentName) {
    runner = replaceOrAppendFlag(runner, '--agent', agentName);
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
