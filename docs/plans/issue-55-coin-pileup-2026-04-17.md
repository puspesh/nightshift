# Plan: Agentville — Visual Coin Pile-Up with Auto-Collect

> Issue: #55
> Date: 2026-04-17
> Status: draft

## Overview

Add a visual coin-stack system that renders small coin piles near agent desks whenever coins are earned, giving users tactile feedback. Stacks are purely cosmetic — `wallet.coins` is already credited at earn-time (existing behavior). Auto-collect sweeps stacks after 60s of inactivity or any user interaction, animating them flying into the HUD counter. Users can also click stacks to collect early.

## Requirements

- R1: On each `coins:earned` WebSocket event, render a coin stack near the earning agent's desk position on the canvas.
- R2: Cap visual stack height at 5 coins per agent (count still tracked internally).
- R3: Auto-collect triggers: (a) 60s after last coin landed (per-stack timer), (b) any user interaction (click anywhere, shop navigation), (c) browser refresh / reconnect.
- R4: Collect animation: coin stacks fly toward the HUD coin counter position.
- R5: User can click a stack to collect early.
- R6: Coins are **never lost** — wallet balance is always accurate regardless of visual state.
- R7: Stacks are visual-only representations of a "recently earned" queue.

## Architecture Changes

### New Files

1. **`lib/agentville/core/src/effects/CoinStack.ts`** — Canvas-based `CoinStackSystem` render layer
   - Manages per-agent coin stacks, rendering, collect animations
   - Implements `RenderLayer` interface (like `ParticleSystem`)

### Modified Files

2. **`lib/agentville/core/src/index.ts`** — Wire `CoinStackSystem` into the Agentville engine
   - Add `CoinStackSystem` as a render layer (order ~18, between citizens and particles)
   - Expose `earnCoinVisual(agentId, amount)` and `collectAllStacks()` methods
   - Forward click events to CoinStackSystem for stack click-to-collect

3. **`lib/agentville/server/frontend.ts`** — Connect WebSocket `coins:earned` to visual stacks + wire auto-collect
   - On `coins:earned`: call `mv.earnCoinVisual(agentKey, earned)` to create stack
   - On any click/interaction: call `mv.collectAllStacks()`
   - On page load / reconnect: no stacks to render (stacks are ephemeral, not persisted)
   - Pass HUD coin element position to the engine for fly-to-target animation

## Implementation Steps

### Phase 1: CoinStackSystem Core (Canvas Render Layer)

The minimum viable slice — coins appear on desks, auto-collect fires, stacks cap at 5.

#### Tests First

- **Test file**: `tests/agentville-coin-stack.test.ts`
- **Test cases**:
  - `addStack creates a stack for an agent at the given position`: assert stack count = 1, position matches
  - `addStack increments visual count up to cap (5)`: add 7 coins → assert visualCount = 5, totalCount = 7
  - `addStack resets auto-collect timer on each new coin`: add coin, advance 30s, add coin → timer should be ~0, not ~30
  - `collectStack removes stack and returns coin info for animation`: assert stack removed after collect, returns {x, y, totalCount}
  - `collectAll returns all stacks and clears state`: add stacks for 3 agents → collectAll returns 3 entries, internal map is empty
  - `auto-collect triggers after 60s of inactivity`: advance time by 61s → assert stacks auto-collected (callback fired)
  - `containsPoint detects click on stack area`: assert true for point inside stack bounds, false for outside

#### Implementation Steps

1. **Create `CoinStackSystem` class** (`lib/agentville/core/src/effects/CoinStack.ts`)
   - Action: Implement `RenderLayer` with `order: 18`
   - Internal state: `Map<string, CoinStack>` keyed by agentId
   - `CoinStack` shape: `{ x, y, visualCount, totalCount, timer, collecting, collectProgress }`
   - `addStack(agentId, x, y, amount)`: create or update stack; cap `visualCount` at 5; reset timer to 0
   - `collectStack(agentId)`: mark as collecting, begin fly animation
   - `collectAll()`: iterate all stacks, trigger collect on each
   - `containsPoint(worldX, worldY)`: hit test for click-to-collect
   - `update(delta)`: advance timers, trigger auto-collect at 60s, animate collecting stacks
   - `render(ctx, delta)`: draw coin sprites (simple gold circles with highlight, stacked offset)
   - Why: Follows the `ParticleSystem` pattern — self-contained render layer with update+render loop
   - Dependencies: none (pure canvas drawing, no imports beyond `RenderLayer`)

2. **Export from effects barrel** (`lib/agentville/core/src/effects/index.ts`)
   - Action: Add `export { CoinStackSystem } from './CoinStack'` (check if barrel exists, create if not)
   - Dependencies: step 1

### Phase 2: Engine Integration (Wire into Agentville)

Connect `CoinStackSystem` to the Agentville engine so the frontend can trigger it.

#### Tests First

- **Test file**: `tests/e2e/game-world.spec.ts` (add to existing E2E suite)
- **Test cases**:
  - `coin stack appears near agent desk on work:completed event`: post work:completed → assert canvas contains coin stack visual (evaluate `window.__av.getCoinStacks()` to check internal state)
  - `coin stack caps at 5 visual coins after many earnings`: post 8 work:completed events → assert visual count ≤ 5
  - `clicking canvas collects all stacks`: post work:completed, click canvas → assert stacks cleared
  - `stacks auto-collect after 60s`: post work:completed, wait 62s, assert stacks cleared (use `page.clock` for fast-forward)
  - `coin fly animation targets HUD position`: post work:completed, collect → assert no JS errors, HUD balance unchanged (it was already correct)

#### Implementation Steps

1. **Add `CoinStackSystem` to Agentville engine** (`lib/agentville/core/src/index.ts`)
   - Action: Instantiate `CoinStackSystem` in constructor
   - Add as render layer with `order: 18`
   - Add `onCollect` callback on the system to notify frontend when stacks are collected
   - Why: Keeps rendering in the canvas pipeline, consistent with Particles/SpeechBubbles

2. **Expose public methods on `Agentville`** (`lib/agentville/core/src/index.ts`)
   - Action: Add methods:
     - `earnCoinVisual(agentId: string, amount: number)`: looks up citizen by `getCitizen(agentId)`, gets pixel position (`citizen.x`, `citizen.y`), calls `coinStacks.addStack(agentId, x + offsetX, y + offsetY, amount)` — offset to place coins beside the desk, not on top of the character
     - `collectAllStacks()`: calls `coinStacks.collectAll()`
     - `getCoinStacks()`: returns current stack state (for E2E test assertions)
     - `onCoinCollect(callback)`: register callback for when stacks finish collecting
   - Why: Frontend (inline JS in `frontend.ts`) communicates with the engine via these methods
   - Dependencies: Phase 1 complete

3. **Forward click events to CoinStackSystem** (`lib/agentville/core/src/index.ts`)
   - Action: In `handleClick()`, check `coinStacks.containsPoint(world.x, world.y)` **before** citizens/objects. If hit, call `coinStacks.collectStack(agentId)` for that stack.
   - Why: Stacks are clickable to collect early. Check them first so clicks on stacks don't trigger citizen tooltips.
   - Dependencies: step 1, 2

### Phase 3: Frontend Wiring (WebSocket → Visual Stacks → Auto-Collect)

Connect the existing `coins:earned` handler to the visual system and wire auto-collect triggers.

#### Tests First

- **Test file**: `tests/e2e/game-world.spec.ts` (extend Phase 2 tests)
- **Test cases**:
  - `coins:earned event creates visual stack and updates HUD independently`: post work:completed → HUD shows new balance AND stack appears (both happen, balance not delayed)
  - `page refresh shows correct balance with no stacks`: reload page → HUD balance correct, no stale stacks
  - `opening shop panel triggers auto-collect`: earn coins, click shop button → stacks collected
  - `auto-collect fly animation completes without errors`: earn coins, wait 62s, no console errors

#### Implementation Steps

1. **Wire `coins:earned` to `earnCoinVisual`** (`lib/agentville/server/frontend.ts`)
   - Action: In the `coins:earned` WebSocket handler (line ~1265), after the existing `showCoinFloat` / `updateHudCoins` calls, add:
     ```js
     if (window.__av && p.agentKey) {
       window.__av.earnCoinVisual(p.agentKey, earned);
     }
     ```
   - Why: Leverages existing event flow. Balance is already updated in HUD. This just adds the desk visual.
   - Dependencies: Phase 2 complete

2. **Wire auto-collect on user interaction** (`lib/agentville/server/frontend.ts`)
   - Action: Add a single `document.addEventListener('click', () => { if (window.__av) window.__av.collectAllStacks(); })` — this covers clicking anywhere, including shop/inventory buttons.
   - Also call `collectAllStacks()` inside `openShop()` and `openInventory()` for belt-and-suspenders.
   - Why: Issue requires auto-collect on "any user interaction". A document-level click handler covers all cases cleanly.
   - Dependencies: Phase 2 complete

3. **Set HUD target position for fly animation** (`lib/agentville/server/frontend.ts`)
   - Action: After `mv.start()`, set the fly-to target:
     ```js
     const hudRect = document.getElementById('hud-coins').getBoundingClientRect();
     const canvasRect = container.getBoundingClientRect();
     // Convert screen position to canvas-relative position for the fly target
     mv.setCoinCollectTarget(
       (hudRect.left - canvasRect.left) / 2, // divide by scale
       (hudRect.top - canvasRect.top) / 2
     );
     ```
   - Action: Add `setCoinCollectTarget(x, y)` method to Agentville class that forwards to CoinStackSystem
   - Why: The fly animation needs a canvas-space target. HUD is in DOM, canvas is scaled 2×, so we convert.
   - Dependencies: Phase 2 complete

4. **Register `onCoinCollect` callback for visual feedback** (`lib/agentville/server/frontend.ts`)
   - Action: After `mv.start()`, register:
     ```js
     mv.onCoinCollect((stackInfo) => {
       // Optional: show a subtle "+collected" float or sparkle at HUD
       // The balance is already correct — this is just visual closure
     });
     ```
   - Why: Gives a satisfying visual moment when stacks reach the HUD. Can be minimal (or even empty) in Phase 3.
   - Dependencies: Phase 2

## Testing Strategy

- **Approach**: Test-Driven Development (TDD) — tests are written BEFORE implementation in each phase
- **Unit tests** (`tests/agentville-coin-stack.test.ts`): Test CoinStackSystem logic in isolation — stack add/cap/timer/collect/hitTest. Uses `node:test` + `node:assert/strict` (project convention).
- **E2E tests** (`tests/e2e/game-world.spec.ts`): Test the full flow — post `work:completed` event, verify stack appears, verify auto-collect fires, verify HUD stays correct. Uses Playwright with real browser + server.
- **Test infrastructure**: Reuse existing `postEvent()`, `earnCoins()`, `getGameState()` helpers from E2E suite. Unit tests use `bootstrapWorld()` pattern from `agentville-economy.test.ts`.
- **No frontend component tests needed**: The system is pure canvas rendering — E2E with `page.evaluate()` on `window.__av` is the right level.

## Assumptions

1. **Canvas rendering, not DOM overlays**: Coin stacks render on the canvas via `RenderLayer`, consistent with all other visual elements (particles, speech bubbles, props). This keeps them pixel-art style and avoids DOM/canvas coordinate conversion complexity.
2. **Stacks are ephemeral (not persisted)**: On page refresh, there are no stacks to show — coins were already banked. This matches the "stacks are visual-only" requirement.
3. **Per-stack timers, not global**: Each agent's stack has its own 60s timer, reset on each new coin. An agent earning coins every 30s will never auto-collect; an agent that stops earning will auto-collect after 60s. This feels more natural.
4. **Simple coin rendering (no sprite sheet)**: Coins are drawn as small gold circles with a highlight arc — pixel art style. No new asset files needed. If a coin sprite exists later, the draw function can be swapped.
5. **Stack position is offset from citizen position**: Coins render at `citizen.x + tileWidth, citizen.y` (one tile to the right of the agent). If the citizen moves, the stack stays at the position where it was created (desk position), since agents earning coins are typically sitting at their desk.
6. **`agentKey` in `coins:earned` payload maps to `citizen.agentId`**: The server broadcasts `agentKey` (e.g., `nightshift/dev/ns-dev-coder-1`) and this matches the citizen's `agentId` in the core engine. Need to verify this mapping works.
7. **Click-to-collect takes priority over citizen click**: When a user clicks a coin stack, we collect it rather than showing the citizen tooltip. This is the expected UX since stacks overlap desk areas.

## Risks & Mitigations

- **Risk**: Stack position may land on a non-visible area if the agent doesn't have a desk assignment.
  - Mitigation: If `getCitizen(agentId)` returns undefined (agent not rendered), skip the visual stack silently. Coins are already in the wallet — no loss.

- **Risk**: The `agentKey` format from the server may not match `citizen.agentId` in the core engine.
  - Mitigation: The existing `coins:earned` handler already receives `agentKey` and the Signal system normalizes agent IDs. Log a warning if no citizen is found and skip gracefully.

- **Risk**: 60s auto-collect timer is hard to E2E test without `page.clock` or similar time manipulation.
  - Mitigation: Playwright supports `page.clock.fastForward()` for time manipulation. If not available, expose a `CoinStackSystem.setAutoCollectDelay(ms)` for test configuration (default 60000).

- **Risk**: Fly animation target position becomes stale if the user resizes the browser.
  - Mitigation: Recalculate HUD position in the `resize` event handler or just use a fixed approximate screen corner as fallback. The animation is brief (~500ms) so slight inaccuracy is acceptable.
