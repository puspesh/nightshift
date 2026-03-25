# Plan: Manage model, effort, thinking configuration for each agent

> Issue: #26
> Date: 2026-03-26
> Status: draft

## Overview

Add a per-agent configuration file (`ns-<team>-agents.json`) that lets users set model, thinking budget, and effort level independently for each agent role. The configuration is read at `nightshift start` time and applied by constructing per-agent runner commands with the appropriate CLI flags. This replaces the current single-runner-for-all-agents approach while remaining backward compatible.

## Requirements

- R1: Users can configure model, effort, and thinking budget per agent
- R2: Configuration lives in an editable file (not baked into agent profiles)
- R3: Changes take effect when agents are started (or restarted)
- R4: Backward compatible -- existing setups without the config file work unchanged
- R5: Coder variants (coder-1, coder-2, etc.) can share a base `coder` config with optional per-instance overrides

## Current State Analysis

### Runner system
- **Global runner**: Parsed from `.claude/nightshift/repo.md` `## Runner` section
- **Default**: `claude --dangerously-skip-permissions`
- **Applied identically** to all agents via `tmux send-keys` (start.ts:232-235)
- **No per-agent customization** of model, effort, or thinking

### Agent profile frontmatter
- Each agent profile has `model: sonnet|opus` in YAML frontmatter
- This is **informational/documentation only** -- Claude Code's agent system uses it to determine model
- Current defaults: producer=sonnet, planner=opus, reviewer=opus, coder=opus, tester=sonnet

### Existing per-agent config pattern
- `ns-<team>-citizens.json` provides per-role visual overrides (displayName, color)
- Uses exact-match and wildcard (`coder` matches all `coder-N`) resolution
- Loaded via `loadCitizenConfig()` in `citizen-config.ts`

### Claude Code CLI flags
- `--model <name>` -- select model (sonnet, opus, haiku)
- `--thinking-budget <tokens>` -- set thinking token budget (e.g., `10000`, `high`)
- `--reasoning-effort <level>` -- set effort level (e.g., `low`, `medium`, `high`)

## Architecture Changes

### New files

| File | Purpose |
|------|---------|
| `presets/dev/defaults/ns-dev-agents.json` | Default per-agent configuration template |
| `lib/agent-config.ts` | Module to load and resolve per-agent configuration |
| `tests/agent-config.test.ts` | Unit tests for agent config loading and resolution |

### Modified files

| File | Change |
|------|--------|
| `lib/start.ts` | Build per-agent runner commands using config; pass role-specific runner to each tmux pane |
| `lib/types.ts` | Add `AgentConfig` and `AgentConfigs` types |
| `lib/copy.ts` | Include `ns-<team>-agents.json` in extension file copying |
| `lib/init.ts` | No code changes needed -- `copyExtensionFiles()` already copies all `.json` files from defaults |
| `docs/customization.md` | Document the new config file and available options |

## Implementation Steps

### Phase 1: Config file and types

1. **Add types** (`lib/types.ts`)
   - Action: Add configuration types:
     ```typescript
     export interface AgentModelConfig {
       model?: string;          // e.g., 'sonnet', 'opus', 'haiku'
       thinkingBudget?: string; // e.g., '10000', 'high'
       reasoningEffort?: string; // e.g., 'low', 'medium', 'high'
     }

     export type AgentConfigs = Record<string, AgentModelConfig>;
     ```
   - `AgentModelConfig` uses all optional fields -- omitted fields inherit from the global runner.
   - Keys in `AgentConfigs` are role names (`producer`, `planner`, `coder`, `coder-1`, etc.).
   - Why: Clean typing for the config resolution pipeline.
   - Dependencies: none

2. **Create default config template** (`presets/dev/defaults/ns-dev-agents.json`)
   - Action: Create a well-commented JSON config file:
     ```json
     {
       "_comment": "Per-agent model and reasoning configuration. Edit anytime; takes effect on next 'nightshift start'.",
       "producer": {
         "model": "sonnet"
       },
       "planner": {
         "model": "opus"
       },
       "reviewer": {
         "model": "opus"
       },
       "coder": {
         "model": "opus"
       },
       "tester": {
         "model": "sonnet"
       }
     }
     ```
   - This ships with sensible defaults matching the current agent profile frontmatter.
   - Users can add `thinkingBudget` and `reasoningEffort` per role as needed.
   - The `coder` key applies to all coder-N variants (wildcard resolution, same as citizens.json).
   - Why: Provides a discoverable starting point. JSON is consistent with `ns-dev-citizens.json`.
   - Dependencies: none

3. **Create agent config loader** (`lib/agent-config.ts`)
   - Action: Create a module following the same pattern as `citizen-config.ts`:
     ```typescript
     import { existsSync, readFileSync } from 'node:fs';
     import { join } from 'node:path';
     import type { AgentModelConfig, AgentConfigs } from './types.js';

     /**
      * Load agent model config from .claude/nightshift/ns-<team>-agents.json.
      * Returns empty object if file doesn't exist.
      */
     export function loadAgentConfig(repoRoot: string, team: string): AgentConfigs {
       const configPath = join(repoRoot, '.claude', 'nightshift', `ns-${team}-agents.json`);
       if (!existsSync(configPath)) return {};
       try {
         const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
         // Strip _comment keys
         const result: AgentConfigs = {};
         for (const [key, val] of Object.entries(raw)) {
           if (!key.startsWith('_') && typeof val === 'object' && val !== null) {
             result[key] = val as AgentModelConfig;
           }
         }
         return result;
       } catch {
         console.warn(`Warning: Could not parse agent config, using defaults`);
         return {};
       }
     }

     /**
      * Resolve model config for a specific role.
      * Resolution order:
      *   1. Exact role match (e.g., "coder-1")
      *   2. Base role wildcard (e.g., "coder" for any "coder-N")
      *   3. Empty config (inherit everything from global runner)
      */
     export function resolveAgentConfig(
       role: string,
       configs: AgentConfigs,
     ): AgentModelConfig {
       // Exact match
       if (configs[role]) return configs[role];
       // Wildcard for coder-N
       if (role.startsWith('coder-') && configs['coder']) return configs['coder'];
       // No config -- use global defaults
       return {};
     }

     /**
      * Build a runner command string for a specific agent by applying
      * agent-specific overrides to the base runner command.
      *
      * Example: base = "claude --dangerously-skip-permissions"
      *          config = { model: "opus", thinkingBudget: "high" }
      *          result = "claude --dangerously-skip-permissions --model opus --thinking-budget high"
      *
      * If the base runner already contains a flag that the config overrides,
      * the config value takes precedence (the base flag is replaced).
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

     /**
      * Replace an existing flag value or append the flag.
      */
     function replaceOrAppendFlag(cmd: string, flag: string, value: string): string {
       const regex = new RegExp(`${flag}\\s+\\S+`);
       if (regex.test(cmd)) {
         return cmd.replace(regex, `${flag} ${value}`);
       }
       return `${cmd} ${flag} ${value}`;
     }
     ```
   - Why: Clean separation of concerns. The loader handles file I/O and validation, the resolver handles the wildcard logic, and the builder handles CLI flag composition.
   - Dependencies: step 1

### Phase 2: Integration with start flow

4. **Update `startSession()` to use per-agent runners** (`lib/start.ts`)
   - Action: Modify the runner injection loop to build per-agent commands:
     ```typescript
     import { loadAgentConfig, resolveAgentConfig, buildRunnerForAgent } from './agent-config.js';

     // In startSession(), after parsing the base runner:
     const baseRunner = parseRunner(repoRoot);
     const agentConfigs = loadAgentConfig(repoRoot, team);

     // ... existing viz setup ...

     // Launch runner in each pane (MODIFIED)
     for (let i = 0; i < allPanes.length; i++) {
       const config = resolveAgentConfig(allPanes[i].role, agentConfigs);
       const runner = buildRunnerForAgent(baseRunner, config);
       tmux(`send-keys -t "${session}:0.${i}" '${runner}' Enter`);
     }
     ```
   - The base runner from `repo.md` is still the foundation. Agent-specific configs add or override flags.
   - If no `ns-<team>-agents.json` exists, `loadAgentConfig()` returns `{}` and all agents get the base runner -- fully backward compatible.
   - Why: Minimal change to the existing flow. One line changes per agent instead of one line for all.
   - Dependencies: step 3

5. **Update pane labels to show model** (`lib/start.ts`)
   - Action: Enhance the pane border label to include the model name when configured:
     ```typescript
     for (let i = 0; i < allPanes.length; i++) {
       const a = allPanes[i];
       const config = resolveAgentConfig(a.role, agentConfigs);
       const modelSuffix = config.model ? ` [${config.model}]` : '';
       const resolved = resolveCitizenProps(a.role, citizenOverrides);
       const color = hexToTmuxStyle(resolved.color);
       const statusFile = join(statusDir, a.role);
       tmux(`set-option -p -t "${session}:0.${i}" @agent_label "${a.role}${modelSuffix}  ·  /loop 15m @${a.agent}"`);
       // ... rest unchanged ...
     }
     ```
   - Pane border shows: `planner [opus]  ·  /loop 15m @ns-dev-planner`
   - Why: Visual feedback that per-agent config is active. Helps users verify their configuration.
   - Dependencies: step 4

6. **Print agent config in startup summary** (`lib/start.ts`)
   - Action: Update the startup info block to show per-agent models:
     ```typescript
     console.log(chalk.bold('  Agents:'));
     for (const a of agents) {
       const config = resolveAgentConfig(a.role, agentConfigs);
       const model = config.model ? chalk.dim(` (${config.model})`) : '';
       console.log(`    ${a.role.padEnd(10)} → @${a.agent}${model}`);
     }
     ```
   - Why: Users see the resolved config at startup.
   - Dependencies: step 4

### Phase 3: Testing

7. **Add unit tests** (`tests/agent-config.test.ts`)
   - Action: Test the full config pipeline:
     - `loadAgentConfig` returns empty object when file doesn't exist
     - `loadAgentConfig` parses valid JSON and strips `_comment` keys
     - `loadAgentConfig` returns empty object on invalid JSON
     - `resolveAgentConfig` returns exact match for `coder-1` when present
     - `resolveAgentConfig` falls back to `coder` wildcard for `coder-2`
     - `resolveAgentConfig` returns empty config for unknown roles
     - `buildRunnerForAgent` appends `--model` flag
     - `buildRunnerForAgent` appends `--thinking-budget` flag
     - `buildRunnerForAgent` appends `--reasoning-effort` flag
     - `buildRunnerForAgent` replaces existing `--model` flag in base runner
     - `buildRunnerForAgent` with empty config returns base runner unchanged
     - `buildRunnerForAgent` handles multiple flags simultaneously
   - Why: The flag composition logic is the most error-prone part -- thorough tests prevent broken runner commands.
   - Dependencies: step 3

### Phase 4: Documentation

8. **Update customization guide** (`docs/customization.md`)
   - Action: Replace the "Adjusting Agent Models" section with detailed documentation:
     ```markdown
     ## Per-Agent Model and Reasoning Configuration

     Edit `.claude/nightshift/ns-<team>-agents.json` to configure each agent's
     model, thinking budget, and reasoning effort independently:

     ```json
     {
       "producer": { "model": "sonnet" },
       "planner": { "model": "opus", "thinkingBudget": "high" },
       "reviewer": { "model": "opus", "reasoningEffort": "high" },
       "coder": { "model": "opus", "thinkingBudget": "10000" },
       "tester": { "model": "sonnet", "reasoningEffort": "low" }
     }
     ```

     ### Available options

     | Field | Values | Description |
     |-------|--------|-------------|
     | `model` | `sonnet`, `opus`, `haiku` | Claude model to use |
     | `thinkingBudget` | `low`, `medium`, `high`, or a number | Thinking token budget |
     | `reasoningEffort` | `low`, `medium`, `high` | Reasoning effort level |

     ### Resolution order

     1. Exact role match (e.g., `"coder-1"` overrides `"coder"`)
     2. Base role wildcard (`"coder"` applies to all coder-N agents)
     3. Global runner from `repo.md` (base command)

     ### When changes take effect

     Changes to this file take effect the next time you run `nightshift start`.
     You do not need to re-run `nightshift init`.
     ```
   - Why: Issue requirement -- "capture this in documentation clearly."
   - Dependencies: step 2

## Testing Strategy

- **Unit tests** (`tests/agent-config.test.ts`): Config loading, wildcard resolution, flag building, flag replacement
- **Integration test** (manual):
  1. Edit `.claude/nightshift/ns-dev-agents.json` to set `planner.model: "sonnet"`
  2. Run `npx nightshift start --team dev`
  3. Verify: planner's pane border shows `[sonnet]`
  4. Verify: planner's tmux pane received `claude --dangerously-skip-permissions --model sonnet`
  5. Verify: other agents received their configured models
  6. Add `thinkingBudget` and verify the flag appears in the runner command
- **Backward compatibility**: Remove the `ns-dev-agents.json` file, run `nightshift start`, verify all agents use the base runner from `repo.md`
- **Regression**: `npm run test` passes

## Assumptions

- **Claude Code supports `--model`, `--thinking-budget`, `--reasoning-effort` flags**: These are standard Claude Code CLI flags. The exact flag names should be verified against the Claude Code documentation before implementation. If flag names differ (e.g., `--budget` instead of `--thinking-budget`), the `buildRunnerForAgent` function is the only place that needs updating.

- **Agent profile frontmatter `model:` is handled by Claude Code itself**: The `model: opus` in agent profile YAML is read by Claude Code's agent system. This means the per-agent config file may be redundant for model selection if Claude Code already respects the frontmatter. However, the config file provides a single, editable location for all agent settings (model + thinking + effort) and overrides the frontmatter if both are set. The coder should verify whether Claude Code's `--model` flag takes precedence over the agent profile's `model:` frontmatter.

- **JSON format is preferred over YAML/TOML**: Following the precedent of `ns-dev-citizens.json`, the agent config uses JSON. JSON doesn't support comments natively, so we use a `_comment` key convention (stripped during parsing).

- **No hot-reload needed**: The issue says "comes into effect when agents are started." A restart is required. No file-watching or runtime reconfiguration.

## Risks & Mitigations

- **Risk**: Flag name mismatch -- the exact Claude Code CLI flags for thinking/effort may differ
  - Mitigation: `buildRunnerForAgent` constructs flags by name. If a flag is wrong, only the string constant needs updating. Tests cover flag construction independently.

- **Risk**: Conflict between agent profile `model:` frontmatter and `--model` CLI flag
  - Mitigation: Document the precedence order. CLI flags typically override profile settings. If users set model in both places, the CLI flag wins. The config file is the single source of truth for nightshift-managed settings.

- **Risk**: Users may not discover the config file exists
  - Mitigation: `nightshift init` copies the template with sensible defaults. The `start` command prints the resolved model per agent. The customization guide documents it.
