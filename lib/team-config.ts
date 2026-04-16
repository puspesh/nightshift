import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type { Label } from './labels.js';

// --- Types ---

export interface TeamConfig {
  name: string;
  description: string;
  stages: StageConfig[];
  agents: Record<string, AgentDefinition>;
}

export interface StageConfig {
  name: string;
  color: string;
  meta?: boolean;
}

export interface AgentDefinition {
  description: string;
  watches: string[];
  transitions: Record<string, string>;
  tools: string[];
  model: string;
  worktree?: boolean;
  scalable?: boolean;
  instances?: number;
  max_instances?: number;
  thinking_budget?: string;
  reasoning_effort?: string;
}

export interface ExpandedAgent {
  role: string;
  agent: string;         // full name: ns-<team>-<role>[-N]
  definition: AgentDefinition;
  instanceNumber?: number;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// --- Parsing ---

/**
 * Parse a team.yaml file from disk.
 */
export function parseTeamConfig(yamlPath: string): TeamConfig {
  const content = readFileSync(yamlPath, 'utf-8');
  return parseTeamConfigFromString(content);
}

/**
 * Parse team config from a YAML string.
 */
export function parseTeamConfigFromString(yamlContent: string): TeamConfig {
  const raw = parseYaml(yamlContent);
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid team.yaml: expected an object');
  }
  return raw as TeamConfig;
}

// --- Validation ---

/**
 * Validate a parsed TeamConfig against all rules.
 */
export function validateTeamConfig(config: TeamConfig): ValidationResult {
  const errors: ValidationError[] = [];

  // Team name format
  if (!config.name || !/^[a-z][a-z0-9-]*[a-z0-9]$/.test(config.name)) {
    // Allow single-char names like "a" (edge case)
    if (!config.name || (config.name.length > 1 && !/^[a-z][a-z0-9-]*[a-z0-9]$/.test(config.name)) ||
        (config.name.length === 1 && !/^[a-z]$/.test(config.name))) {
      errors.push({ field: 'name', message: `Invalid team name "${config.name}". Must start with a lowercase letter, contain only lowercase letters, digits, and hyphens, and end with a letter or digit.` });
    }
  }

  if (!config.description) {
    errors.push({ field: 'description', message: 'Team description is required.' });
  }

  // Stages
  if (!config.stages || !Array.isArray(config.stages) || config.stages.length === 0) {
    errors.push({ field: 'stages', message: 'At least one stage is required.' });
  }

  const stageNames = new Set<string>();
  if (config.stages) {
    for (const stage of config.stages) {
      if (stageNames.has(stage.name)) {
        errors.push({ field: 'stages', message: `Duplicate stage name: "${stage.name}"` });
      }
      stageNames.add(stage.name);
    }

    // wip meta stage must exist
    const hasWip = config.stages.some(s => s.name === 'wip' && s.meta === true);
    if (!hasWip) {
      errors.push({ field: 'stages', message: 'Meta stage "wip" is required (must have meta: true).' });
    }
  }

  // Agents
  if (!config.agents || typeof config.agents !== 'object' || Object.keys(config.agents).length === 0) {
    errors.push({ field: 'agents', message: 'At least one agent is required.' });
  }

  if (config.agents) {
    for (const [name, agent] of Object.entries(config.agents)) {
      // Validate watches
      if (agent.watches) {
        for (const watch of agent.watches) {
          if (watch !== 'unlabeled' && !stageNames.has(watch)) {
            errors.push({ field: `agents.${name}.watches`, message: `Watch "${watch}" references undefined stage.` });
          }
        }
      }

      // Validate transitions
      if (agent.transitions) {
        for (const [transName, target] of Object.entries(agent.transitions)) {
          if (!stageNames.has(target)) {
            errors.push({ field: `agents.${name}.transitions.${transName}`, message: `Transition "${transName}" targets undefined stage "${target}".` });
          }
        }
      }

      // Validate scalable constraints
      if (agent.scalable) {
        const instances = agent.instances ?? 1;
        const maxInstances = agent.max_instances ?? 4;
        if (instances > maxInstances) {
          errors.push({ field: `agents.${name}.instances`, message: `instances (${instances}) exceeds max_instances (${maxInstances}).` });
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// --- Helpers ---

/**
 * Extract label definitions from stages.
 */
export function getLabelsFromConfig(config: TeamConfig): Label[] {
  return config.stages.map(stage => ({
    status: stage.name,
    color: stage.color,
    description: stage.meta
      ? `${stage.name} (meta signal)`
      : `Issue is in ${stage.name} stage`,
  }));
}

/**
 * Get ordered list of agent role names (insertion order from YAML).
 */
export function getAgentRoles(config: TeamConfig): string[] {
  return Object.keys(config.agents);
}

/**
 * Get role names of agents with scalable: true.
 */
export function getScalableAgents(config: TeamConfig): string[] {
  return Object.entries(config.agents)
    .filter(([, def]) => def.scalable === true)
    .map(([name]) => name);
}

/**
 * Expand scalable agents to N instances.
 * Returns all agents in order, with scalable agents expanded.
 *
 * @param overrides - optional map of role → instance count overrides (e.g., from --coders flag)
 */
export function expandAgentInstances(
  config: TeamConfig,
  overrides?: Record<string, number>,
): ExpandedAgent[] {
  const expanded: ExpandedAgent[] = [];

  for (const [role, definition] of Object.entries(config.agents)) {
    if (definition.scalable) {
      const overrideCount = overrides?.[role];
      const count = overrideCount ?? definition.instances ?? 1;
      const max = definition.max_instances ?? 4;

      if (count > max) {
        throw new Error(`Cannot expand ${role}: requested ${count} instances but max_instances is ${max}.`);
      }

      for (let i = 1; i <= count; i++) {
        expanded.push({
          role: `${role}-${i}`,
          agent: `ns-${config.name}-${role}-${i}`,
          definition,
          instanceNumber: i,
        });
      }
    } else {
      expanded.push({
        role,
        agent: `ns-${config.name}-${role}`,
        definition,
      });
    }
  }

  return expanded;
}
