# Plan: Add a Visual Representation of Agents Working

> Issue: #5
> Date: 2026-03-22
> Status: revised

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
| `lib/types.ts` | Shared type definitions (`AgentEntry`, `WorldConfig`, `HookConfig`) used across visualization modules |
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
| `bin/nightshift.ts` | Parse `--port` flag for `start` command, pass to `startSession()` |
| `lib/start.ts` | Extract `AgentEntry` interface to `lib/types.ts`; accept `options` object with `port`; start miniverse server before tmux session; print server URL; stop server in `stopSession()` |
| `lib/init.ts` | Call `installHooks()` after worktree creation; generate world config with correct workstation count |
| `lib/teardown.ts` | Remove hooks and world config during teardown |
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
              │   - /api/hooks/claude  │
              └────────────┬───────────┘
                           ▲
                           │ HTTP hooks (type: "http")
              ┌────────────┴───────────┐
              │  Claude Code Hooks     │
              │  (per-worktree)        │
              │  POST /api/hooks/      │
              │    claude-code         │
              │  Server maps events:   │
              │  PreToolUse → working  │
              │  UserPrompt → thinking │
              │  Stop → idle           │
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
     - Accept an array of `AgentEntry` (imported from `./types.js`)
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
     - `registerAgents(url: string, agents: AgentEntry[]): void` — sends initial heartbeat for each agent using the correct miniverse API payload: `{"agent":"{agentName}","state":"idle","task":"Initializing"}`. This ensures all citizens appear immediately rather than waiting for the first hook fire.
     - Server should log to `~/.nightshift/{repo}/{team}/miniverse.log`
   - Why: Server must outlive the `start` command (user detaches tmux) but die with `stop`
   - Dependencies: step 1

4. **Extract shared types** (`lib/types.ts`)
   - Action: Create `lib/types.ts` with shared type definitions:
     - Move `AgentEntry` interface from `lib/start.ts:36-40` to `lib/types.ts` and export it
     - Update `lib/start.ts` to import `AgentEntry` from `./types.js`
     - Add `WorldConfig` type for the world configuration object
     - Add `HookConfig` type for Claude Code hook entries
   - Why: `AgentEntry` is currently a local interface in `start.ts` but the new modules (`world-config.ts`, `visualize.ts`, `hooks.ts`) all need it. A shared types file avoids circular imports.
   - Dependencies: none

5. **Update start flow** (`lib/start.ts`)
   - Action:
     - Import `startServer`, `registerAgents` from `./visualize.js`
     - Import `generateWorldConfig`, `writeWorldConfig` from `./world-config.js`
     - Change `startSession(team: string)` signature to `startSession(team: string, options?: { port?: number })` to accept the visualization port
     - In `startSession()`, before creating the tmux session:
       1. Generate world config from agent list
       2. Write world config to `~/.nightshift/{repo}/{team}/world/`
       3. Start the miniverse server on `options.port` (default 4321)
       4. Register all agents with initial "idle" state
     - After printing agent list, print the miniverse URL: `Visualization: http://localhost:{port}`
     - In `stopSession()`, call `stopServer()` before killing the tmux session
   - Why: Server must be running before agents start so heartbeats have somewhere to go
   - Dependencies: steps 2, 3, 4

6. **Add `--port` flag to CLI** (`bin/nightshift.ts`)
   - Action:
     - In the `start` command handler, parse `--port` flag using the existing `parseFlag` pattern
     - Pass the parsed port to `startSession(team, { port })`
     - Update `printHelp()` to document the `--port` flag: `--port <number>  Port for visualization server (default: 4321)`
   - Why: Port must be configurable to avoid conflicts. The flag must be threaded from CLI entry point through to server startup.
   - Dependencies: step 5

7. **Update stop flow** (`lib/start.ts`)
   - Action: In `stopSession()`, add `stopServer(repoName, team)` call before `tmux kill-session`
   - Why: Clean shutdown — server process must not leak
   - Dependencies: step 3

8. **Add basic tests** (`tests/visualize.test.ts`)
   - Action: Test world config generation:
     - Given 5 agents (producer, planner, reviewer, coder-1, tester), verify config has 5 workstation anchors
     - Given 8 agents (4 coders), verify 8 workstations
     - Verify citizen names match agent roles
     - Verify PID file write/read/cleanup
     - Verify `registerAgents` sends payloads with correct field names (`agent`, `state`, `task`)
   - Why: Core logic must be tested; server lifecycle tests use mocked child_process
   - Dependencies: steps 2, 3

### Phase 2: Heartbeat Integration via Claude Code Hooks

This phase connects the running agents to the miniverse server so citizens animate based on real agent activity.

9. **Create hooks module** (`lib/hooks.ts`)
   - Action: Create a module that generates and installs Claude Code hooks for heartbeat integration. Miniverse provides a dedicated endpoint `POST /api/hooks/claude-code` that natively maps Claude Code lifecycle events to citizen states, so nightshift does NOT need to implement any status-mapping logic.
     - `generateHookConfig(agentName: string, serverUrl: string): HookConfig` — generates a single hook entry per Claude Code event, all pointing to the same miniverse endpoint. Uses `"type": "http"` hooks (not shell/curl) for reliability:
       ```json
       {
         "hooks": {
           "PreToolUse": [{ "type": "http", "url": "http://localhost:4321/api/hooks/claude-code", "headers": { "X-Agent-Name": "{agentName}" } }],
           "PostToolUse": [{ "type": "http", "url": "http://localhost:4321/api/hooks/claude-code", "headers": { "X-Agent-Name": "{agentName}" } }],
           "UserPromptSubmit": [{ "type": "http", "url": "http://localhost:4321/api/hooks/claude-code", "headers": { "X-Agent-Name": "{agentName}" } }],
           "Stop": [{ "type": "http", "url": "http://localhost:4321/api/hooks/claude-code", "headers": { "X-Agent-Name": "{agentName}" } }]
         }
       }
       ```
       The miniverse server handles all event-to-state mapping internally:
       - `SessionStart` → idle
       - `UserPromptSubmit` → thinking
       - `PreToolUse` / `PostToolUse` → working
       - `PostToolUseFailure` → error
       - `Stop` → idle
       - `SessionEnd` → offline
     - `installHooks(repoName: string, team: string, roles: string[], serverUrl: string): void` — writes hook config to each worktree's `.claude/settings.local.json` (local settings, not committed). For producer (no worktree), writes to the repo root's `.claude/settings.local.json`. Must merge with any existing settings in the file (read-modify-write, not overwrite).
     - `removeHooks(repoName: string, team: string, roles: string[]): void` — removes the heartbeat hook entries from settings files without disturbing other hook entries.
   - Why: Using the miniverse-native hook endpoint eliminates status-mapping logic from nightshift. HTTP-type hooks are more reliable than shell hooks — they don't depend on `curl` being installed and avoid shell escaping issues.
   - Dependencies: none

10. **Integrate hooks into init** (`lib/init.ts`)
    - Action:
      - Import `installHooks` from `./hooks.js`
      - After step 16 (installing agent profiles), add a new step:
        ```
        console.log(chalk.bold('Installing visualization hooks...'));
        installHooks(repoName, team, roles, 'http://localhost:4321');
        ```
      - Add the server URL as a configurable value (default 4321, stored in repo.md or a separate config)
    - Why: Hooks must be in place before agents start, so init is the right time
    - Dependencies: step 9

11. **Integrate hooks removal into teardown** (`lib/teardown.ts`)
    - Action:
      - Import `removeHooks` from `./hooks.js`
      - In `teardown()`, call `removeHooks()` alongside the existing cleanup steps
    - Why: Clean teardown must undo everything init did
    - Dependencies: step 9

12. **Add hooks tests** (`tests/hooks.test.ts`)
    - Action: Test hook configuration generation and file writing:
      - Verify generated hook config uses `"type": "http"` (not shell) and points to `/api/hooks/claude-code`
      - Verify hook config includes `X-Agent-Name` header with the correct agent name
      - Verify `installHooks` writes to the correct `.claude/settings.local.json` path per worktree
      - Verify `installHooks` merges with existing settings (read-modify-write)
      - Verify `removeHooks` cleans up the heartbeat entries without touching other hook entries
      - Test with various coder counts (1, 4)
    - Why: Hook installation touches Claude Code settings — bugs here could break agent operation
    - Dependencies: step 9

### Phase 3: UI Polish — Status Panel and Agent Names

This phase adds the status panel below the canvas and ensures agent names are displayed on citizens.

13. **Configure citizen sprites with agent names** (`worlds/nightshift/citizens/`)
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

14. **Add custom frontend page with status panel** (`worlds/nightshift/index.html`)
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

15. **Handle dynamic agent count in frontend** (`worlds/nightshift/index.html`)
    - Action: The status panel and canvas must adapt to any agent count (5-8 agents). On page load:
      - Connect via WebSocket to `ws://localhost:{port}/ws` to receive real-time agent state updates (this is how the miniverse frontend natively works — NOT via REST polling)
      - On first connection, the WebSocket sends the current world state including all registered agents
      - Dynamically create one status card per agent from the initial state
      - Update card status text on each subsequent WebSocket message
      - CSS Grid should `auto-fit` cards with `minmax(120px, 1fr)` for responsive layout
    - Why: Agent count varies per team config (1-4 coders). The UI must not hardcode agent count. WebSocket is the correct transport — miniverse does not expose a `GET /api/observe` REST endpoint.
    - Dependencies: step 14

16. **Ensure reliable citizen spawning** (fix spawning bugs)
    - Action: Address miniverse spawning issues in the integration layer:
      - In `registerAgents()` (from step 3), add retry logic: if the initial heartbeat `POST /api/heartbeat` fails, retry up to 3 times with 1s delay
      - Add a startup health check: after starting the server, poll `GET /` (or attempt a WebSocket connection to `ws://localhost:{port}/ws`) until it responds (max 10s timeout) before registering agents. Do NOT use `GET /api/observe` — this endpoint does not exist.
      - If the server fails to start, log a warning but don't block the tmux session from launching — visualization is non-critical
      - Ensure agents are registered with distinct spawn positions (spread across the scene) to avoid overlap at startup
    - Why: Requirement R3 — spawning must be reliable. The "bugs" likely refer to citizens not appearing when the server isn't ready or when multiple heartbeats arrive simultaneously.
    - Dependencies: steps 3, 13

17. **Add integration test** (`tests/visualize.test.ts`)
    - Action: Add integration-style tests:
      - Test that `registerAgents` sends heartbeat payloads with correct field names (`agent`, `state`, `task`) for each agent
      - Test that world config generates valid anchor positions (no overlapping workstations)
      - Test the health check polling behavior (retry on connection refused, succeed on 200)
    - Why: End-to-end flow from agent list to miniverse registration must work
    - Dependencies: steps 8, 16

## Testing Strategy

- **Unit tests** (`tests/visualize.test.ts`): World config generation, PID file lifecycle, agent-to-citizen mapping
- **Unit tests** (`tests/hooks.test.ts`): Hook config generation, settings.local.json read/write/merge, cleanup
- **Integration tests**: Server start/stop cycle (can be skipped in CI if miniverse is not installed), health check polling
- **Manual verification**:
  1. Run `npx nightshift init --team dev --coders 2 --yes`
  2. Run `npx nightshift start --team dev`
  3. Open `http://localhost:4321` in browser
  4. Verify: 6 agents visible as named citizens (producer, planner, reviewer, coder-1, coder-2, tester)
  5. Verify: each citizen is at a workstation
  6. Verify: status panel below canvas shows all 6 agents with "Idle" status
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

- **Claude Code hook events**: The plan uses `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, and `Stop` hook events with `"type": "http"` transport. All hooks point to the miniverse-native endpoint `POST /api/hooks/claude-code` which handles event-to-state mapping internally. The coder should verify the exact hook event names and HTTP hook format from Claude Code documentation before implementation.

- **Miniverse API contract**: The heartbeat endpoint uses `{"agent":"...","state":"...","task":"..."}` field names (not `agentId`/`status`). The `/api/hooks/claude-code` endpoint handles Claude Code event payloads natively. There is no `GET /api/observe` endpoint — the frontend uses WebSocket (`ws://localhost:{port}/ws`) for real-time state sync. The coder should verify these API contracts against the actual miniverse version installed.

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

## Revision Notes

Revised based on @ns-dev-reviewer feedback (3 critical, 3 warnings).

### What changed

1. **CRITICAL — Heartbeat API payload fields corrected**: All heartbeat payloads throughout the plan (steps 3, 8, 17) now use the correct miniverse API field names: `agent` (not `agentId`), `state` (not `status`). The `task` field was already correct.

2. **CRITICAL — Hooks architecture simplified**: Step 9 (`lib/hooks.ts`) completely rewritten. Instead of generating separate shell-type `curl` hooks with manual status-mapping logic, the module now generates HTTP-type hooks (`"type": "http"`) that all point to the miniverse-native endpoint `POST /api/hooks/claude-code`. The miniverse server handles all event-to-state mapping internally (SessionStart→idle, UserPromptSubmit→thinking, PreToolUse→working, etc.). This eliminates status-mapping logic from nightshift entirely and avoids shell escaping / curl dependency issues.

3. **CRITICAL — Removed references to non-existent `GET /api/observe`**: Steps 15 and 16 no longer use `GET /api/observe`. The frontend (step 15) now uses WebSocket (`ws://localhost:{port}/ws`) for real-time state sync, which is the miniverse-native transport. The health check (step 16) now uses `GET /` or a WebSocket connection test instead.

4. **WARNING — `AgentEntry` extracted to shared types**: Added step 4 (`lib/types.ts`) to extract `AgentEntry` from `lib/start.ts` into a shared types file. This avoids the issue where 3 new modules all need the type but it's only defined locally in `start.ts`.

5. **WARNING — Agent count corrected**: Manual verification steps 4 and 6 now correctly say "6 agents" (not 7) for a `--coders 2` configuration: producer + planner + reviewer + coder-1 + coder-2 + tester = 6.

6. **WARNING — `--port` flag plumbing added**: Added step 6 that updates `bin/nightshift.ts` to parse the `--port` flag and thread it through to `startSession()`. Step 5 updates `startSession`'s signature to accept an `options` object with optional `port`. `printHelp()` is also updated to document the flag.

### What was kept and why

- Miniverse as npm dependency (not vendored) — reviewer did not object; aligns with project's minimal-dependency philosophy
- Non-blocking visualization (warning-only on failure) — praised by reviewer
- `settings.local.json` for hooks — praised by reviewer as correct approach
- PID file management for server lifecycle — praised as appropriate
- 3-phase structure (core server → hooks → UI polish) — praised as well-structured
- Dynamic world config based on `--coders` count — praised as the right approach
- Reviewer's suggestion to use `npx create-miniverse` for scaffolding was considered but not adopted — the dynamic world config generation in `world-config.ts` needs programmatic control over anchor placement that a scaffolded world wouldn't provide. If miniverse's scaffolder supports config templates in the future, this could be revisited.
