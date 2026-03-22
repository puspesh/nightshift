# Plan: Add a Visual Representation of Agents Working

> Issue: #5
> Date: 2026-03-22
> Status: draft

## Overview

Integrate the [miniverse](https://github.com/ianscott313/miniverse) visual engine into nightshift so that when a team starts, a local web server launches alongside the tmux session. Opening the server URL in a browser shows nightshift agents as named pixel-art citizens roaming a "gear-supply" world, each assigned to a workstation. A status panel below the canvas displays each agent's name and real-time status. Claude Code hooks fire heartbeat requests on agent lifecycle events, keeping the visualization in sync.

## Requirements

- R1: Use the gear-supply world theme from miniverse
- R2: Create one workstation per agent at init time (count matches `--coders` flag + 4 fixed roles)
- R3: Fix miniverse spawning bugs (citizens must appear reliably)
- R4: Add a status panel below the canvas showing each agent's name and current status (Sleeping, Working, Thinking, etc.)
- R5: Display clear agent names on each citizen sprite in the canvas
- R6: Update init script to install Claude Code hooks that send heartbeat requests to the miniverse server
- R7: Code must be clean, readable, maintainable, matching existing TypeScript conventions
- R8: Must work out of the box for open-source consumers

## Architecture Changes

### New files

| File | Purpose |
|------|---------|
| `lib/visualize.ts` | Miniverse server lifecycle: start, stop, health check, world configuration |
| `lib/hooks.ts` | Claude Code hook generation and installation for heartbeat integration |
| `lib/world-config.ts` | Generate world configuration from team agent list (workstation placement, citizen mapping) |
| `tests/visualize.test.ts` | Unit tests for server lifecycle and world config |
| `tests/hooks.test.ts` | Unit tests for hook generation |
| `worlds/nightshift/world.json` | Nightshift-branded gear-supply world definition (canvas size, tile size, scale, default scene) |
| `worlds/nightshift/scenes/office.json` | Office scene with dynamic workstation anchor layout |
| `worlds/nightshift/citizens/` | Citizen sprite configurations for each agent role |

### Modified files

| File | Change |
|------|--------|
| `package.json` | Add `@miniverse/server` dependency, add `visualize` script |
| `lib/init.ts` | Call `installHooks()` after worktree creation; generate world config with correct workstation count |
| `lib/start.ts` | Start miniverse server before tmux session; print server URL; pass agent list to world config |
| `lib/start.ts` | `stopSession()` — also kill miniverse server process |
| `lib/teardown.ts` | Remove hooks and world config during teardown |
| `lib/worktrees.ts` | Export `getTeamDir` (already exported) — no changes needed |
| `presets/dev/agents/*.md` | No changes — hooks handle heartbeats externally via Claude Code settings |

### Architecture diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (localhost:4321)              │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Canvas (gear-supply world)            │  │
│  │   [producer]  [planner]  [reviewer]  [coder-1]    │  │
│  │     named citizens roaming + working at desks     │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Status Panel (HTML below canvas)      │  │
│  │  producer: Working · planner: Sleeping · ...      │  │
│  └───────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────┘
                           │ WebSocket + REST
                           ▼
              ┌────────────────────────┐
              │   Miniverse Server     │
              │   (localhost:4321)     │
              │   - AgentStore         │
              │   - World: gear-supply │
              │   - Heartbeat API      │
              └────────────┬───────────┘
                           ▲
                           │ HTTP POST /api/heartbeat
              ┌────────────┴───────────┐
              │  Claude Code Hooks     │
              │  (per-worktree)        │
              │  on tool_use → working │
              │  on idle → sleeping    │
              └────────────────────────┘
```

## Implementation Steps

### Phase 1: Core Server Integration (Minimum Viable)

This phase delivers a working miniverse server that starts and stops with the nightshift session. Agents appear as citizens but without heartbeat integration yet.

1. **Add miniverse dependency** (`package.json`)
   - Action: Add `"@miniverse/server": "^0.x"` to `dependencies` (use latest stable version)
   - Why: The server package provides the Canvas renderer, world engine, WebSocket server, and REST API. Using it as a dependency (not vendored) keeps nightshift's codebase focused on orchestration.
   - Dependencies: none

2. **Create world configuration module** (`lib/world-config.ts`)
   - Action: Create a module that generates a miniverse world configuration from the nightshift agent list. The module should:
     - Accept an array of `AgentEntry` (from `buildAgentList` in `start.ts`)
     - Generate `world.json` with gear-supply theme settings (canvas: 512x384, tile: 32px, scale: 2x)
     - Generate scene configuration with workstation anchors — one per agent, placed in a grid layout
     - Map each agent to a citizen with: unique ID (e.g., `ns-{team}-{role}`), display name (e.g., `producer`, `planner`), assigned workstation anchor
     - Export: `generateWorldConfig(agents: AgentEntry[], team: string): WorldConfig`
     - Export: `writeWorldConfig(config: WorldConfig, outputDir: string): void`
   - Why: World config must be dynamic — the number of workstations depends on `--coders` flag (1-4 coders + 4 fixed roles = 5-8 agents total)
   - Dependencies: none

3. **Create server lifecycle module** (`lib/visualize.ts`)
   - Action: Create a module that manages the miniverse server process:
     - `startServer(port: number, worldDir: string, agents: AgentEntry[]): { pid: number; url: string }` — starts the miniverse server as a detached child process, writes PID to `~/.nightshift/{repo}/{team}/miniverse.pid`, returns URL
     - `stopServer(repoName: string, team: string): void` — reads PID file, kills process, removes PID file
     - `isServerRunning(repoName: string, team: string): boolean` — checks if PID is still alive
     - `registerAgents(url: string, agents: AgentEntry[]): void` — sends initial heartbeat for each agent so they appear immediately as citizens (avoids the "no one shows up until first heartbeat" problem)
     - Server should log to `~/.nightshift/{repo}/{team}/miniverse.log`
   - Why: Server must outlive the `start` command (user detaches tmux) but die with `stop`
   - Dependencies: step 1

4. **Update start flow** (`lib/start.ts`)
   - Action:
     - Import `startServer`, `registerAgents` from `./visualize.js`
     - Import `generateWorldConfig`, `writeWorldConfig` from `./world-config.js`
     - In `startSession()`, before creating the tmux session:
       1. Generate world config from agent list
       2. Write world config to `~/.nightshift/{repo}/{team}/world/`
       3. Start the miniverse server on port 4321 (configurable via `--port` flag)
       4. Register all agents with initial "idle" status
     - After printing agent list, print the miniverse URL: `Visualization: http://localhost:4321`
     - In `stopSession()`, call `stopServer()` before killing the tmux session
   - Why: Server must be running before agents start so heartbeats have somewhere to go
   - Dependencies: steps 2, 3

5. **Update stop flow** (`lib/start.ts`)
   - Action: In `stopSession()`, add `stopServer(repoName, team)` call before `tmux kill-session`
   - Why: Clean shutdown — server process must not leak
   - Dependencies: step 3

6. **Add basic tests** (`tests/visualize.test.ts`)
   - Action: Test world config generation:
     - Given 5 agents (producer, planner, reviewer, coder-1, tester), verify config has 5 workstation anchors
     - Given 8 agents (4 coders), verify 8 workstations
     - Verify citizen names match agent roles
     - Verify PID file write/read/cleanup
   - Why: Core logic must be tested; server lifecycle tests use mocked child_process
   - Dependencies: steps 2, 3

### Phase 2: Heartbeat Integration via Claude Code Hooks

This phase connects the running agents to the miniverse server so citizens animate based on real agent activity.

7. **Create hooks module** (`lib/hooks.ts`)
   - Action: Create a module that generates and installs Claude Code hooks for heartbeat integration:
     - `generateHookConfig(agentName: string, serverUrl: string): HookConfig` — generates the settings.json hook entries for a single agent:
       - `PreToolUse` hook: `curl -s -X POST {serverUrl}/api/heartbeat -H 'Content-Type: application/json' -d '{"agentId":"{agentName}","status":"working","task":"$TOOL_NAME"}'`
       - `PostToolUse` hook: same but with status "working" and task from tool result context
       - `Stop` hook: `curl -s -X POST {serverUrl}/api/heartbeat -H 'Content-Type: application/json' -d '{"agentId":"{agentName}","status":"idle"}'`
     - `installHooks(repoName: string, team: string, roles: string[], serverUrl: string): void` — writes hook config to each worktree's `.claude/settings.local.json` (local settings, not committed). For producer (no worktree), writes to the repo root's `.claude/settings.local.json`.
     - `removeHooks(repoName: string, team: string, roles: string[]): void` — removes the heartbeat hook entries from settings files
   - Why: Claude Code hooks are the mechanism to bridge agent activity to the visualization. Using `settings.local.json` keeps hooks out of version control. The `PreToolUse` event fires when any tool is invoked, which reliably indicates the agent is working.
   - Dependencies: none

8. **Integrate hooks into init** (`lib/init.ts`)
   - Action:
     - Import `installHooks` from `./hooks.js`
     - After step 16 (installing agent profiles), add a new step:
       ```
       console.log(chalk.bold('Installing visualization hooks...'));
       installHooks(repoName, team, roles, 'http://localhost:4321');
       ```
     - Add the server URL as a configurable value (default 4321, stored in repo.md or a separate config)
   - Why: Hooks must be in place before agents start, so init is the right time
   - Dependencies: step 7

9. **Integrate hooks removal into teardown** (`lib/teardown.ts`)
   - Action:
     - Import `removeHooks` from `./hooks.js`
     - In `teardown()`, call `removeHooks()` alongside the existing cleanup steps
   - Why: Clean teardown must undo everything init did
   - Dependencies: step 7

10. **Add hooks tests** (`tests/hooks.test.ts`)
    - Action: Test hook configuration generation and file writing:
      - Verify generated hook config has correct agent name and URL
      - Verify `installHooks` writes to the correct `.claude/settings.local.json` path per worktree
      - Verify `removeHooks` cleans up the heartbeat entries without touching other settings
      - Test with various coder counts (1, 4)
    - Why: Hook installation touches Claude Code settings — bugs here could break agent operation
    - Dependencies: step 7

### Phase 3: UI Polish — Status Panel and Agent Names

This phase adds the status panel below the canvas and ensures agent names are displayed on citizens.

11. **Configure citizen sprites with agent names** (`worlds/nightshift/citizens/`)
    - Action: Create citizen sprite configurations for each agent role. Each config should:
      - Set `displayName` to the role name (e.g., "producer", "planner", "reviewer", "coder-1", "tester")
      - Use distinct sprite colors/animations per role to match tmux color scheme:
        - Producer: cyan-tinted sprite
        - Planner: yellow-tinted sprite
        - Reviewer: magenta-tinted sprite
        - Coder(s): blue-tinted sprite
        - Tester: green-tinted sprite
      - Enable name label rendering above the citizen sprite (miniverse's `SpeechBubbleSystem` or a custom name label layer)
    - Why: Requirement R5 — agents must have clear, visible names in the canvas
    - Dependencies: step 2

12. **Add custom frontend page with status panel** (`worlds/nightshift/index.html`)
    - Action: Create a custom HTML page that:
      - Embeds the miniverse canvas at the top
      - Below the canvas, renders a status panel (`<div id="status-panel">`) showing a card per agent:
        ```
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ producer │ │ planner  │ │ reviewer │
        │ Working  │ │ Sleeping │ │ Thinking │
        └──────────┘ └──────────┘ └──────────┘
        ```
      - Status cards use the same color scheme as tmux pane borders
      - Cards update in real-time via WebSocket connection to the miniverse server
      - Status text mapping from miniverse agent states:
        - `working` → "Working"
        - `idle` → "Idle"
        - `thinking` → "Thinking"
        - `sleeping` → "Sleeping"
        - `error` → "Error"
        - `offline` → "Offline"
      - Include the current task description when available (from heartbeat `task` field)
      - Page title: "nightshift — {team}"
      - Clean, minimal CSS — no framework dependencies. Use CSS Grid for card layout.
    - Why: Requirement R4 — status panel must show all agents with real-time status outside the canvas
    - Dependencies: step 3

13. **Handle dynamic agent count in frontend** (`worlds/nightshift/index.html`)
    - Action: The status panel and canvas must adapt to any agent count (5-8 agents). On page load:
      - Fetch agent list from `GET /api/observe` (miniverse endpoint returning world state including all registered agents)
      - Dynamically create one status card per agent
      - CSS Grid should `auto-fit` cards with `minmax(120px, 1fr)` for responsive layout
    - Why: Agent count varies per team config (1-4 coders). The UI must not hardcode agent count.
    - Dependencies: step 12

14. **Ensure reliable citizen spawning** (fix spawning bugs)
    - Action: Address miniverse spawning issues in the integration layer:
      - In `registerAgents()` (from step 3), add retry logic: if the initial heartbeat fails, retry up to 3 times with 1s delay
      - Add a startup health check: after starting the server, poll `GET /api/observe` until it responds (max 10s timeout) before registering agents
      - If the server fails to start, log a warning but don't block the tmux session from launching — visualization is non-critical
      - Ensure agents are registered with distinct spawn positions (spread across the scene) to avoid overlap at startup
    - Why: Requirement R3 — spawning must be reliable. The "bugs" likely refer to citizens not appearing when the server isn't ready or when multiple heartbeats arrive simultaneously.
    - Dependencies: steps 3, 11

15. **Add integration test** (`tests/visualize.test.ts`)
    - Action: Add integration-style tests:
      - Test that `registerAgents` sends the correct heartbeat payload for each agent
      - Test that world config generates valid anchor positions (no overlapping workstations)
      - Test the health check polling behavior
    - Why: End-to-end flow from agent list to miniverse registration must work
    - Dependencies: steps 6, 14

## Testing Strategy

- **Unit tests** (`tests/visualize.test.ts`): World config generation, PID file lifecycle, agent-to-citizen mapping
- **Unit tests** (`tests/hooks.test.ts`): Hook config generation, settings.local.json read/write/merge, cleanup
- **Integration tests**: Server start/stop cycle (can be skipped in CI if miniverse is not installed), health check polling
- **Manual verification**:
  1. Run `npx nightshift init --team dev --coders 2 --yes`
  2. Run `npx nightshift start --team dev`
  3. Open `http://localhost:4321` in browser
  4. Verify: 7 agents visible as named citizens (producer, planner, reviewer, coder-1, coder-2, tester)
  5. Verify: each citizen is at a workstation
  6. Verify: status panel below canvas shows all 7 agents with "Idle" status
  7. Start an agent loop — verify status changes to "Working" in both canvas animation and status panel
  8. Run `npx nightshift stop --team dev` — verify server shuts down cleanly
- **Typecheck**: `npm run typecheck` must pass
- **Existing tests**: All existing tests in `tests/*.test.ts` must continue to pass

## Assumptions

- **Miniverse as npm dependency, not vendored**: The issue says "copy over the functionality" but vendoring the entire miniverse codebase would add significant maintenance burden and violate the project's minimal-dependency philosophy. Using `@miniverse/server` as a dependency is cleaner and lets miniverse evolve independently. The nightshift integration layer (`lib/visualize.ts`, `lib/world-config.ts`) handles all customization. If the team disagrees, vendoring is possible but would significantly expand this plan.

- **Port 4321 default**: Miniverse uses port 4321 by default. This should be configurable via `--port` flag on `start` command and stored so `stop` knows which port to reference. If port conflicts arise, the server should fail gracefully with a clear error message.

- **`settings.local.json` for hooks**: Claude Code hooks will be written to `.claude/settings.local.json` (not `settings.json`) in each worktree. This file is gitignored by default and is the correct place for machine-local configuration. This avoids committing heartbeat URLs to version control.

- **Non-blocking visualization**: The miniverse server is a nice-to-have, not a hard requirement. If it fails to start (missing dependency, port conflict), the tmux session should still launch. A warning is printed but agents operate normally without visualization.

- **Gear-supply world customization**: The gear-supply world from miniverse may need workstation anchors added or rearranged to support 5-8 agents. The `world-config.ts` module will programmatically generate anchor positions in a grid layout within the scene, rather than relying on the default gear-supply workstation layout.

- **Spawning bug scope**: Requirement R3 ("Fix the bugs of spawning etc.") is addressed by adding retry logic and health checks in the integration layer. If there are bugs within miniverse's core spawning code, those should be fixed upstream via a PR to the miniverse repo rather than patched in nightshift.

- **Claude Code hook events**: The plan assumes Claude Code supports `PreToolUse`, `PostToolUse`, and `Stop` hook events. If the exact event names differ, the hook generation in `lib/hooks.ts` should be updated to match the actual API. The coder should verify available hook events from Claude Code documentation before implementation.

- **No changes to agent markdown files**: The heartbeat integration is handled entirely through Claude Code hooks (settings.local.json). The agent `.md` profile files in `presets/dev/agents/` do not need modification — hooks fire automatically regardless of agent profile content.

## Risks & Mitigations

- **Risk**: `@miniverse/server` may not be published to npm yet or may have breaking API changes
  - Mitigation: Check npm registry before starting implementation. If not available, consider installing directly from GitHub (`"@miniverse/server": "github:ianscott313/miniverse#main"`). Pin to a specific commit hash for stability. If the API differs significantly from what's documented in the README, adapt `lib/visualize.ts` accordingly.

- **Risk**: Adding a web server dependency significantly increases nightshift's dependency footprint (Express, Vite, WebSocket libraries)
  - Mitigation: Make `@miniverse/server` an optional/peer dependency. The visualization feature is opt-in — if the dependency is not installed, `start` skips the server and prints a message: "Install @miniverse/server for agent visualization." This keeps the core nightshift experience lightweight.

- **Risk**: Claude Code hook format may change between versions, breaking heartbeat integration
  - Mitigation: Hook configuration is generated at init time and can be regenerated with `npx nightshift init --team dev --reset`. Document the hook format in code comments. Test with the current Claude Code version.

- **Risk**: Port 4321 may conflict with other services on the user's machine
  - Mitigation: Support `--port` flag, auto-detect available port if 4321 is taken (try 4322, 4323, etc.), print the actual port in use.

- **Risk**: Multiple nightshift teams running simultaneously would conflict on the same port
  - Mitigation: Each team gets a unique port: `4321 + teamIndex`. Store the port in `~/.nightshift/{repo}/{team}/miniverse.port` so `stop` and hooks know which port to use.

- **Risk**: The gear-supply world may not have enough space for 8 workstations
  - Mitigation: The world config is generated dynamically (`world-config.ts`), not hardcoded. Workstations are placed in a 4x2 grid layout that scales with agent count. If the default canvas size (512x384) is too small, increase it proportionally.
