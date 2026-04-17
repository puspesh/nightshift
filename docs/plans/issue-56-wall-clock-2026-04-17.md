# Plan: Agentville — default wall clock prop showing live current time

> Issue: #56
> Date: 2026-04-17
> Status: draft

## Overview

Add a `wall_clock_basic` decoration to the Agentville starting world that displays live current time (HH:MM) using the user's local timezone. The clock is bundled into the bootstrap inventory (not purchasable), placed on a wall by default, and behaves like any standard decoration — users can un-place and re-place it freely.

## Requirements

- New catalog item: `wall_clock_basic` (type: `decoration`, price: 0, not listed in shop)
- Bundled into starting world inventory via `bootstrapWorld()`
- Placed on a wall in the starting room at a sensible default position
- Prop renders live clock face in HH:MM format, updating every minute
- Uses user's local timezone from `stats.timezone` in world.json
- Un-placing keeps it in inventory; re-placing works like any decoration

## Architecture Changes

- **`lib/agentville/catalog.ts`** — Add `wall_clock_basic` catalog entry
- **`lib/agentville/persistence.ts`** — Add clock to `bootstrapWorld()` starter inventory
- **`lib/agentville/server/server.ts`** — Pass `stats.timezone` in world API response; handle clock prop rendering hint
- **`lib/agentville/server/frontend.ts`** — Add canvas-drawn clock overlay for `wall_clock_basic` props (live time rendering)

## Implementation Steps

### Phase 1: Catalog + Bootstrap (backend, data-only)

#### Tests First
- **Test file**: `tests/agentville-catalog.test.ts` (new)
- **Test cases**:
  - `wall_clock_basic exists in catalog`: assert `getCatalogItem('wall_clock_basic')` returns a decoration with price 0, w: 1, h: 1
  - `wall_clock_basic is not listed in shop`: assert `getCatalogByType('decoration')` includes it but its price is 0 (shop UI filters by price > 0)
  - `wall_clock_basic has no multiplierBonus`: assert multiplierBonus is 0 (a free starter item shouldn't boost earnings)

- **Test file**: `tests/agentville-persistence.test.ts` (existing)
- **Test cases**:
  - `bootstrapWorld includes wall_clock_basic in inventory`: assert inventory contains an item with `catalogId: 'wall_clock_basic'`, `type: 'decoration'`, `placed: true`
  - `bootstrapWorld places clock on north wall`: assert `placedAt` is `{ roomId: 'room_0', x: 10, y: 0 }` (top wall, right of center)
  - `clock has stable starter ID`: assert clock item id is `'starter_clock_1'` (predictable ID for sprite mapping)

#### Implementation Steps

1. **Add `wall_clock_basic` to catalog** (`lib/agentville/catalog.ts`)
   - Action: Add entry to `CATALOG` array in the decorations section:
     ```
     { catalogId: 'wall_clock_basic', name: 'Wall Clock', type: 'decoration',
       price: 0, rarity: 'common', multiplierBonus: 0, w: 1, h: 1,
       description: 'A simple wall clock showing the current time.' }
     ```
   - Why: Issue requires `wall_clock_basic` as a decoration type. Price 0 means it won't appear as purchasable in the shop (shop filters `price > 0`). No multiplier bonus — it's a utility decoration, not an earnings booster.
   - Dependencies: none

2. **Add clock to `bootstrapWorld()` starter inventory** (`lib/agentville/persistence.ts`)
   - Action: Add a third item to the `inventory` array in `bootstrapWorld()`:
     ```typescript
     {
       id: 'starter_clock_1',
       catalogId: 'wall_clock_basic',
       type: 'decoration',
       placed: true,
       placedAt: { roomId: 'room_0', x: 10, y: 0 },
     }
     ```
   - Why: The clock must be present in the starting world for new users. Position `(10, 0)` places it on the north wall, roughly centered in the 20-wide room. Using y=0 signals "wall-mounted" — the top row of the room.
   - Dependencies: Step 1 (catalog entry must exist for sprite mapping)

### Phase 2: Live clock rendering (frontend)

#### Tests First
- **Test file**: `tests/agentville-clock.test.ts` (new — unit tests for time formatting logic)
- **Test cases**:
  - `formatClockTime returns HH:MM in 24h format`: assert `formatClockTime('America/New_York', <known timestamp>)` returns expected string like `'14:30'`
  - `formatClockTime uses timezone correctly`: assert same timestamp with `'Asia/Tokyo'` returns different hour
  - `formatClockTime pads single-digit hours and minutes`: assert `'09:05'` not `'9:5'`
  - `formatClockTime handles UTC`: assert known UTC timestamp returns expected time

- **Test file**: `tests/e2e/game-world.spec.ts` (existing — add cases)
- **Test cases**:
  - `clock prop appears in starting world`: assert world API response includes a prop with `catalogId: 'wall_clock_basic'`
  - `world API includes timezone in response`: assert `/api/worlds/agentville` response contains `timezone` field

#### Implementation Steps

1. **Extract `formatClockTime` utility** (`lib/agentville/clock.ts` — new file)
   - Action: Create a small pure function:
     ```typescript
     export function formatClockTime(timezone: string, now?: Date): string {
       const date = now ?? new Date();
       const h = date.toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: timezone });
       const m = date.toLocaleString('en-US', { minute: '2-digit', timeZone: timezone });
       return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
     }
     ```
   - Why: Isolating time formatting into a pure, testable function keeps the rendering code simple and makes timezone logic independently verifiable.
   - Dependencies: none

2. **Include `timezone` in world API response** (`lib/agentville/server/server.ts`)
   - Action: In the `GET /api/worlds/agentville` handler (around line 875-938), after merging inventory props into `worldData`, also inject:
     ```typescript
     if (this.gameState?.stats?.timezone) {
       (worldData as any).timezone = this.gameState.stats.timezone;
     }
     ```
   - Why: The frontend needs the user's timezone to render the clock. The world API response is the natural transport — it already carries all data the frontend needs to render the scene.
   - Dependencies: none

3. **Add clock sprite fallback mapping** (`lib/agentville/server/server.ts`)
   - Action: In the `inventoryProps` → `propImages` mapping block (~line 918-930), add `wall_clock_basic` to the catalog-to-sprite mapping so it resolves to a placeholder sprite:
     ```typescript
     wall_clock_basic: 'wall_clock',
     ```
     Also ensure a small static clock sprite exists at `worlds/agentville/world_assets/props/wall_clock.png` (a simple 32x32 pixel-art clock face).
   - Why: The prop system requires every prop to have a sprite image. Even though we'll draw the live time on top, the base sprite provides the clock face/frame.
   - Dependencies: none

4. **Render live clock text overlay on canvas** (`lib/agentville/server/frontend.ts`)
   - Action: In the frontend JavaScript (the inline `<script>` block), after the engine initializes and the world loads:
     - Store the `timezone` from the world API response
     - Find the clock prop by `catalogId === 'wall_clock_basic'` in the props array
     - Add a `RenderLayer` to the renderer (via `engine.addLayer()`) at order 6 (just above props at order 5) that:
       - Every frame, draws the current HH:MM text centered on the clock prop's tile position
       - Uses `ctx.fillText()` with a small pixel font
       - Only recomputes the time string every 60 seconds (cache with minute check)
     - Approximate rendering code:
       ```javascript
       let cachedTime = '';
       let lastMinute = -1;
       engine.addLayer({
         order: 6,
         render(ctx, delta) {
           const now = new Date();
           const minute = now.getMinutes();
           if (minute !== lastMinute) {
             cachedTime = new Date().toLocaleTimeString('en-GB', {
               hour: '2-digit', minute: '2-digit', hour12: false,
               timeZone: worldTimezone
             });
             lastMinute = minute;
           }
           // Draw at clock prop position
           ctx.save();
           ctx.font = '5px monospace';
           ctx.fillStyle = '#1a1a2e';
           ctx.textAlign = 'center';
           ctx.textBaseline = 'middle';
           const cx = (clockProp.x + clockProp.w / 2) * tileSize;
           const cy = (clockProp.y + clockProp.h / 2) * tileSize;
           ctx.fillText(cachedTime, cx, cy);
           ctx.restore();
         }
       });
       ```
   - Why: Using the engine's `RenderLayer` system is the existing pattern for adding visual overlays (Scene=0, Props=5, Citizens=10, Particles=20). Order 6 draws just above the prop sprite so the time text appears on the clock face. Caching per-minute avoids unnecessary string allocation every frame.
   - Dependencies: Steps 2, 3

5. **Create clock sprite asset** (`worlds/agentville/world_assets/props/wall_clock.png`)
   - Action: Create a 32x32 pixel-art clock face sprite. Simple round clock with frame, tick marks at 12/3/6/9. No hands (the live text replaces analog display). Background should be light/white to contrast with dark time text.
   - Why: The prop rendering pipeline requires a sprite image. This provides the visual frame around the digital time display.
   - Dependencies: none

### Phase 3: Existing world migration (edge case)

#### Tests First
- **Test file**: `tests/agentville-persistence.test.ts` (existing)
- **Test cases**:
  - `existing world without clock gets clock added on load`: assert that when `loadWorld()` returns a world missing `wall_clock_basic` in inventory, a migration helper adds it
  - `existing world WITH clock is not duplicated`: assert no duplicate clock items after migration
  - `migrated clock is placed at default position`: assert placedAt matches the bootstrap default

#### Implementation Steps

1. **Add post-load migration for existing worlds** (`lib/agentville/persistence.ts`)
   - Action: Create and export a `ensureStarterItems(world: AgentvilleWorld): boolean` function that checks if `wall_clock_basic` exists in inventory. If not, pushes the default clock item (same as bootstrap). Returns `true` if changes were made.
   - Why: Existing users who bootstrapped before this feature won't have the clock. Rather than forcing a full re-bootstrap, a targeted migration adds just the missing item. This is idempotent — safe to run on every load.
   - Dependencies: Phase 1 complete

2. **Wire migration into server startup** (`lib/agentville/server/cli.ts`)
   - Action: After `loadWorld()` succeeds and before creating the server, call `ensureStarterItems(world)`. If the function returns `true`, trigger a save.
   - Why: Server startup is the single entry point for world loading — placing the migration here ensures all users get the clock regardless of when they first ran Agentville.
   - Dependencies: Step 1

## Testing Strategy

- **Approach**: Test-Driven Development (TDD) — tests written BEFORE implementation in each phase
- **Unit tests**:
  - `tests/agentville-catalog.test.ts` — catalog entry correctness
  - `tests/agentville-persistence.test.ts` — bootstrap inventory, migration
  - `tests/agentville-clock.test.ts` — time formatting with timezone
- **Integration tests**: N/A (server startup flow tested implicitly via persistence tests)
- **E2E tests**: `tests/e2e/game-world.spec.ts` — clock prop visible in world API, timezone included
- **Test infrastructure**: Existing patterns — `node:test` + `assert/strict`, temp dirs for persistence, `bootstrapWorld('UTC')` for fresh world state. Playwright for E2E.

## Assumptions

1. **Price 0 hides from shop** — I'm assuming the shop UI filters items with `price > 0` so that `wall_clock_basic` doesn't appear as purchasable. If the shop shows all catalog items regardless of price, we may need a `hidden: true` or `bundled: true` flag on the catalog item. **Reviewer should validate shop filtering logic.**
2. **y=0 is valid wall position** — The starting room grid is 20x11. Placing at `y: 0` puts the clock on the topmost row which represents the "north wall". If the tile map has deadspace at y=0 (some rooms use the first row as a wall boundary), we may need `y: 1` instead. **Reviewer should check base-world.json tile layout.**
3. **`toLocaleTimeString` available in browser** — The frontend runs in a Chromium browser via Playwright/electron. `toLocaleTimeString` with `timeZone` option is widely supported. No polyfill needed.
4. **Clock sprite can be basic placeholder** — Since the live rendering draws digital time, the sprite just needs to be a simple clock frame. A more polished sprite can come in a future clock-skins feature (explicitly out of scope per issue).
5. **No schema version bump needed** — Adding an item to inventory doesn't change the schema structure. The `ensureStarterItems` migration is data-level, not schema-level.

## Risks & Mitigations

- **Risk**: Existing users with custom inventory layouts may get a clock placed at a position that overlaps other items.
  - Mitigation: The `ensureStarterItems` migration places the clock at `(10, 0)` — a wall position unlikely to conflict with floor-placed items. If overlap occurs, users can un-place and re-place it.

- **Risk**: `toLocaleTimeString` timezone formatting inconsistencies across environments (Node.js SSR vs browser).
  - Mitigation: The clock only renders client-side in the canvas. The `formatClockTime` utility (tested with known timestamps and timezones) is a safety net if we ever need server-side time.

- **Risk**: The 5px monospace font may be illegible at certain zoom levels or canvas scales.
  - Mitigation: Font size is expressed in canvas (non-scaled) pixels. At the default 2x scale, 5px canvas = 10px screen — legible for HH:MM. Can be tuned during implementation.
