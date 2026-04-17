# Global Persistent World Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make world.json a single global persistent artifact — not regenerated per team on start. Desks and items come from game state purchases/placement. Citizens auto-spawn dynamically. Coordinates are unified across both systems.

**Architecture:** The server merges two data sources when serving `/api/world`: (1) base world.json (static environment: tiles, floor layout, kitchen, windows, wander points, prop images) and (2) game state inventory (user-placed desks, decorations). The frontend renders from this single merged response. `setupVisualization` in start.ts stops generating/overwriting world.json — it only copies the base world once on first run and then starts the server.

**Tech Stack:** TypeScript, Node.js HTTP server, Playwright E2E tests

---

## Current State (Problems)

1. **start.ts:195-206** generates desk/chair props per team, merges with base-world.json, and **overwrites** `~/.nightshift/agentville/<repo>/<team>/world.json` on every `nightshift start`
2. **Coordinate mismatch:** base world uses 20x11 tile grid (fractional x,y). Game state `PlacedAt` uses integer coords in a 12x8 room. These are different grids.
3. **Two render paths** in frontend: `startWorldFromGameState` (flat floor + game state inventory) vs `startLegacyWorld` (world.json tiles). They don't merge.
4. **Citizens baked into world.json** by `generateWorldConfig` — should be auto-spawned dynamically by the engine instead.

## Target State

- **One global world.json** at `~/.nightshift/agentville/world.json` — copied from base-world.json on first init, never overwritten on start
- **Game state coordinates = world grid coordinates** — `PlacedAt.x`/`.y` are in the 20x11 tile grid
- **Server merges** base world + placed inventory into a single `/api/world` response
- **Frontend has one render path** — `startLegacyWorld` (now the only path), enhanced to also load game state for economy HUD
- **Citizens are never in world.json** — all auto-spawned by engine via WebSocket
- **Expansion = grid resize** — `expand_room` enlarges the single room (and world grid), not adds rooms

---

### Task 1: Move world.json to global location, stop regenerating, remove dead code

**Files:**
- Modify: `lib/start.ts:175-237` (rewrite setupVisualization, remove generateWorldConfig/mergeWorldConfig imports)
- Modify: `lib/agentville/server/server.ts` (findWorldId, loadWorldData, /api/world handler)
- Delete or gut: `lib/world-config.ts` (generateWorldConfig, mergeWorldConfig no longer called)

**Step 1: Rewrite `setupVisualization` in start.ts**

Remove `generateWorldConfig` and `mergeWorldConfig` calls and their imports. Remove `import { generateWorldConfig, mergeWorldConfig } from './world-config.js';`. Replace the function body:

```typescript
async function setupVisualization(
  team: string, agents: AgentEntry[], repoRoot: string,
  repoName: string, citizenOverrides: CitizenOverrides, vizPort: number,
): Promise<string | null> {
  let vizUrl: string | null = null;
  try {
    const vizDataDir = join(homedir(), '.nightshift', 'agentville');
    const baseWorldDir = join(__dirname, '..', 'worlds', 'agentville');

    // Copy base world to global location (only if not already present)
    const globalWorldJson = join(vizDataDir, 'world.json');
    mkdirSync(vizDataDir, { recursive: true });
    if (!existsSync(globalWorldJson) && existsSync(join(baseWorldDir, 'base-world.json'))) {
      execSync(`cp "${join(baseWorldDir, 'base-world.json')}" "${globalWorldJson}"`, { stdio: 'pipe' });
    }

    // Always sync assets (new versions may have updated sprites/tiles)
    if (existsSync(baseWorldDir)) {
      execSync(`cp -R "${baseWorldDir}/world_assets" "${vizDataDir}/" 2>/dev/null || true`, { stdio: 'pipe' });
      execSync(`cp -R "${baseWorldDir}/universal_assets" "${vizDataDir}/" 2>/dev/null || true`, { stdio: 'pipe' });
    }

    const coreDir = join(__dirname, 'agentville', 'core');
    mkdirSync(join(vizDataDir, '..', 'core'), { recursive: true });
    if (existsSync(join(coreDir, 'agentville-core.js'))) {
      execSync(`cp "${coreDir}/agentville-core.js" "${join(vizDataDir, '..', 'core')}/" 2>/dev/null || true`, { stdio: 'pipe' });
    }

    const result = startAgentville(vizPort, vizDataDir);
    if (!result) {
      console.warn(chalk.yellow('  Warning: Could not start visualization server. Run `bun run build` first.'));
      throw new Error('Server start failed');
    }
    const healthy = await waitForAgentville(result.url, 10000);
    if (!healthy) {
      console.warn(chalk.yellow('  Warning: Visualization server did not become healthy'));
      throw new Error('Server health check failed');
    }

    await registerAgentvilleAgents(result.url, agents, team, citizenOverrides);
    vizUrl = result.url;

    installHooks(repoName, team, agents, result.url);
  } catch (err) {
    if (!vizUrl) {
      console.warn(chalk.yellow(`  Warning: Visualization failed to start: ${(err as Error).message}`));
    }
  }
  return vizUrl;
}
```

**Step 2: Simplify `findWorldId` in server.ts**

World.json is now at publicDir root. Don't return `'.'` (breaks sanitizers). Instead, return `null` to signal "root" and handle it in loadWorldData and /api/world directly:

```typescript
private findWorldId(teamFilter?: string): string | null {
  const publicDir = this.publicDir ?? './public';
  if (!existsSync(publicDir)) return null;
  // Legacy: scan for repo/team/world.json
  const safeTeam = teamFilter?.replace(/[^a-zA-Z0-9_-]/g, '');
  try {
    for (const repoEntry of readdirSync(publicDir, { withFileTypes: true })) {
      if (!repoEntry.isDirectory()) continue;
      const repoPath = path.join(publicDir, repoEntry.name);
      if (safeTeam) {
        if (existsSync(path.join(repoPath, safeTeam, 'world.json'))) {
          return repoEntry.name + '/' + safeTeam;
        }
      } else {
        for (const teamEntry of readdirSync(repoPath, { withFileTypes: true })) {
          if (teamEntry.isDirectory() && existsSync(path.join(repoPath, teamEntry.name, 'world.json'))) {
            return repoEntry.name + '/' + teamEntry.name;
          }
        }
      }
    }
    return null;
  } catch { return null; }
}
```

**Step 3: Add `loadGlobalWorld` helper and update `/api/world` handler**

Instead of overloading findWorldId/loadWorldData with special cases, add a direct method:

```typescript
private loadGlobalWorld(): Record<string, unknown> | null {
  const publicDir = this.publicDir ?? './public';
  const worldPath = path.join(publicDir, 'world.json');
  if (!existsSync(worldPath)) return null;
  try {
    return JSON.parse(readFileSync(worldPath, 'utf-8'));
  } catch { return null; }
}
```

Update `/api/world` handler to check global first, then legacy:

```typescript
if (req.method === 'GET' && url.pathname === '/api/world') {
  const repo = url.searchParams.get('repo');
  const team = url.searchParams.get('team');
  let worldData: Record<string, unknown> | null = null;
  
  if (repo && team) {
    worldData = this.loadWorldData(repo + '/' + team) as Record<string, unknown> | null;
  } else if (team) {
    const teamWorldId = this.findWorldId(team);
    worldData = teamWorldId ? this.loadWorldData(teamWorldId) as Record<string, unknown> | null : null;
  }
  
  // Fall back to global world.json at publicDir root
  if (!worldData) {
    worldData = this.loadGlobalWorld();
  }
  
  if (worldData) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(worldData));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No world data' }));
  }
  return;
}
```

Note: no worldId in response — frontend doesn't need it when world.json is at root. Asset paths relative to world.json location = relative to publicDir root. Frontend basePath = `/worlds` (no subdirectory).

**Step 4: Delete dead code from `lib/world-config.ts`**

Run: `grep -r "generateWorldConfig\|mergeWorldConfig\|from.*world-config" lib/ tests/`

If no callers remain after the start.ts edit, delete the file entirely.

**Step 5: Run tests**

Run: `npx tsc --noEmit && npm run build && npx playwright test tests/e2e/game-world.spec.ts`
Expected: All 18 tests pass

**Step 6: Commit**

```bash
git add lib/start.ts lib/agentville/server/server.ts lib/world-config.ts
git commit -m "refactor: make world.json global and persistent, remove world config generation"
```

---

### Task 2: Align game state coordinates with world grid

**Files:**
- Modify: `lib/agentville/persistence.ts` (bootstrapWorld — room dimensions + starter desk coords)

**Step 1: Update `bootstrapWorld`**

Change room to 20x11 (matching base world grid). Move starter desks to the office zone (cols 5+, avoiding kitchen/lounge area):

```typescript
// In bootstrapWorld:
rooms: [{
  id: 'room_0',
  name: 'Main Office',
  width: 20,
  height: 11,
  style: 'basic',
}],
// ...
inventory: [
  {
    id: 'starter_desk_1',
    catalogId: 'desk_basic',
    type: 'desk',
    placed: true,
    placedAt: { roomId: 'room_0', x: 7, y: 4 },
  },
  {
    id: 'starter_desk_2',
    catalogId: 'desk_basic',
    type: 'desk',
    placed: true,
    placedAt: { roomId: 'room_0', x: 13, y: 4 },
  },
],
```

**Step 2: Run tests**

Run: `npx tsc --noEmit && npx playwright test tests/e2e/game-world.spec.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add lib/agentville/persistence.ts
git commit -m "fix: align game state room dimensions and desk coords with 20x11 world grid"
```

---

### Task 3: Add prop dimensions to catalog & merge inventory into /api/world

**Files:**
- Modify: `lib/agentville/catalog.ts` (add `w`/`h` to CatalogItem)
- Modify: `lib/agentville/server/server.ts` (`/api/world` handler — merge logic)

**Step 1: Add `w` and `h` fields to `CatalogItem`**

```typescript
export interface CatalogItem {
  catalogId: string;
  name: string;
  type: 'desk' | 'facility' | 'decoration' | 'cosmetic' | 'consumable' | 'expansion';
  price: number;
  rarity: 'common' | 'rare' | 'legendary';
  category?: string;
  multiplierBonus?: number;
  description: string;
  w?: number;  // prop width in tiles (default: 1)
  h?: number;  // prop height in tiles (default: 1)
}
```

Add dimensions to existing catalog entries that need them:

```typescript
// Desks — 3x3 (desk + chair area)
{ catalogId: 'desk_basic', ..., w: 3, h: 3 },
{ catalogId: 'desk_dual_monitor', ..., w: 3, h: 3 },
{ catalogId: 'desk_standing', ..., w: 3, h: 3 },
{ catalogId: 'desk_corner_office', ..., w: 3, h: 3 },

// Facilities — 2x2
{ catalogId: 'facility_water_cooler', ..., w: 1, h: 2 },
{ catalogId: 'facility_coffee_machine', ..., w: 1, h: 2 },
{ catalogId: 'facility_vending_machine', ..., w: 1, h: 2 },
{ catalogId: 'facility_kitchen', ..., w: 2, h: 2 },
{ catalogId: 'facility_couch', ..., w: 2, h: 1 },
{ catalogId: 'facility_nap_pod', ..., w: 2, h: 1 },

// Decorations — 1x1 by default (no w/h needed)
```

**Step 2: Add merge logic in the `/api/world` handler**

After loading worldData in the `/api/world` handler, overlay placed game state items:

```typescript
// After worldData is loaded and before sending response:
if (worldData && this.gameState) {
  const existingProps = (worldData.props as any[]) || [];

  const inventoryProps = this.gameState.inventory
    .filter(item => item.placed && item.placedAt)
    .map(item => {
      const catalog = getCatalogItem(item.catalogId);
      const w = catalog?.w ?? 1;
      const h = catalog?.h ?? 1;
      return {
        id: item.catalogId,
        instanceId: item.id,
        x: item.placedAt!.x,
        y: item.placedAt!.y,
        w,
        h,
        layer: 'below' as const,
        fromInventory: true,
        anchors: item.type === 'desk' ? [{
          name: 'desk_' + item.id,
          ox: 1,
          oy: 1.5,
          type: 'work',
        }] : [],
      };
    });

  worldData.props = [...existingProps, ...inventoryProps];
}
```

Import `getCatalogItem` at top of server.ts if not already imported.

**Step 3: Run tests**

Run: `npx tsc --noEmit && npx playwright test tests/e2e/game-world.spec.ts`
Expected: All tests pass

**Step 4: Commit**

```bash
git add lib/agentville/catalog.ts lib/agentville/server/server.ts
git commit -m "feat: add prop dimensions to catalog, merge inventory into /api/world"
```

---

### Task 4: Simplify frontend to single render path & fix basePath

**Files:**
- Modify: `lib/agentville/server/frontend.ts`

**Step 1: Update `startWorld()` to always use `/api/world`**

```javascript
async function startWorld() {
  // Load game state for economy HUD
  let gameStateData = null;
  try {
    const gsRes = await fetch('/api/game-state');
    if (gsRes.ok) {
      gameStateData = await gsRes.json();
      gameState = gameStateData;
    }
  } catch { /* no game state */ }

  if (gameStateData) {
    currentCoins = gameStateData.coins || 0;
    document.getElementById('hud-coins').textContent = formatNumber(currentCoins);
    updateHudStreak(gameStateData.stats?.streakDays || 0);
  }

  // Render world from /api/world (includes base world + placed inventory)
  try {
    const wRes = await fetch('/api/world');
    if (wRes.ok) {
      const wd = await wRes.json();
      if (!wd.error) {
        await startLegacyWorld(wd);
        return;
      }
    }
  } catch { /* no world data */ }

  console.warn('No world data available — UI will show status panel only');
}
```

**Step 2: Fix basePath in `startLegacyWorld`**

When world.json is at publicDir root, there's no worldId subdirectory. Asset paths in world.json (e.g. `world_assets/tiles/main_floor.png`) are relative to publicDir. The `/worlds/` handler strips the prefix and serves from publicDir. So basePath should be `/worlds`:

```javascript
// Replace the basePath line:
const basePath = worldData.worldId ? '/worlds/' + worldData.worldId : '/worlds';
```

**Step 3: Remove `worldStateToRenderConfig` and `startWorldFromGameState`**

Delete the entire `worldStateToRenderConfig` function (~lines 768-851) and `startWorldFromGameState` function (~lines 1166-1227). They are no longer called.

**Step 4: Run tests**

Run: `npx tsc --noEmit && npm run build && npx playwright test tests/e2e/game-world.spec.ts`
Expected: All 18 tests pass

**Step 5: Commit**

```bash
git add lib/agentville/server/frontend.ts
git commit -m "refactor: single render path via /api/world, remove game-state-only renderer"
```

---

### Task 5: Make expansion = grid resize (not add rooms)

**Files:**
- Modify: `lib/agentville/shop.ts` (handleExpansion)

**Step 1: Change `expand_room` to resize the single room instead of adding rooms**

```typescript
function handleExpansion(world: AgentvilleWorld, catalogId: string): void {
  const floor = world.world.floors[0];
  if (!floor || !floor.rooms[0]) return;
  const room = floor.rooms[0];

  if (catalogId === 'expand_room') {
    // Expand the world grid — add 5 columns
    room.width += 5;
  } else if (catalogId === 'expand_floor') {
    // Expand the world grid — add 5 rows
    room.height += 5;
  }
  // The engine's resizeGrid() will pick up the new dimensions on next /api/world load
}
```

Note: the engine already has `resizeGrid(newCols, newRows)` (agentville-core index.ts:330). The frontend would need to call this when it detects the room dimensions differ from the current grid. This can be wired up as a follow-up — for now, a page refresh after purchasing expansion will load the new dimensions.

**Step 2: Run tests**

Run: `npx tsc --noEmit && npx playwright test tests/e2e/game-world.spec.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add lib/agentville/shop.ts
git commit -m "feat: expansion purchases resize world grid instead of adding rooms"
```

---

### Task 6: Verify end-to-end

**Step 1: Manual verification checklist**

With the server running:

1. `nightshift start dev` — world loads with base world tiles, props, wander points
2. Agent cards appear (6 team agents)
3. Citizens auto-spawn on canvas (no citizens baked in world.json)
4. Open Shop → buy a desk → place at (10, 6) → desk appears as prop on canvas
5. Restart server → desk still appears (persisted in game state, merged into /api/world)
6. Unplace desk → desk disappears from canvas
7. Start a second team → agents auto-spawn, same world, no coordinate collision

**Step 2: Run full test suite**

Run: `npx playwright test tests/e2e/game-world.spec.ts`
Expected: All 18 tests pass

**Step 3: Commit (if any test fixes needed)**

---

## Coordinate System Summary

After this change, there is ONE coordinate system:

| What | Grid | Coords |
|------|------|--------|
| Base world floor tiles | 20x11 | integer row,col |
| Base world props | 20x11 | fractional x,y (sub-tile) |
| Game state `PlacedAt` | 20x11 | x,y (same grid as props) |
| Wander points | 20x11 | fractional x,y |
| Game state room size | 20x11 | `width: 20, height: 11` |
| Expansion | +5 cols or +5 rows | room.width/height grows, grid resizes |

## What Stays the Same

- Game state persistence (`~/.agentville/world.json`) — coins, inventory, agents, stats
- Shop API (`/api/shop/buy`, `/api/shop/place`, `/api/shop/unplace`)
- Auto-spawn in engine (citizens for new agents)
- Agent registration via `/api/events`
- Hook system (`ns-heartbeat.sh`)

## Design Notes

- **`roomId`** — kept in `PlacedAt` for future multi-room support but currently all items go to `room_0`. The visual world treats everything as one grid.
- **Prop dimensions** — stored in catalog (`w`/`h` fields). Server looks up catalog when merging inventory into /api/world. Items without explicit dimensions default to 1x1.
- **Collision detection** — currently point-only (`placeItem` checks exact x,y). Does not account for prop dimensions. Known limitation for future fix.
