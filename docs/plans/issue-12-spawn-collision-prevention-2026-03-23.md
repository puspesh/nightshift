# Plan: Ensure spawn positions in miniverse do not collide with props

> Issue: #12
> Date: 2026-03-23
> Status: draft

## Overview

Citizens currently spawn without explicit positions — they rely on the miniverse core's `autoSpawnCitizen()` which picks anchors or walkable tiles, with `unstickCitizens()` as a reactive safety net. This plan adds pre-computed, validated spawn positions to the world config at generation time. A new `computeSpawnPositions()` function analyzes the base world's floor grid and prop layout to build a set of valid walkable tiles, then assigns random positions from this set to each citizen. Positions are written into the citizen configs in world.json, so the miniverse core uses them directly — no core modifications needed.

## Requirements

- Citizen spawn positions must be random
- Positions must never collide with blocking props
- All edge cases handled (no valid tiles, more citizens than tiles)
- If no empty positions remain, spawn outside the walkable area and walk in

## Architecture Changes

- **New file**: `lib/spawn.ts` — spawn position computation from floor grid + prop layout
- **Modified**: `lib/world-config.ts` — add `position` field to generated citizen configs
- **Modified**: `lib/types.ts` — add optional `position` to `CitizenConfig` type
- **New file**: `tests/spawn.test.ts` — tests for spawn position validation
- **Modified**: `tests/visualize.test.ts` — update citizen config expectations

## Implementation Steps

### Phase 1: Spawn position computation

1. **Add `position` field to `CitizenConfig`** (`lib/types.ts`)
   - Action: Add `position?: [number, number]` to the `CitizenConfig` interface (line 22-28). This is a `[tileX, tileY]` tuple. Optional so existing code without positions continues to work.
   - Why: The miniverse core's `CitizenConfig` expects a `position` string. The nightshift type needs to carry the computed position so it can be written to world.json.
   - Dependencies: none

2. **Create spawn position module** (`lib/spawn.ts`)
   - Action: Create a module with two exports:

     **`buildWalkableSet(floor: string[][], props: Array<{x: number, y: number, w: number, h: number}>): Set<string>`**
     Computes the set of valid spawn tiles by:
     1. Start with all floor tiles where `floor[row][col] !== ''` (non-empty = walkable)
     2. Exclude edge tiles (row 0, last row, col 0, last col) — the miniverse core treats these as boundaries
     3. Subtract all tiles covered by props — for each prop, block all tiles in `Math.floor(x)..Math.ceil(x+w)` × `Math.floor(y)..Math.ceil(y+h)` (same algorithm as miniverse core's `getBlockedTiles()`)
     4. Return a `Set<string>` of `"x,y"` keys for all remaining walkable tiles

     **`assignSpawnPositions(citizenCount: number, walkableSet: Set<string>, gridCols: number, gridRows: number): [number, number][]`**
     Assigns random positions from the walkable set:
     1. Convert the set to an array and shuffle it (Fisher-Yates)
     2. For each citizen (up to `citizenCount`):
        - If walkable tiles remain, pop one and assign it as `[x, y]`
        - If no walkable tiles remain (more citizens than tiles), generate an **edge spawn position**: pick a random tile on row 0 or col 0 (outside the walkable area but on the grid boundary). The miniverse core will render the citizen there, and `unstickCitizens()` will move them to the nearest valid tile — effectively making them "walk in" from outside.
     3. Return array of `[tileX, tileY]` positions, one per citizen

   - Why: Separating spawn logic into its own module keeps `world-config.ts` focused on layout generation. The walkable set computation mirrors the miniverse core's logic so positions are guaranteed valid.
   - Dependencies: step 1

3. **Integrate spawn positions into world config generation** (`lib/world-config.ts`)
   - Action: Modify `generateWorldConfig()` to accept an optional `baseWorld` parameter (the parsed base-world.json). When provided:
     1. Call `buildWalkableSet(baseWorld.floor, baseWorld.props)` to get valid tiles
     2. Call `assignSpawnPositions(agents.length, walkableSet, baseWorld.gridCols, baseWorld.gridRows)` to get positions
     3. Set `position` on each `CitizenConfig` from the assigned positions

     When `baseWorld` is not provided (backward compat), positions are omitted and the miniverse core falls back to `autoSpawnCitizen()`.
   - Why: The world config is the right place to add positions — it already generates citizens and workstations from the agent list. The base world data provides the floor grid and props needed for validation.
   - Dependencies: step 2

4. **Pass positions to frontend citizen configs** (`lib/miniverse/server/frontend.ts`)
   - Action: The frontend's citizen initialization (line 222-228) already maps `def.position` to the citizen config. Currently this is undefined since nightshift's CitizenConfig didn't have positions. With step 1 adding positions as `[tileX, tileY]` tuples, update the frontend mapping to convert the tuple to a position string that the miniverse core can look up. The core expects a named location string — create dynamic spawn locations: for each citizen with a position `[x, y]`, add a location entry `{ name: "_spawn_{x}_{y}", x, y }` to the scene's locations, then set the citizen's position to `"_spawn_{x}_{y}"`.
   - Why: The miniverse core's `addCitizen()` resolves position strings via `scene.getLocation(name)`. By creating named locations from the pre-computed coordinates, positions are resolved correctly without modifying the core.
   - Dependencies: step 3

### Phase 2: Edge cases

5. **Handle zero valid tiles** (`lib/spawn.ts`)
   - Action: In `assignSpawnPositions()`, when the walkable set is empty (no valid tiles at all — pathological case where the entire floor is covered by props), assign ALL citizens edge spawn positions at `[0, gridRows - 1]` (bottom-left corner, outside the prop area). Spread them across col 0 if multiple citizens need edge spawns.
   - Why: The issue requires that if no empty positions exist, citizens spawn outside and walk in. Edge tiles are outside the normal walkable area, so the miniverse core's `unstickCitizens()` will detect them as stuck and move them to the nearest accessible tile.
   - Dependencies: step 2

6. **Ensure no duplicate positions** (`lib/spawn.ts`)
   - Action: In `assignSpawnPositions()`, track assigned tiles and never assign the same tile twice. The Fisher-Yates shuffle + pop approach already guarantees this for walkable tiles. For edge spawns, increment the column index to spread citizens along the edge: `[0, 0]`, `[1, 0]`, `[2, 0]`, etc.
   - Why: Two citizens on the same tile causes visual overlap. The miniverse core's `TileReservation` system handles runtime conflicts, but pre-preventing duplicates is cleaner.
   - Dependencies: step 2

### Phase 3: Tests

7. **Add spawn position tests** (`tests/spawn.test.ts`)
   - Action: Test the following scenarios:
     - `buildWalkableSet` correctly excludes wall tiles (empty strings in floor)
     - `buildWalkableSet` correctly excludes prop-covered tiles
     - `buildWalkableSet` correctly excludes edge tiles
     - `assignSpawnPositions` returns positions within the walkable set
     - `assignSpawnPositions` never returns duplicate positions
     - `assignSpawnPositions` with more citizens than walkable tiles returns edge positions for overflow
     - `assignSpawnPositions` with empty walkable set returns all edge positions
     - Positions are randomized (run twice, verify different order)
   - Why: Spawn validation is safety-critical — wrong positions cause visual glitches.
   - Dependencies: step 2

8. **Update world config tests** (`tests/visualize.test.ts`)
   - Action: Update existing `generateWorldConfig` tests to verify citizens have `position` fields when `baseWorld` is provided. Add a test that confirms positions are omitted when `baseWorld` is not provided (backward compat).
   - Why: Ensures the integration between spawn computation and world config generation works.
   - Dependencies: step 3

## Testing Strategy

- Unit tests: `spawn.test.ts` covers all spawn logic independently with synthetic floor/prop data
- Integration tests: `visualize.test.ts` covers the world config generation with real base-world.json data
- Manual verification: Run `npx nightshift start --team dev`, open the miniverse, verify citizens spawn on walkable tiles (not on desks, chairs, walls, or kitchen counters)

## Assumptions

- **Miniverse core is vendored**: We don't modify `miniverse-core.js`. All changes go through the nightshift layer (world config, frontend initialization). The core's `unstickCitizens()` remains as a safety net for edge cases we might miss.
- **Base world available at generation time**: `generateWorldConfig()` is called from `start.ts` which already has access to the base world directory. The base-world.json can be read and parsed at this point.
- **`_spawn_X_Y` location naming**: The miniverse core's `autoSpawnCitizen()` uses the same `_spawn_X_Y` naming convention for dynamic spawn locations. Reusing this pattern ensures compatibility.

## Risks & Mitigations

- **Risk**: Walkable set computation diverges from miniverse core's actual walkability logic
  - Mitigation: The computation mirrors the core's `getBlockedTiles()` algorithm exactly (floor non-empty check, prop bounding box blocking, edge exclusion). If the core changes, the spawn module would need updating — but the core is vendored so it won't change independently.

- **Risk**: Edge spawns trigger `unstickCitizens()` which moves citizens unpredictably
  - Mitigation: This is the intended behavior for the "walk in from outside" requirement. `unstickCitizens()` uses BFS to find the nearest accessible tile, which creates a natural "entering the office" effect.
