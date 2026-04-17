# Plan: Agentville — default wall clock prop showing live current time

> Issue: #56
> Date: 2026-04-17
> Status: revised

## Overview

Add a `wall_clock_basic` decoration to the Agentville starting world that displays live current time (HH:MM) using the user's local timezone. The clock is bundled into the bootstrap inventory (not purchasable), placed on a wall by default, and behaves like any standard decoration — users can un-place and re-place it freely.

## Requirements

- New catalog item: `wall_clock_basic` (type: `decoration`, price: 0, `hidden: true` — excluded from shop)
- Add `hidden` boolean field to `CatalogItem` interface to support bundled-only items
- Bundled into starting world inventory via `bootstrapWorld()`
- Placed on a wall in the starting room at a sensible default position (y: 1, lower wall row)
- Prop renders live clock face in HH:MM format, updating every minute
- Uses user's local timezone from `stats.timezone` in world.json
- Un-placing keeps it in inventory; re-placing works like any decoration

## Architecture Changes

- **`lib/agentville/catalog.ts`** — Add `hidden` field to `CatalogItem` interface; add `wall_clock_basic` catalog entry with `hidden: true`
- **`lib/agentville/server/server.ts`** — Update shop API endpoints (`/api/catalog`, `/api/catalog/:type`) to filter out `hidden` items; include `timezone` in `/api/world` response
- **`lib/agentville/persistence.ts`** — Add clock to `bootstrapWorld()` starter inventory at position `(10, 1)`
- **`lib/agentville/server/frontend.ts`** — Add canvas-drawn clock overlay for `wall_clock_basic` props (live time rendering) using shared `formatClockTime` logic at render layer order 16

## Implementation Steps

### Phase 1: Catalog + Bootstrap (backend, data-only)

#### Tests First
- **Test file**: `tests/agentville-catalog.test.ts` (new)
- **Test cases**:
  - `wall_clock_basic exists in catalog`: assert `getCatalogItem('wall_clock_basic')` returns a decoration with price 0, w: 1, h: 1, `hidden: true`
  - `wall_clock_basic excluded from shop results`: assert `getShopCatalog('decoration')` (or equivalent filtered call) does NOT include `wall_clock_basic` — hidden items must be filtered out
  - `non-hidden items still appear in shop`: assert `getShopCatalog('decoration')` includes at least one non-hidden decoration (sanity check the filter doesn't exclude everything)
  - `wall_clock_basic has no multiplierBonus`: assert multiplierBonus is 0 (a free starter item shouldn't boost earnings)

- **Test file**: `tests/agentville-persistence.test.ts` (existing)
- **Test cases**:
  - `bootstrapWorld includes wall_clock_basic in inventory`: assert inventory contains an item with `catalogId: 'wall_clock_basic'`, `type: 'decoration'`, `placed: true`
  - `bootstrapWorld places clock on wall row`: assert `placedAt` is `{ roomId: 'room_0', x: 10, y: 1 }` (lower wall row, visually centered on wall band)
  - `clock has stable starter ID`: assert clock item id is `'starter_clock_1'` (predictable ID for sprite mapping)

#### Implementation Steps

1. **Add `hidden` field to `CatalogItem` and update shop endpoints** (`lib/agentville/catalog.ts`, `lib/agentville/server/server.ts`)
   - Action:
     - In `catalog.ts`, add `hidden?: boolean` to the `CatalogItem` interface.
     - Add `wall_clock_basic` entry to `CATALOG` array in the decorations section:
       ```
       { catalogId: 'wall_clock_basic', name: 'Wall Clock', type: 'decoration',
         price: 0, rarity: 'common', multiplierBonus: 0, w: 1, h: 1,
         hidden: true,
         description: 'A simple wall clock showing the current time.' }
       ```
     - In `server.ts`, update both shop API endpoints (`GET /api/catalog` ~line 1199 and `GET /api/catalog/:type` ~line 1210) to filter out hidden items: add `.filter(i => !i.hidden)` to the catalog results before returning them.
   - Why: The shop API currently returns ALL catalog items with no filtering. Without the `hidden` flag, users would see a free clock in the shop and could "buy" duplicates for 0 coins, violating the "bundled starter only" requirement. The `hidden` field is a generic mechanism — useful for any future bundled/promotional items.
   - Dependencies: none

2. **Add clock to `bootstrapWorld()` starter inventory** (`lib/agentville/persistence.ts`)
   - Action: Add a third item to the `inventory` array in `bootstrapWorld()`:
     ```typescript
     {
       id: 'starter_clock_1',
       catalogId: 'wall_clock_basic',
       type: 'decoration',
       placed: true,
       placedAt: { roomId: 'room_0', x: 10, y: 1 },
     }
     ```
   - Why: The clock must be present in the starting world for new users. Position `(10, 1)` places it on the lower wall row — visually centered on the north wall band rather than at the very top edge (y=0). Both y=0 and y=1 are "main_wall" tiles, but y=1 is more natural for a wall-mounted object.
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
   - Action: Create a small pure function that will be used by BOTH tests and the frontend:
     ```typescript
     export function formatClockTime(timezone: string, now?: Date): string {
       const date = now ?? new Date();
       return date.toLocaleTimeString('en-GB', {
         hour: '2-digit', minute: '2-digit', hour12: false,
         timeZone: timezone
       });
     }
     ```
   - Why: Single source of truth for time formatting. This function will be inlined into the frontend `<script>` block (Step 4) so the same logic runs client-side. Unit tests validate it server-side, and the frontend uses the identical code path — no divergence between tested and rendered logic.
   - Dependencies: none

2. **Include `timezone` in `/api/world` response** (`lib/agentville/server/server.ts`)
   - Action: In the `GET /api/world` handler (~line 875-938), after merging inventory props into `worldData`, inject the timezone:
     ```typescript
     if (this.gameState?.stats?.timezone) {
       (worldData as any).timezone = this.gameState.stats.timezone;
     }
     ```
   - Why: The frontend needs the user's timezone to render the clock. Note: `timezone` is already available via `/api/game-state` (part of `AgentvilleWorld.stats`), but including it in the world response avoids a separate fetch — the frontend already calls `/api/world` to render the scene. This is a convenience duplication, not a new data source.
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
     - Inline the `formatClockTime` function (identical to `lib/agentville/clock.ts`) into the `<script>` block so both server tests and client rendering use the same logic
     - Store the `timezone` from the world API response
     - Find the clock prop by `catalogId === 'wall_clock_basic'` in the props array
     - Add a `RenderLayer` to the renderer (via `engine.addLayer()`) at **order 16** (just above `renderAbove` at order 15) so the clock text renders on top of all prop sprites
     - Only recompute the time string every 60 seconds (cache with minute check)
     - Approximate rendering code:
       ```javascript
       // Inline from lib/agentville/clock.ts — keep in sync
       function formatClockTime(timezone, now) {
         const date = now || new Date();
         return date.toLocaleTimeString('en-GB', {
           hour: '2-digit', minute: '2-digit', hour12: false,
           timeZone: timezone
         });
       }

       let cachedTime = '';
       let lastMinute = -1;
       engine.addLayer({
         order: 16,
         render(ctx, delta) {
           const now = new Date();
           const minute = now.getMinutes();
           if (minute !== lastMinute) {
             cachedTime = formatClockTime(worldTimezone, now);
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
   - Why: The actual render layer system uses order 5 (`renderBelow`) and order 15 (`renderAbove`). Using order 16 places the clock text above ALL prop sprites, ensuring it's never visually obscured by furniture. The `formatClockTime` function is inlined from `clock.ts` to maintain a single source of truth — the unit tests validate the same formatting logic that runs in the browser. A comment marks the inline for sync.
   - Dependencies: Steps 1, 2, 3

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
  - `migrated clock is placed at default position`: assert placedAt is `{ roomId: 'room_0', x: 10, y: 1 }` matching the bootstrap default

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

1. ~~**Price 0 hides from shop**~~ **RESOLVED**: Shop API returns all items unfiltered. Plan now adds `hidden: boolean` field to `CatalogItem` and filters hidden items in shop endpoints.
2. ~~**y=0 is valid wall position**~~ **RESOLVED**: Changed to `y: 1` (lower wall row) — more visually natural for a wall-mounted object, centered on the wall band rather than at the top edge.
3. **`toLocaleTimeString` available in browser** — The frontend runs in a Chromium browser via Playwright/electron. `toLocaleTimeString` with `timeZone` option is widely supported. No polyfill needed.
4. **Clock sprite can be basic placeholder** — Since the live rendering draws digital time, the sprite just needs to be a simple clock frame. A more polished sprite can come in a future clock-skins feature (explicitly out of scope per issue).
5. **No schema version bump needed** — Adding an item to inventory doesn't change the schema structure. The `ensureStarterItems` migration is data-level, not schema-level.
6. **`formatClockTime` inlined in frontend** — The same function exists in `lib/agentville/clock.ts` (tested server-side) and is copy-inlined into the frontend `<script>` block. A `// keep in sync` comment marks the duplication. If time formatting ever needs updating, both locations must change together.

## Risks & Mitigations

- **Risk**: Existing users with custom inventory layouts may get a clock placed at a position that overlaps other items.
  - Mitigation: The `ensureStarterItems` migration places the clock at `(10, 1)` — a wall position unlikely to conflict with floor-placed items. If overlap occurs, users can un-place and re-place it.

- **Risk**: `toLocaleTimeString` timezone formatting inconsistencies across environments (Node.js SSR vs browser).
  - Mitigation: The `formatClockTime` function is tested server-side in `clock.test.ts` and inlined identically in the frontend. Both use the same `toLocaleTimeString('en-GB', ...)` call. If a divergence is found, the unit tests catch it at the logic level and E2E tests catch rendering issues.

- **Risk**: The 5px monospace font may be illegible at certain zoom levels or canvas scales.
  - Mitigation: Font size is expressed in canvas (non-scaled) pixels. At the default 2x scale, 5px canvas = 10px screen — legible for HH:MM. Can be tuned during implementation.

- **Risk**: `formatClockTime` duplication between `clock.ts` and frontend inline may drift.
  - Mitigation: Comment in frontend marks the inline as `// keep in sync with lib/agentville/clock.ts`. The function is trivial (3 lines). If it grows complex, refactor to a shared module in a follow-up.

## Revision Notes

**Revision 1** (2026-04-17) — Addressing reviewer feedback from @ns-dev-reviewer.

### CRITICAL — Shop filtering (fixed)

- **Problem**: Plan assumed shop filters `price > 0`. Reviewer verified shop API (`/api/catalog`, `/api/catalog/:type`) returns ALL catalog items with no filtering. Users would see a free clock in the shop and buy duplicates.
- **Fix**: Added `hidden?: boolean` field to `CatalogItem` interface. Set `hidden: true` on `wall_clock_basic`. Updated Phase 1 Step 1 to modify both `catalog.ts` (schema + entry) and `server.ts` (shop endpoint filtering). Updated tests to assert hidden items are excluded from shop results.

### WARNING — Render layer ordering (fixed)

- **Problem**: Plan stated layer ordering as "Scene=0, Props=5, Citizens=10, Particles=20" and proposed order 6 for the clock. Actual codebase uses only two layers: order 5 (`renderBelow`) and order 15 (`renderAbove`). Order 6 would place clock text between the two prop layers, potentially behind furniture sprites.
- **Fix**: Changed clock layer to **order 16** (above `renderAbove` at 15). Updated Phase 2 Step 4 with correct layer values and reasoning.

### WARNING — Unused `formatClockTime` utility (fixed)

- **Problem**: Phase 2 created `formatClockTime()` server-side in `clock.ts` but the frontend used different inline formatting code via `toLocaleTimeString`. The utility was dead code — tests passed but didn't validate actual rendering behavior.
- **Fix**: Frontend now inlines the identical `formatClockTime` function from `clock.ts` into the `<script>` block. Both use `toLocaleTimeString('en-GB', ...)` with the same options. A `// keep in sync` comment marks the duplication. Added this as a new risk with mitigation.

### SUGGESTION — Timezone source (noted)

- Noted that `timezone` is already available via `/api/game-state`. Plan retains the `/api/world` injection for ergonomics (avoids a separate fetch), with a comment documenting the existing source.

### SUGGESTION — Clock position y: 1 (adopted)

- Changed placement from `y: 0` to `y: 1` — the lower wall row is more visually natural for a wall-mounted object.
