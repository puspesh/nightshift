# Plan: Multi miniverse support

> Issue: #10
> Date: 2026-03-23
> Status: draft

## Overview

Currently each team starts its own miniverse server on a separate port. This plan consolidates to a single shared server on port 4321 that serves multiple team worlds. The server already has multi-world infrastructure (`readWorld(worldId)`, `/worlds/{id}/...` static paths, `worldCache`) — we leverage it by storing each team's world under `worlds/{team}/` and adding a team selector to the frontend. The key changes are: restructure the world directory to repo-level, modify `/api/world` to accept a `?team=` parameter, add a `/api/worlds` listing endpoint, and build a frontend team selector that re-initializes the miniverse engine on switch.

## Requirements

- Separate worlds initialized per team, all accessible on the same server (port 4321)
- World selector UI at the top of the page showing the currently active team
- Switching teams loads that team's world with its agents
- Maximum code reuse — leverage existing multi-world infrastructure in the server

## Architecture Changes

- **Modified**: `lib/miniverse/server/server.ts` — modify `/api/world` to accept `?team=`, add `/api/worlds` endpoint
- **Modified**: `lib/miniverse/server/frontend.ts` — add team selector dropdown, re-initialize on switch
- **Modified**: `lib/start.ts` — restructure world dir to repo-level, reuse running server
- **Modified**: `lib/visualize.ts` — repo-level PID/port files, skip start if server running
- **Modified**: `lib/world-config.ts` — merge base world and dynamic config into one file
- **Modified**: `tests/visualize.test.ts` — update PID/port path tests
- **Modified**: `tests/start.test.ts` — update world dir expectations

## Implementation Steps

### Phase 1: Shared server directory structure

1. **Restructure world directory to repo-level** (`lib/start.ts`)
   - Action: Change the world directory from `~/.nightshift/{repo}/{team}/world/` to `~/.nightshift/{repo}/miniverse/worlds/{team}/`. Currently (line 127): `const worldDir = join(getTeamDir(repoName, team), 'world')`. Change to:
     ```typescript
     const miniverseDir = join(homedir(), '.nightshift', repoName, 'miniverse');
     const teamWorldDir = join(miniverseDir, 'worlds', team);
     ```
     Copy base world assets (world_assets/, base-world.json) into `teamWorldDir/` as before. Copy universal_assets/ and core/ to the shared `miniverseDir/` level (not per-team). Pass `miniverseDir` as the server's publicDir instead of the team-specific worldDir.
   - Why: A single publicDir at repo-level lets the server serve all teams' worlds. The `worlds/{team}/` subdirectory structure matches the existing `readWorld(worldId)` path pattern.
   - Dependencies: none

2. **Merge base world and dynamic config** (`lib/world-config.ts`)
   - Action: Add a new function `mergeWorldConfig(baseWorldPath: string, dynamicConfig: WorldConfig): Record<string, any>` that reads `base-world.json`, then overlays the dynamic config (citizens, workstations) onto it. The merged result includes floor, props, tiles, wanderPoints (from base) plus citizens (from dynamic config). Write the merged result as `world.json` in the team's world directory.
   - Why: Currently `/api/world` serves `base-world.json` (static layout) and the dynamic config (citizens) is separate. For multi-world support, the server uses `readWorld(teamId)` which reads `worlds/{team}/world.json` — this file must contain everything the frontend needs in one read.
   - Dependencies: step 1

3. **Move PID/port files to repo-level** (`lib/visualize.ts`)
   - Action: Change `getPidFilePath` and `getPortFilePath` from team-scoped (`~/.nightshift/{repo}/{team}/miniverse.{pid,port}`) to repo-scoped (`~/.nightshift/{repo}/miniverse.{pid,port}`). Update the function signatures to drop the `team` parameter. Update `startServer`, `stopServer`, `isServerRunning` accordingly.
   - Why: A shared server has one PID/port, not one per team.
   - Dependencies: none

4. **Reuse running server** (`lib/start.ts`)
   - Action: Before starting a new server, check if one is already running for this repo using `isServerRunning(repoName)` (updated from step 3). If running, read the port from the port file and use that URL. Skip `startServer()` but still call `registerAgents()` and `installHooks()`. This lets the second `nightshift start --team infra` reuse the server started by the first `nightshift start --team dev`.
   - Why: Multiple teams sharing one server is the core requirement. Without this, each team would still start its own server.
   - Dependencies: steps 1, 3

### Phase 2: Server multi-world endpoints

5. **Modify `/api/world` endpoint** (`lib/miniverse/server/server.ts`)
   - Action: Change the handler at line 653 to accept an optional `?team=` query parameter:
     ```typescript
     if (req.method === 'GET' && url.pathname === '/api/world') {
       const team = url.searchParams.get('team');
       let worldData: unknown | null;
       if (team) {
         worldData = this.loadWorldData(team);
       } else {
         const defaultId = this.getDefaultWorldId();
         worldData = defaultId ? this.loadWorldData(defaultId) : null;
       }
       if (worldData) {
         res.writeHead(200, { 'Content-Type': 'application/json' });
         res.end(JSON.stringify(worldData));
       } else {
         res.writeHead(404, { 'Content-Type': 'application/json' });
         res.end(JSON.stringify({ error: 'No world data' }));
       }
     }
     ```
     This reuses the existing `loadWorldData()` and `getDefaultWorldId()` methods — no new loading logic needed.
   - Why: The only server endpoint change needed for multi-world reads. `loadWorldData(team)` reads from `{publicDir}/worlds/{team}/world.json` which is where step 2 writes the merged world.
   - Dependencies: step 2

6. **Add `/api/worlds` endpoint** (`lib/miniverse/server/server.ts`)
   - Action: Add a new `GET /api/worlds` route that scans `{publicDir}/worlds/` for directories containing `world.json`. Return a list of team objects with id and basic metadata:
     ```typescript
     if (req.method === 'GET' && url.pathname === '/api/worlds') {
       const publicDir = this.publicDir ?? '.';
       const worldsDir = path.join(publicDir, 'worlds');
       const teams: { id: string; agents: number }[] = [];
       if (existsSync(worldsDir)) {
         for (const entry of readdirSync(worldsDir, { withFileTypes: true })) {
           if (entry.isDirectory() && existsSync(path.join(worldsDir, entry.name, 'world.json'))) {
             const world = this.loadWorldData(entry.name) as any;
             teams.push({ id: entry.name, agents: world?.citizens?.length ?? 0 });
           }
         }
       }
       res.writeHead(200, { 'Content-Type': 'application/json' });
       res.end(JSON.stringify({ worlds: teams }));
     }
     ```
   - Why: The frontend needs this to populate the team selector dropdown. Reuses `loadWorldData()`.
   - Dependencies: none

### Phase 3: Frontend team selector

7. **Add team selector UI** (`lib/miniverse/server/frontend.ts`)
   - Action: Add a selector bar between the `<h1>` and the `#canvas-container`. HTML:
     ```html
     <div id="team-selector">
       <label for="team-select">Team:</label>
       <select id="team-select"></select>
     </div>
     ```
     CSS: style the selector to match the dark theme (`background: #161b22`, `border: #30363d`, `color: #c9d1d9`).
   - Why: The user needs a way to switch between team worlds.
   - Dependencies: none

8. **Wire up team selector logic** (`lib/miniverse/server/frontend.ts`)
   - Action: In the `<script>` section:
     1. On page load, fetch `GET /api/worlds` to populate the dropdown
     2. Check URL query param `?team=` for initial selection; default to first team
     3. Pass selected team to `startWorld(teamId)` — modify `startWorld()` to fetch `/api/world?team={teamId}` instead of `/api/world`
     4. On dropdown change: destroy current Miniverse instance, update URL query param, call `startWorld(newTeam)` to re-initialize
     5. Update static asset paths: the frontend currently fetches tiles/props from `/worlds/...`. Since team worlds are at `/worlds/{team}/world_assets/...`, update the tile path prefix in `startWorld()` to use `/worlds/{teamId}` instead of `/worlds`.
   - Why: This connects the selector to the world loading pipeline. URL query params make team selection shareable/bookmarkable.
   - Dependencies: steps 5, 6, 7

9. **Filter status panel by team** (`lib/miniverse/server/frontend.ts`)
   - Action: In `renderCard()`, derive the team from the agent ID (agent IDs follow `ns-{team}-{role}` pattern, e.g., `ns-dev-producer`). Only render cards for agents matching the currently selected team. When switching teams, clear the status panel and re-render only matching agents.
   - Why: Without filtering, the status panel shows all agents from all teams, which is confusing.
   - Dependencies: step 8

### Phase 4: Tests and cleanup

10. **Update PID/port path tests** (`tests/visualize.test.ts`)
    - Action: Update `getPidFilePath` and `getPortFilePath` test assertions to expect repo-level paths (`~/.nightshift/{repo}/miniverse.{pid,port}`) instead of team-level paths. Remove the `team` parameter from test calls.
    - Why: Step 3 changed the function signatures and paths.
    - Dependencies: step 3

11. **Add world merging tests** (`tests/visualize.test.ts` or new `tests/world-config.test.ts`)
    - Action: Test `mergeWorldConfig()`:
      - Verify merged output contains floor/props from base world AND citizens from dynamic config
      - Verify base world properties (gridCols, tiles, etc.) are preserved
      - Verify citizens array is correctly added
    - Why: The merge is the critical correctness point — wrong merge means broken worlds.
    - Dependencies: step 2

12. **Update start.ts tests** (`tests/start.test.ts`)
    - Action: If there are tests that validate the worldDir path or server startup flow, update them for the new repo-level directory structure.
    - Why: Prevents regressions from the directory restructure.
    - Dependencies: step 1

## Testing Strategy

- Unit tests: `mergeWorldConfig()` merge correctness, PID/port path changes
- Integration test (manual): Initialize two teams (`dev`, `infra`), start both, verify:
  - Single server on port 4321
  - Team selector dropdown shows both teams
  - Switching teams loads the correct world with correct agents
  - Status panel only shows agents from the selected team
  - Both teams' agents update in real-time via WebSocket
- Edge case: Start one team, verify selector works with single option; then start second team, verify it appears without restarting the server (requires page refresh or polling `/api/worlds`)

## Assumptions

- **Agent ID contains team name**: The `ns-{team}-{role}` pattern is consistent across all agents. This is validated by `tests/profiles.test.ts`. The frontend can reliably extract team from agent ID.
- **Static assets are identical across teams**: Currently all teams use the same base world (`worlds/nightshift/`). Each team gets its own copy of `world_assets/` and `base-world.json`. If teams need different base worlds in the future, the structure supports it — each team's `worlds/{team}/` directory is independent.
- **No WebSocket team filtering needed**: The WebSocket broadcasts all agent states. The frontend filters client-side by team. This is simpler and sufficient for the expected scale (5-10 agents per team, 1-3 teams). Server-side filtering is out of scope.
- **Server restart not needed when adding a team**: A new team writes its world to `worlds/{team}/world.json` and registers agents via heartbeat. The server picks up the new team when the frontend fetches `/api/worlds` on page load or team selector refresh. No server restart required.

## Risks & Mitigations

- **Risk**: Restructuring the world directory breaks existing single-team installations
  - Mitigation: Phase 1 step 4 checks for an existing server before starting. If the server was started with the old directory structure, it will be a different process. The `stopSession()` function should also be updated to use repo-level PID files. Existing installations will need to re-init or the old server will be orphaned — document this in the migration path.

- **Risk**: Re-initializing the Miniverse engine on team switch causes visual glitches or memory leaks
  - Mitigation: The Miniverse constructor creates a new canvas. On switch, remove the old canvas from `#canvas-container` before creating a new one. If the Miniverse engine exposes a `destroy()` method, call it; otherwise manually clean up (remove canvas, close WebSocket if engine-managed).

- **Risk**: Multiple `nightshift start` commands race to start the server
  - Mitigation: The `isServerRunning()` check uses PID file + `process.kill(pid, 0)` to verify the process is alive. If the first team's server is still starting (PID file exists but not healthy yet), the second team can retry `waitForServer()` with the existing URL. Add a brief wait-and-retry before starting a new server.
