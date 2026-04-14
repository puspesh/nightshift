# Plan: Fix citizen-chair positioning, walking-through-furniture, and lounge layout overlap

> Issue: #37
> Date: 2026-03-29
> Status: draft

## Overview

Three visual bugs in the miniverse world layout: (1) coder-1 doesn't look like they're sitting on their chair — the chair anchor offset needs tuning, (2) citizens walk through chairs because the miniverse-core's `updateWalkability()` re-enables anchor tiles as walkable, making chair tiles traversable by other agents, and (3) the lounge area props (carpet, armchairs, coffee tables) extend into the desk zone (cols 5+), blocking second-row workstations. All three issues are fixed by adjusting prop positions in `base-world.json` and anchor offsets in `world-config.ts`.

## Requirements

- R1: Citizens sitting at their desks must visually appear seated on their chair sprite
- R2: Walking citizens must not pass through chair sprites — they should path around them
- R3: All lounge props (rug, armchairs, ottomans, coffee tables) must stay within cols 0-4 and not overlap with desk workstations
- R4: Walkable pathways must remain between lounge area and desk area
- R5: No existing unit tests should break

## Current State Analysis

### Desk and chair layout (world-config.ts)

For a standard setup, desks start at col 5 with xSpacing = 5, yStart = 3. Two rows for 6 agents:
- Row 0: deskY = 3 (desks at y=3 to y=6)
- Row 1: deskY = 7 (desks at y=7 to y=10)

Each desk gets a chair at `(deskX + 1, deskY + 1)` with:
- Size: w=1.1, h=1.9
- Layer: `'above'` (renders on top of citizens)
- Anchor: `{ ox: 0, oy: 0.8, type: 'work' }` — citizen sits at `(chairX, chairY + 0.8)`

Citizen default spawn position: `(deskX + 1.5, deskY + 2)`. When a base world exists, `assignSpawnPositions()` overrides this with random walkable tiles.

### Bug 1: Sitting position

The chair anchor offset `oy: 0.8` places the citizen's navigation target at `(chairX, chairY + 0.8)`. The miniverse-core's `getSittingOffset()` then shifts the sprite up by `tileHeight * 1.2` pixels (38.4px). The combination of these offsets may not visually align the citizen sprite with the chair sprite for all characters. The desk anchor at `(deskX, deskY)` with `oy: 2` also competes — both are `type: 'work'`, and the TileReservation system groups them. The citizen might navigate to the desk anchor (which is behind the desk) rather than the chair anchor, depending on which one the pathfinder reaches first.

### Bug 2: Walking through chairs

The miniverse-core's `updateWalkability()` function (compiled, cannot modify):
1. Marks all prop tiles as unwalkable via `getBlockedTiles()`
2. **Re-enables** all anchor tiles as walkable (so citizens can reach them)
3. Also re-enables orthogonal neighbors of anchor tiles

This means chair tiles that have anchors become walkable again, allowing any citizen to path through them. The chair renders as `layer: 'above'` so it visually appears on top, but the walking animation still looks wrong from certain angles.

### Bug 3: Lounge overlap with desk zone

Current lounge props that extend into the desk area (col 5+):

| Prop | Position | Size | Blocks cols | Blocks rows |
|------|----------|------|-------------|-------------|
| yellow_armchair | (4.75, 8) | 2x2 | 4-6 | 8-9 |
| coffee_table_low | (6.5, 7.5) | 3x2 | 6-9 | 7-9 |
| coffee_table_low | (5, 9) | 2.8x2 | 5-7 | 9-10 |

These three props directly block tiles where row-1 desks (deskY=7) are placed. The `mergeWorldConfig()` keeps these props (they have `rest`/`social` anchors, not `work`), so they coexist with the dynamically generated desk props, blocking pathways and covering workstations.

## Architecture Changes

### Modified files

| File | Change |
|------|--------|
| `worlds/nightshift/base-world.json` | Relocate lounge props to stay within cols 0-4; adjust positions to avoid desk area |
| `lib/world-config.ts` | Adjust chair anchor offset for better sitting alignment; remove work anchor from chair to prevent walk-through |

### No new files

## Implementation Steps

### Phase 1: Fix chair sitting position and walk-through (world-config.ts)

#### 1. Remove the work anchor from the chair prop

- **File**: `lib/world-config.ts`, lines 88-96
- **Action**: Remove the `anchors` array from the chair prop definition. The desk anchor alone (at `ox: 1, oy: 2`) is sufficient for guiding citizens to their workstation. Without an anchor on the chair, its tiles will remain blocked by `getBlockedTiles()` and NOT be re-enabled by `updateWalkability()`.
- **Current**:
  ```typescript
  props.push({
    id: 'desk_chair_dark',
    x: deskX + 1,
    y: deskY + 1,
    w: CHAIR_W,
    h: CHAIR_H,
    layer: 'above',
    anchors: [{ name: chairId, ox: 0, oy: 0.8, type: 'work' }],
  });
  ```
- **Change to**:
  ```typescript
  props.push({
    id: 'desk_chair_dark',
    x: deskX + 1,
    y: deskY + 1,
    w: CHAIR_W,
    h: CHAIR_H,
    layer: 'above',
  });
  ```
- **Why**: This is the key fix for bug 2 (walking through chairs). The miniverse-core re-enables anchor tiles as walkable. By removing the anchor from the chair, its tiles stay blocked, and pathfinding routes around it. The desk anchor at `{ ox: 1, oy: 2 }` still guides the citizen to position `(deskX + 1, deskY + 2)` — which is just below the chair, creating a natural "seated at desk" appearance.
- **Dependencies**: none

#### 2. Adjust desk anchor offset for better sitting visual

- **File**: `lib/world-config.ts`, line 84
- **Action**: Adjust the desk anchor's `oy` from 2 to 1.5 so the citizen navigates to a position that overlaps with the chair sprite, making the sitting pose look more natural.
- **Current**: `anchors: [{ name: deskId, ox: 1, oy: 2, type: 'work' }]`
- **Change to**: `anchors: [{ name: deskId, ox: 1, oy: 1.5, type: 'work' }]`
- **Why**: With `oy: 2`, the citizen sits at the bottom edge of the 3x3 desk, below the chair. With `oy: 1.5`, the citizen sits at the vertical center of the desk, which aligns with the chair position at `(deskX + 1, deskY + 1)`. Combined with the `getSittingOffset()` vertical sprite shift in miniverse-core, this should place the citizen visually on the chair. If 1.5 doesn't look right, try values between 1.0 and 2.0 — the coder should verify visually by running the visualization.
- **Dependencies**: step 1

### Phase 2: Relocate lounge props (base-world.json)

#### 3. Move the second yellow armchair out of the desk zone

- **File**: `worlds/nightshift/base-world.json`, the prop at `(4.75, 8)`
- **Action**: Move from `(4.75, 8)` to `(0, 8.5)` — places it against the left wall, on top of the rug, facing the lounge area.
- **Current**: `{ "id": "yellow_armchair", "x": 4.75, "y": 8, "w": 2, "h": 2, ... }`
- **Change to**: `{ "id": "yellow_armchair", "x": 0, "y": 8.5, "w": 2, "h": 2, ... }`
- **Why**: At (4.75, 8), this armchair blocks cols 4-6 rows 8-9, overlapping with desk row 1. Moving to (0, 8.5) keeps it within cols 0-1, rows 8-10 — fully within the lounge zone. The issue says "Can touch the wall on left if needed."
- **Dependencies**: none

#### 4. Move the first coffee table out of the desk zone

- **File**: `worlds/nightshift/base-world.json`, the prop at `(6.5, 7.5)`
- **Action**: Move from `(6.5, 7.5)` to `(1, 6.5)` and reduce size to `w: 2, h: 1`. This places a smaller table in the transition area between kitchen and lounge.
- **Current**: `{ "id": "coffee_table_low", "x": 6.5, "y": 7.5, "w": 3, "h": 2, ... }`
- **Change to**: `{ "id": "coffee_table_low", "x": 1, "y": 6.5, "w": 2, "h": 1, ... }`
- **Why**: At (6.5, 7.5) this 3x2 table blocks cols 6-9, rows 7-9, directly overlapping desk row 1. Moving to (1, 6.5) keeps it in the lounge zone. Reducing size from 3x2 to 2x1 prevents it from crowding the small lounge area.
- **Dependencies**: none

#### 5. Remove or relocate the second coffee table

- **File**: `worlds/nightshift/base-world.json`, the prop at `(5, 9)`
- **Action**: Remove this prop entirely, or move to `(3, 8.5)` with reduced size `w: 1.5, h: 1`.
- **Current**: `{ "id": "coffee_table_low", "x": 5, "y": 9, "w": 2.8, "h": 2, ... }`
- **Recommendation**: Remove it. Two coffee tables in a 5-column lounge is excessive. One is enough.
- **Why**: At (5, 9) this table blocks cols 5-7, rows 9-10, directly blocking desk row 1 pathways. Removing it frees walkable space for the bottom of the map.
- **Dependencies**: none

#### 6. Verify rug doesn't extend into desk zone

- **File**: `worlds/nightshift/base-world.json`, the rug at `(0.5, 7)`
- **Action**: Reduce rug width from 4 to 3: change `"w": 4` to `"w": 3`.
- **Current**: `{ "id": "rug_patterned", "x": 0.5, "y": 7, "w": 4, "h": 3, ... }`
- **Change to**: `{ "id": "rug_patterned", "x": 0.5, "y": 7, "w": 3, "h": 3, ... }`
- **Why**: With w=4, the rug blocks `ceil(0.5 + 4) = 5`, extending to col 4 (tiles 0-4). With w=3, it blocks `ceil(0.5 + 3) = 4`, staying in cols 0-3. This leaves col 4 as a clear walkable corridor between lounge and desks. The rug is decorative (layer: "below", no anchors) but still blocks walkability.
- **Dependencies**: none

#### 7. Move wood_cushion_chair to avoid desk zone boundary

- **File**: `worlds/nightshift/base-world.json`, the prop at `(3, 5)`
- **Action**: Move from `(3, 5)` to `(2.5, 5)` to pull it away from col 4-5 boundary.
- **Current**: `{ "id": "wood_cushion_chair", "x": 3, "y": 5, "w": 1.9, "h": 2, ... }`
- **Change to**: `{ "id": "wood_cushion_chair", "x": 2.5, "y": 5, "w": 1.9, "h": 2, ... }`
- **Why**: At x=3, w=1.9, this blocks `ceil(3 + 1.9) = 5` — col 4 is blocked. Moving to x=2.5 → `ceil(2.5 + 1.9) = 5` — still col 4. Move to x=2: `ceil(2 + 1.9) = 4` — now stops at col 3. Change to `"x": 2`.
- **Revised change**: `{ "id": "wood_cushion_chair", "x": 2, "y": 5, "w": 1.9, "h": 2, ... }`
- **Dependencies**: none

### Summary of coordinate changes

| Prop | Before | After | Why |
|------|--------|-------|-----|
| yellow_armchair #2 | (4.75, 8) | (0, 8.5) | Out of desk zone, against left wall |
| coffee_table_low #1 | (6.5, 7.5) w=3 h=2 | (1, 6.5) w=2 h=1 | Out of desk zone, fits lounge |
| coffee_table_low #2 | (5, 9) w=2.8 h=2 | **Remove** | Redundant, blocks desk pathways |
| rug_patterned | (0.5, 7) w=4 | (0.5, 7) w=3 | Leave col 4 as clear corridor |
| wood_cushion_chair | (3, 5) | (2, 5) | Don't block col 4 |
| Chair anchor | ox:0, oy:0.8 | **Remove** | Prevent walk-through |
| Desk anchor | oy: 2 | oy: 1.5 | Better sitting alignment |

## Testing Strategy

### Unit test regression
Run `bun test` — verify all 13 test files pass. The `world-config.test.ts` tests use mock base worlds (not the actual `base-world.json`), so the coordinate changes won't affect them. The `generateWorldConfig` function signature and return shape are unchanged; only the anchor field on chair props changes.

### Typecheck
Run `bun run typecheck` — removing `anchors` from the chair prop is fine since `anchors` is optional (`WorldProp.anchors?: ...`).

### Visual verification (critical)
The coder **must** verify all changes visually:
1. Run `bunx nightshift start --team dev` in a test repo with 6 agents
2. Open the miniverse URL in browser
3. Verify:
   - All citizens can reach their desks and sit down
   - Sitting citizens visually overlap their chair sprites (not floating above or below)
   - Walking citizens path around chairs, not through them
   - The lounge area is contained in the left zone (cols 0-4) with a clear corridor at col 4-5
   - No props overlap with desk workstations in rows 3-10
   - Pathfinding still works — citizens can walk from lounge to desks and back
4. If the sitting offset (`oy: 1.5`) doesn't look right, iterate: try 1.0, 1.2, 1.8, or 2.0 until the citizen sprite aligns with the chair sprite

### Spawn test
Run `bun test -- spawn.test` to specifically verify walkable set computation hasn't changed semantically (the function takes props as input, so base-world.json changes don't affect unit tests).

## Assumptions

1. **miniverse-core.js is not modifiable** — It's a compiled/bundled dependency. All fixes must work through the configuration layer (prop positions, anchor definitions, world JSON).

2. **Removing the chair anchor still allows citizens to sit** — The desk anchor at `(deskX, deskY)` with offset `(ox: 1, oy: 1.5)` places the citizen at `(deskX + 1, deskY + 1.5)`, which is within the chair's visual footprint. The miniverse-core's `isAnchored()` check uses the desk anchor, and `getSittingOffset()` still applies the vertical shift.

3. **The TileReservation system groups nearby work anchors** — With only one work anchor per workstation (on the desk, not the chair), reservation still works correctly. Each desk has a unique anchor name (`desk-{team}-{role}`).

4. **The rug is decorative but blocks walkability** — Even `layer: 'below'` props contribute to `getBlockedTiles()`. The rug has no anchors, so its tiles remain blocked (not re-enabled by `updateWalkability`). Reducing its width is necessary to keep pathways open.

5. **Visual tuning may be needed** — The desk anchor `oy` value (proposed 1.5) is a best estimate. The coder should iterate visually. Values between 1.0 and 2.0 are all valid. The important thing is that the citizen overlaps with the chair sprite when sitting.

## Risks & Mitigations

- **Risk**: Removing the chair anchor causes citizens to stand at the desk instead of sitting, because the desk anchor position doesn't trigger `getSittingOffset()`
  - **Mitigation**: The `getSittingOffset()` in miniverse-core returns a non-zero offset when the citizen is anchored at any location (not specifically chair-type anchors). As long as the citizen reaches the desk anchor and stops, the sitting visual applies. If it doesn't, keep the chair anchor but change its type from `'work'` to `'rest'` — rest anchors are still re-enabled by `updateWalkability()`, but citizens don't navigate to them during work cycles, reducing walk-through frequency.

- **Risk**: Relocating lounge props creates a cramped, unattractive layout in the left zone
  - **Mitigation**: The left zone is 5 cols × 9 rows (45 tiles) — plenty of space for the lounge props. The props have been sized to fit: armchair 2×2, small coffee table 2×1, rug 3×3, ottomans 1×1. Visual verification during implementation will catch layout issues.

- **Risk**: Citizens can no longer path to the lounge area after prop relocation
  - **Mitigation**: Col 4 is kept clear as a north-south corridor. The kitchen entry wander point at (2, 4) and lounge_rug wander point at (2.5, 8) are within the lounge zone and remain reachable. The coder should verify pathfinding works during visual testing.
