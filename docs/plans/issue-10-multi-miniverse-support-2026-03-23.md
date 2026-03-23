# Plan: Multi miniverse support

> Issue: #10
> Date: 2026-03-23
> Status: revised

## Overview

Currently each team starts its own miniverse server on a separate port. This plan consolidates to a single shared server on port 4321 that serves multiple team worlds. Each team's world is stored directly at `{publicDir}/{team}/` (not nested under `worlds/`), which aligns with the existing `/worlds/` static asset route that strips the `/worlds/` prefix. The server's `loadWorldData`, `getWorldPath`, and `getDefaultWorldId` methods are updated to match this flat layout (removing the `worlds/` path segment — a 3-line change). Each team's `world.json` is a merge of `base-world.json` (floor, props, tiles) and the dynamic config (citizens, workstations) using a simple property spread over disjoint key sets. The frontend gets a team selector and filters agents by team.

## Requirements

- Separate worlds initialized per team, all accessible on the same server (port 4321)
- World selector UI at the top of the page showing the currently active team
- Switching teams loads that team's world with its agents
- Maximum code reuse — leverage existing multi-world infrastructure in the server

## Architecture Changes

- **Modified**: `lib/miniverse/server/server.ts` — modify `/api/world` to accept `?team=`, add `/api/worlds` endpoint, update `getWorldPath`/`loadWorldData`/`getDefaultWorldId` to flat layout, remove world cache
- **Modified**: `lib/miniverse/server/frontend.ts` — add team selector dropdown, `getTeam()` helper, re-initialize on switch
- **Modified**: `lib/start.ts` — restructure world dir to repo-level, reuse running server, guard `stopSession` against killing shared server
- **Modified**: `lib/visualize.ts` — repo-level PID/port files, skip start if server running
- **Modified**: `lib/world-config.ts` — merge base world and dynamic config into one file
- **Modified**: `tests/visualize.test.ts` — update PID/port path tests
- **Modified**: `tests/start.test.ts` — update world dir expectations

## Implementation Steps

### Phase 1: Shared server directory structure

1. **Restructure world directory to repo-level** (`lib/start.ts`)
   - Action: Change the world directory from `~/.nightshift/{repo}/{team}/world/` to `~/.nightshift/{repo}/miniverse/{team}/`. Currently (line 127): `const worldDir = join(getTeamDir(repoName, team), 'world')`. Change to:
     ```typescript
     const miniverseDir = join(homedir(), '.nightshift', repoName, 'miniverse');
     const teamWorldDir = join(miniverseDir, team);
     ```
     Teams are placed **directly** under `miniverseDir/` (NOT nested in a `worlds/` subdirectory). This is critical: the existing `/worlds/` static route (server.ts:667) strips the `/worlds/` prefix from URLs and resolves the remainder relative to `publicDir`. With `publicDir = miniverseDir` and teams at `{miniverseDir}/{team}/`, a URL like `/worlds/dev/world_assets/tiles/main_floor.png` resolves to `{miniverseDir}/dev/world_assets/tiles/main_floor.png` — which is the correct file location.

     Copy base world assets (world_assets/, base-world.json) into `teamWorldDir/` as before. Copy universal_assets/ to the shared `miniverseDir/` level (not per-team). Copy core/ to `{miniverseDir}/../core/` (already served by the `/miniverse-core.js` route). Pass `miniverseDir` as the server's `publicDir`.
   - Why: A single publicDir at repo-level lets the server serve all teams' worlds. The flat `{publicDir}/{team}/` layout aligns with the static route's path stripping — no route changes needed.
   - Dependencies: none

2. **Merge base world and dynamic config** (`lib/world-config.ts`)
   - Action: Add a new function `mergeWorldConfig(baseWorldPath: string, dynamicConfig: WorldConfig): Record<string, any>` that reads `base-world.json` and spreads the dynamic config on top:
     ```typescript
     const baseWorld = JSON.parse(readFileSync(baseWorldPath, 'utf-8'));
     return { ...baseWorld, ...dynamicConfig };
     ```
     The key sets are **disjoint** — no collision handling needed:
     - Base world provides: `gridCols`, `gridRows`, `floor`, `tiles`, `propImages`, `props`, `wanderPoints`
     - Dynamic config provides: `canvas`, `tileSize`, `scale`, `theme`, `workstations`, `citizens`

     The existing `writeWorldConfig` (line 70-73) writes only dynamic config to `world.json`. Replace this: instead of calling `writeWorldConfig(worldConfig, worldDir)` in `start.ts`, call `mergeWorldConfig()` then write the merged result. The merged file is what the frontend needs — it replaces both the old separate `base-world.json` and `world.json`.
   - Why: The frontend fetches `/api/world?team=X` expecting a single JSON with floor, tiles, AND citizens. Without merging, the dynamic `world.json` has no floor/tiles data and the frontend renders a blank world.
   - Dependencies: step 1

3. **Move PID/port files to repo-level** (`lib/visualize.ts`)
   - Action: Change `getPidFilePath` and `getPortFilePath` from team-scoped (`~/.nightshift/{repo}/{team}/miniverse.{pid,port}`) to repo-scoped (`~/.nightshift/{repo}/miniverse.{pid,port}`). Update the function signatures to drop the `team` parameter. Update `startServer`, `stopServer`, `isServerRunning` accordingly.
   - Why: A shared server has one PID/port, not one per team.
   - Dependencies: none

4. **Reuse running server** (`lib/start.ts`)
   - Action: Before starting a new server, check if one is already running for this repo using `isServerRunning(repoName)` (updated from step 3). If running, read the port from the port file and use that URL. Skip `startServer()` but still call `registerAgents()` and `installHooks()`. This lets the second `nightshift start --team infra` reuse the server started by the first `nightshift start --team dev`.
   - Why: Multiple teams sharing one server is the core requirement. Without this, each team would still start its own server.
   - Dependencies: steps 1, 3

### Phase 2: Server changes for flat layout

5. **Update server world path methods for flat layout** (`lib/miniverse/server/server.ts`)
   - Action: Three small changes to remove the `worlds/` path segment from world data methods:
     1. `getWorldPath(worldId)` (line 264-268): Change `path.join(publicDir, 'worlds', safeId, 'world.json')` to `path.join(publicDir, safeId, 'world.json')`
     2. `getDefaultWorldId()` (line 588-598): Change scan dir from `path.join(publicDir, 'worlds')` to `publicDir`. The `existsSync(path.join(dir, d, 'world.json'))` filter already prevents non-team directories (universal_assets, core) from being returned.
     3. `loadWorldData(worldId)` (line 600-613): Change `path.join(publicDir, 'worlds', safeId, 'world.json')` to `path.join(publicDir, safeId, 'world.json')`
   - Why: With teams stored at `{publicDir}/{team}/` (flat, no `worlds/` nesting), the server's world-loading paths must match. This also makes the `loadWorldData` path consistent with the `/worlds/` static route's resolution.
   - Dependencies: step 1

6. **Remove world cache** (`lib/miniverse/server/server.ts`)
   - Action: Remove `worldCache` (line 34) and all references to it. In `loadWorldData()`, always read from disk instead of checking the cache. In `writeWorld()`, remove the `this.worldCache.delete(worldId)` line. Remove the `worldCache` field from the constructor.
   - Why: Team world.json files are written externally by `start.ts`, not through the server's `writeWorld()` method. The cache has no invalidation path for external writes, so it would serve stale data when a team restarts with different agents. The files are small (<10KB) and read infrequently — disk reads are fast enough.
   - Dependencies: none

7. **Modify `/api/world` endpoint** (`lib/miniverse/server/server.ts`)
   - Action: Change the handler at line 653 to accept an optional `?team=` query parameter. Use `loadWorldData(team)` (updated in step 5) which now reads from `{publicDir}/{team}/world.json`:
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
   - Why: Reuses the updated `loadWorldData()` and `getDefaultWorldId()` — no new loading logic needed.
   - Dependencies: steps 2, 5

8. **Add `/api/worlds` endpoint** (`lib/miniverse/server/server.ts`)
   - Action: Add a new `GET /api/worlds` route. Reuse the same scan logic as `getDefaultWorldId()` (now scanning `publicDir/` directly after step 5):
     ```typescript
     if (req.method === 'GET' && url.pathname === '/api/worlds') {
       const publicDir = this.publicDir ?? '.';
       const teams: { id: string; agents: number }[] = [];
       try {
         for (const entry of readdirSync(publicDir, { withFileTypes: true })) {
           if (entry.isDirectory() && existsSync(path.join(publicDir, entry.name, 'world.json'))) {
             const world = this.loadWorldData(entry.name) as any;
             teams.push({ id: entry.name, agents: world?.citizens?.length ?? 0 });
           }
         }
       } catch { /* publicDir may not exist yet */ }
       res.writeHead(200, { 'Content-Type': 'application/json' });
       res.end(JSON.stringify({ worlds: teams }));
     }
     ```
     Returns `{ worlds: [] }` when no teams are initialized yet.
   - Why: The frontend needs this to populate the team selector dropdown. Returns empty list gracefully if no teams exist.
   - Dependencies: step 5

### Phase 3: Frontend team selector

9. **Add team selector UI** (`lib/miniverse/server/frontend.ts`)
   - Action: Add a selector bar between the `<h1>` and the `#canvas-container`. HTML:
     ```html
     <div id="team-selector">
       <label for="team-select">Team:</label>
       <select id="team-select"></select>
       <span id="team-empty" style="display:none">No teams available</span>
     </div>
     ```
     CSS: style the selector to match the dark theme (`background: #161b22`, `border: #30363d`, `color: #c9d1d9`). Hide the dropdown and show the `#team-empty` message when `/api/worlds` returns an empty list.
   - Why: The user needs a way to switch between team worlds. The empty state message prevents a confusing blank dropdown.
   - Dependencies: none

10. **Add `getTeam()` helper and wire up team selector logic** (`lib/miniverse/server/frontend.ts`)
    - Action: In the `<script>` section:
      1. Add a `getTeam(agentId)` helper alongside the existing `getRole(agentId)`:
         ```javascript
         function getTeam(agentId) {
           const parts = agentId.split('-');
           return parts.length >= 3 ? parts[1] : null;
         }
         ```
      2. On page load, fetch `GET /api/worlds` to populate the dropdown. If empty, show `#team-empty`.
      3. Check URL query param `?team=` for initial selection; default to first team.
      4. Pass selected team to `startWorld(teamId)` — modify `startWorld()` to fetch `/api/world?team={teamId}` instead of `/api/world`.
      5. On dropdown change: destroy current Miniverse instance (remove canvas from `#canvas-container`, call `destroy()` if available), update URL with `history.replaceState` (not `pushState` — avoids polluting back button), call `startWorld(newTeam)` to re-initialize.
      6. Update static asset paths: the frontend currently uses `basePath = '/worlds'` for tile/prop URLs. Change to `basePath = '/worlds/' + teamId` so tiles resolve to `/worlds/{team}/world_assets/...`.
    - Why: This connects the selector to the world loading pipeline. `getTeam()` centralizes team extraction from agent IDs. `replaceState` keeps URL bookmarkable without polluting navigation history.
    - Dependencies: steps 7, 8, 9

11. **Filter status panel by team** (`lib/miniverse/server/frontend.ts`)
    - Action: In `renderCard()`, use `getTeam(agent.agent)` to extract the team. Only render cards matching the currently selected team. When switching teams, clear the `#status-panel` inner HTML and re-render only matching agents from the `agents` Map.
    - Why: Without filtering, the status panel shows all agents from all teams, which is confusing.
    - Dependencies: step 10

### Phase 4: stopSession guard and tests

12. **Guard `stopSession` against killing shared server** (`lib/start.ts`)
    - Action: Update `stopSession()` (line 268). Before calling `stopServer(repoName)`, check if other nightshift tmux sessions exist for this repo:
      ```typescript
      // Only stop the server if no other team sessions are running
      const sessionPrefix = `nightshift-${repoName}-`;
      try {
        const sessions = execSync('tmux list-sessions -F "#{session_name}"', { encoding: 'utf-8' });
        const otherSessions = sessions.split('\n').filter(s => s.startsWith(sessionPrefix) && s !== session);
        if (otherSessions.length === 0) {
          stopServer(repoName);
        }
      } catch {
        // No tmux server running — safe to stop
        stopServer(repoName);
      }
      ```
    - Why: With a shared server, `nightshift stop --team dev` should only kill the dev tmux session, not the miniverse server that also serves the infra team. The server is only killed when the last team stops.
    - Dependencies: step 3

13. **Update PID/port path tests** (`tests/visualize.test.ts`)
    - Action: Update `getPidFilePath` and `getPortFilePath` test assertions to expect repo-level paths (`~/.nightshift/{repo}/miniverse.{pid,port}`) instead of team-level paths. Remove the `team` parameter from test calls.
    - Why: Step 3 changed the function signatures and paths.
    - Dependencies: step 3

14. **Add world merging tests** (`tests/world-config.test.ts`)
    - Action: Test `mergeWorldConfig()`:
      - Verify merged output contains floor/props/tiles from base world AND citizens/workstations from dynamic config
      - Verify the merge is a property spread (no array concatenation needed — key sets are disjoint)
      - Verify base world properties (gridCols, gridRows, floor, tiles, propImages, props, wanderPoints) are all preserved
      - Verify dynamic config properties (canvas, tileSize, scale, theme, workstations, citizens) are all present
    - Why: The merge is the critical correctness point — wrong merge means broken worlds.
    - Dependencies: step 2

15. **Update start.ts tests** (`tests/start.test.ts`)
    - Action: If there are tests that validate the worldDir path or server startup flow, update them for the new repo-level directory structure (`miniverse/{team}/` instead of `{team}/world/`).
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

## Revision Notes

### Feedback received
Reviewer found 2 critical issues, 2 warnings, and 3 suggestions.

### What changed

1. **Fixed static asset path mismatch (Critical #1)**: Changed directory layout from `{miniverseDir}/worlds/{team}/` to `{miniverseDir}/{team}/` (flat, no `worlds/` nesting). This aligns with the `/worlds/` static route which strips `/worlds/` from URLs and resolves relative to `publicDir`. Added new step 5 to update `getWorldPath`, `loadWorldData`, and `getDefaultWorldId` in server.ts — removing the `worlds/` path segment (3-line change). The overview and step 1 were rewritten to reflect this.

2. **Specified merge algorithm (Critical #2)**: Step 2 now explicitly documents the merge as `{ ...baseWorld, ...dynamicConfig }` with the disjoint key sets enumerated (base: gridCols/floor/tiles/etc., dynamic: canvas/citizens/etc.). Also clarified that the merged file replaces both the old separate `base-world.json` and `world.json`.

3. **Added `stopSession` guard (Warning #1)**: New step 12 adds a tmux session check before killing the shared server. `stopSession` only kills the miniverse server when the last team stops — otherwise it just kills the team's tmux session.

4. **Removed world cache (Warning #2)**: New step 6 removes `worldCache` entirely. World files are small (<10KB) and written externally by `start.ts` — caching has no invalidation path for external writes. Reading from disk each time is simpler and avoids stale data.

5. **Added `getTeam()` helper (Suggestion)**: Step 10 now includes a `getTeam(agentId)` function alongside the existing `getRole()`, centralizing team extraction from agent IDs.

6. **Empty worlds handling (Suggestion)**: Step 9 now includes a `#team-empty` span shown when no teams are available. Step 8's `/api/worlds` endpoint returns `{ worlds: [] }` gracefully.

7. **`history.replaceState` (Suggestion)**: Step 10 now specifies `replaceState` instead of `pushState` for team switch URL updates.

### What was kept and why
- The phased approach structure was kept — it was praised by the reviewer
- Client-side agent filtering (no server-side WebSocket routing) was kept — confirmed pragmatic for expected scale
- Repo-level PID/port approach was kept — the `stopSession` guard addresses the shared-server lifecycle concern
