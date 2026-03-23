# Plan: Allow to manage agent -> citizen mapping

> Issue: #13
> Date: 2026-03-23
> Status: draft

## Overview

Currently the mapping from agents to citizens (display name, color) is hardcoded across three places: `world-config.ts` (ROLE_COLORS), `start.ts` (paneColors), and `frontend.ts` (CSS). This plan introduces a single config file `.claude/nightshift/ns-{team}-citizens.json` that serves as the source of truth for all citizen properties, with sensible defaults matching current behavior. The existing `copyExtensionFiles` infrastructure is reused to copy the default config during `init`.

## Requirements

- Default agent-to-citizen mapping that matches current behavior out of the box
- User-editable config file for customizing display names and colors per agent role
- Config reused across all UI layers (miniverse world, tmux panes, frontend status panel)
- Backward compatible: missing config file falls back to current defaults

## Architecture Changes

- **New file**: `presets/dev/defaults/ns-dev-citizens.json` — default config preset
- **New file**: `lib/citizen-config.ts` — config loader with validation and default merging
- **Modified**: `lib/types.ts` — add `CitizenOverride` and `CitizenOverrides` types
- **Modified**: `lib/world-config.ts` — accept overrides in `generateWorldConfig()`
- **Modified**: `lib/copy.ts` — extend `copyExtensionFiles()` to also copy `.json` files
- **Modified**: `lib/start.ts` — load citizen config, pass to world config, use for tmux pane colors
- **Modified**: `lib/visualize.ts` — pass display names in `registerAgents()`
- **Modified**: `lib/miniverse/server/frontend.ts` — use dynamic colors from agent state instead of hardcoded CSS
- **New file**: `tests/citizen-config.test.ts` — tests for config loading and merging
- **Modified**: `tests/visualize.test.ts` — update to cover overrides parameter
- **Modified**: `tests/copy.test.ts` — update to verify `.json` file copying

## Implementation Steps

### Phase 1: Config Infrastructure

1. **Add types** (`lib/types.ts`)
   - Action: Add `CitizenOverride` interface with optional `displayName` and `color` fields. Add `CitizenOverrides` type as `Record<string, CitizenOverride>` keyed by role name (e.g., `"producer"`, `"coder-1"`).
   - Why: Typed interface for the config file schema, used by both the loader and consumer.
   - Dependencies: none

2. **Create default config preset** (`presets/dev/defaults/ns-dev-citizens.json`)
   - Action: Create JSON file with the current default mapping:
     ```json
     {
       "producer": { "displayName": "producer", "color": "#00cccc" },
       "planner":  { "displayName": "planner",  "color": "#cccc00" },
       "reviewer": { "displayName": "reviewer", "color": "#cc00cc" },
       "coder":    { "displayName": null,        "color": "#0066cc" },
       "tester":   { "displayName": "tester",    "color": "#00cc00" }
     }
     ```
     The `"coder"` key acts as a wildcard for all coder-N roles. A `displayName` of `null` means "use the role name" (e.g., `coder-1`). Users can also specify `"coder-1"`, `"coder-2"` etc. for per-coder overrides — explicit keys take precedence over the `"coder"` wildcard.
   - Why: Ships sensible defaults that match current behavior. Users edit this file to customize.
   - Dependencies: none

3. **Add config loader** (`lib/citizen-config.ts`)
   - Action: Create module with two exports:
     - `loadCitizenConfig(repoRoot: string, team: string): CitizenOverrides` — reads `.claude/nightshift/ns-{team}-citizens.json`, parses JSON, returns the overrides. Returns empty object `{}` if file doesn't exist (graceful fallback).
     - `resolveCitizenProps(role: string, overrides: CitizenOverrides): { displayName: string; color: string }` — given a role and overrides, returns the resolved displayName and color. Resolution order: (1) exact role match in overrides (e.g., `"coder-1"`), (2) base role match for coders (`"coder"` wildcard), (3) built-in defaults (`ROLE_COLORS` / role name). This function centralizes the merge logic so `world-config.ts` and `start.ts` don't duplicate it.
   - Why: Single point of config loading. Graceful fallback means existing installations without the config file continue to work unchanged.
   - Dependencies: step 1 (types)

4. **Update `generateWorldConfig()`** (`lib/world-config.ts`)
   - Action: Add optional `overrides?: CitizenOverrides` parameter. Import and call `resolveCitizenProps()` from `citizen-config.ts` to get displayName and color for each citizen, instead of using the hardcoded `ROLE_COLORS` map directly. Move `ROLE_COLORS` and `CODER_COLOR` to `citizen-config.ts` as the built-in defaults used by `resolveCitizenProps()`.
   - Why: Makes the world config generation respect user overrides while keeping backward compatibility (no overrides = current defaults).
   - Dependencies: step 3

5. **Extend `copyExtensionFiles()`** (`lib/copy.ts`)
   - Action: Change the file filter on line 110 from `f.endsWith('.md')` to `f.endsWith('.md') || f.endsWith('.json')`. Also update `removeExtensionFiles()` similarly (line 182) to clean up JSON files on reset.
   - Why: Reuses the existing copy infrastructure instead of adding a separate copy path. The `.json` extension is sufficient to distinguish config files from markdown docs.
   - Dependencies: step 2 (preset file must exist)

6. **Load config in `start.ts`**
   - Action: Import `loadCitizenConfig` and `resolveCitizenProps`. After detecting the repo root, call `loadCitizenConfig(repoRoot, team)`. Pass the result to `generateWorldConfig(agents, team, overrides)`. Also use `resolveCitizenProps()` to set tmux pane border colors from the config instead of the hardcoded `paneColors` map — convert hex color to the nearest tmux `colour` number using a simple lookup (the 16 basic ANSI colors cover the default palette well; for custom colors, use tmux's `#rrggbb` hex support which works in tmux 2.6+).
   - Why: Connects the config file to the two main consumer paths (miniverse world + tmux panes).
   - Dependencies: steps 3, 4

7. **Pass display names in `registerAgents()`** (`lib/visualize.ts`)
   - Action: Update function signature to accept `overrides?: CitizenOverrides`. When building the heartbeat payload (line 108-113), set `name` to the resolved displayName from overrides instead of `agent.role`. Update the call site in `start.ts` to pass overrides.
   - Why: Ensures the miniverse server shows the user-configured name in agent state, which propagates to WebSocket clients and the frontend.
   - Dependencies: step 3

### Phase 2: Frontend Dynamic Colors

8. **Make frontend status panel use dynamic colors** (`lib/miniverse/server/frontend.ts`)
   - Action: Remove the hardcoded `.agent-card[data-role="..."]` CSS color rules (lines 81-90). Instead, when `renderCard()` creates a card element, set `border-left-color` and `.name` color from `agent.color` (which comes via the heartbeat/WebSocket state). Add a fallback to `#8b949e` if no color is present.
   - Why: Without this, changing colors in the config has no effect on the browser UI. The agent color is already available in the heartbeat payload via `AgentState.color`.
   - Dependencies: step 7 (color must flow through heartbeat)

9. **Pass color in heartbeat** (`lib/visualize.ts` and `lib/miniverse/server/server.ts`)
   - Action: In `registerAgents()`, include `color` in the heartbeat payload, resolved from `resolveCitizenProps()`. The server already stores and broadcasts `color` in `AgentState` — no server changes needed. In the Claude Code hook handler (`handleClaudeCodeHook`), preserve existing color when updating state (already handled by `AgentStore.heartbeat()` which keeps existing values).
   - Why: Color must reach the frontend via WebSocket for dynamic styling to work.
   - Dependencies: step 3

### Phase 3: Tests and Validation

10. **Add citizen-config tests** (`tests/citizen-config.test.ts`)
    - Action: Test the following scenarios:
      - `loadCitizenConfig` returns empty object when file doesn't exist
      - `loadCitizenConfig` returns parsed overrides from valid JSON
      - `loadCitizenConfig` returns empty object on malformed JSON (graceful)
      - `resolveCitizenProps` returns exact override when present
      - `resolveCitizenProps` uses `"coder"` wildcard for `coder-N` roles
      - `resolveCitizenProps` falls back to built-in defaults when no override
      - `resolveCitizenProps` handles partial overrides (only displayName, only color)
    - Why: Core logic needs thorough coverage, especially the fallback chain.
    - Dependencies: step 3

11. **Update `visualize.test.ts`**
    - Action: Add test cases for `generateWorldConfig` with overrides parameter:
      - Citizen displayName uses override when provided
      - Citizen color uses override when provided
      - Without overrides, behavior matches existing tests (backward compat)
    - Why: Ensures the integration point between config and world generation works.
    - Dependencies: step 4

12. **Update `copy.test.ts`**
    - Action: Update `copyExtensionFiles` tests to verify that `.json` files are also copied from presets. Add a test that creates a `.json` file in the mock defaults dir and confirms it gets copied to the target.
    - Why: Verifies the file filter change doesn't break existing behavior and handles JSON files.
    - Dependencies: step 5

## Testing Strategy

- Unit tests: `citizen-config.test.ts` covers loader and resolver independently
- Integration tests: `visualize.test.ts` covers `generateWorldConfig` with overrides; `copy.test.ts` covers file copying
- Manual verification: Run `npx nightshift init --team dev --yes`, confirm `ns-dev-citizens.json` appears in `.claude/nightshift/`, edit a displayName/color, run `npx nightshift start --team dev`, verify tmux pane labels and miniverse UI reflect changes

## Assumptions

- **tmux hex color support**: Assuming tmux 2.6+ which supports `#rrggbb` hex colors in styles. This avoids complex color conversion and keeps the config format simple. If older tmux is needed, a mapping from hex to the 256-color palette can be added later.
- **`"coder"` wildcard**: A `"coder"` key without a number suffix applies to all coder-N agents. Explicit `"coder-1"` overrides take precedence. This keeps the config concise for the common case where all coders share the same color.
- **No sprite customization yet**: The config only covers `displayName` and `color`. Sprite/avatar customization would require additional miniverse core changes and is out of scope.
- **Config file is optional**: Installations without the file continue to work with built-in defaults. The config is generated during `init` but can be deleted without breaking anything.

## Risks & Mitigations

- **Risk**: Users edit JSON with invalid syntax → parsing fails silently, defaults used
  - Mitigation: `loadCitizenConfig` logs a warning to stderr when JSON is malformed, so the user gets feedback. The system continues to work with defaults rather than crashing.

- **Risk**: Frontend removes CSS rules but agent state doesn't include color → cards have no color styling
  - Mitigation: Phase 2 step 9 ensures color flows through heartbeat registration. The frontend fallback color (`#8b949e`) provides a reasonable default even if color is missing.

- **Risk**: `copyExtensionFiles` filter change (`||  f.endsWith('.json')`) might copy unwanted JSON files if someone adds other JSON to presets/defaults
  - Mitigation: The preset defaults directory is nightshift-managed; only expected files exist there. The `ns-{team}-` prefix convention provides additional namespacing.
