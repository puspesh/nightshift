# Plan: Fix miniverse visualization bugs

> Issue: #9
> Date: 2026-03-23
> Status: draft

## Overview

Three miniverse visualization bugs need fixing: (1) duplicate agent entries caused by hook ID derivation ignoring the `?agent=` query parameter, (2) citizens walking onto furniture because seating props lack proper anchor types, and (3) incorrect sitting Y-offset at workstations. All three are config/integration fixes — no engine changes needed.

## Requirements

- Pre-registered agents (e.g., `ns-dev-tester`) must not produce duplicate entries
- Seating furniture (armchairs, ottomans, chairs) must have proper rest/work anchors so citizens sit, not stand
- Citizens at workstation desk chairs must visually appear on the chair seat, not on the ground

## Architecture Changes

- **Modified**: `lib/miniverse/server/server.ts` — fix `handleClaudeCodeHook` agent ID resolution
- **Modified**: `lib/hooks.ts` — add `SessionStart` to HOOK_EVENTS so pre-registered agents are identified on session start
- **Modified**: `worlds/nightshift/base-world.json` — update prop anchor types and Y-offsets
- **New file**: `tests/hooks-integration.test.ts` — test hook agent ID resolution

## Implementation Steps

### Phase 1: Fix duplicate agent entries (Bug #1)

1. **Add `SessionStart` to HOOK_EVENTS** (`lib/hooks.ts`)
   - Action: Add `'SessionStart'` to the `HOOK_EVENTS` array on line 6. Currently it's `['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop']`. The `handleClaudeCodeHook` handler processes `SessionStart` events (line 487), but no curl hook is configured for it. When Claude Code starts, it may fire a SessionStart that reaches the server without query params — producing a session-derived agent ID like `claude-tester-027d2d` instead of using the pre-registered `ns-dev-tester`.
   - Why: Ensures the first hook event for every session carries the `?agent=` query parameter, so the server immediately associates the session with the correct pre-registered agent.
   - Dependencies: none

2. **Make `handleClaudeCodeHook` skip session-based ID when `data.agent` is set** (`lib/miniverse/server/server.ts`)
   - Action: Refactor lines 464-476 of `handleClaudeCodeHook`. Currently the handler always derives `sessionId`, `cwd`, `folder`, and `shortSession` from the body, then uses them as a fallback: `const agentId = (data as any).agent ?? (shortSession ? ...)`. Restructure to:
     1. Check `data.agent` first (set by the HTTP handler from `?agent=` query param, line 811)
     2. If present, use it as `agentId` and `data.name` as `agentName` — skip all session-based derivation
     3. Only fall through to session-based derivation when `data.agent` is missing (anonymous Claude Code instances not managed by nightshift)
   - Why: Makes the "prefer query param" intent explicit and avoids computing unused session IDs. Also prevents edge cases where the body might contain a `session_id` that confuses the fallback logic.
   - Dependencies: none

3. **Add deduplication guard in `AgentStore.heartbeat()`** (`lib/miniverse/server/store.ts`)
   - Action: No changes needed — `heartbeat()` already uses `data.agent` as the map key (line 55), so calling it with the same agent ID just updates the existing entry. The fix in step 2 ensures the correct agent ID is always used, preventing the creation of duplicate entries.
   - Why: Documenting that the store is already correct — the bug is purely in the ID derivation, not in storage.
   - Dependencies: step 2

### Phase 2: Fix prop anchors and sitting offsets (Bugs #2 and #3)

4. **Update `yellow_armchair` props** (`worlds/nightshift/base-world.json`)
   - Action: Change anchor `type` from `"social"` to `"rest"` for both yellow_armchair instances (at positions (1.75, 3.75) and (6.25, 6.5)). Adjust `oy` from `2` to `1` so citizens position at the seat level rather than below the armchair. The armchairs are 2 tiles tall, so the seat is at roughly oy=1 (middle of the prop).
   - Why: `"social"` anchors let citizens walk to the anchor and stand. `"rest"` anchors trigger the sitting animation and `getSittingOffset()` visual pull-up, which makes the citizen appear seated.
   - Dependencies: none

5. **Update `orange_ottoman` props** (`worlds/nightshift/base-world.json`)
   - Action: Change anchor `type` from `"social"` to `"rest"` for both ottoman instances (at positions (2, 6) and (2, 6.5)). Adjust `oy` from `1` to `0.5` since the ottoman is only 1 tile tall — the seat surface is at the top half.
   - Why: Same reasoning as step 4 — ottomans are seating furniture, citizens should sit on them.
   - Dependencies: none

6. **Add anchor to `wood_cushion_chair`** (`worlds/nightshift/base-world.json`)
   - Action: The wood_cushion_chair prop at (4.5, 3.75) currently has NO anchors (line 466-472). Add a `"rest"` anchor:
     ```json
     "anchors": [{
       "name": "wood_cushion_chair_0",
       "ox": 0.5,
       "oy": 1,
       "type": "rest"
     }]
     ```
   - Why: Without an anchor, the prop is purely decorative and citizens ignore it. Adding a rest anchor lets citizens sit on this chair.
   - Dependencies: none

7. **Fix desk_chair_dark sitting offset** (`worlds/nightshift/base-world.json`)
   - Action: Both desk_chair_dark instances (at (16, 4) and (11.75, 4)) have anchors with `oy: 2`. The chair sprite is 1.9 tiles tall, so `oy: 2` places the citizen below the chair. Change `oy` from `2` to `0.8` on both instances. Combined with the miniverse core's `getSittingOffset()` (which pulls the sprite up by `tileHeight * 1.2`), this positions the citizen visually on the chair seat: the citizen's grid position is at `propY + 0.8 = 4.8`, and the sprite is drawn `1.2 * tileHeight` pixels higher, placing the visual sprite at roughly `propY - 0.4` which aligns with the chair seat.
   - Why: The current `oy: 2` places citizens on the floor below the desk. `oy: 0.8` corrects the vertical alignment so citizens appear seated at the desk.
   - Dependencies: none

8. **Verify desk corner anchors** (`worlds/nightshift/base-world.json`)
   - Action: Check the desk_corner_left (15, 3) and desk_corner_right (10.75, 3) anchors. Both have `oy: 2` with `type: "work"`. These are the desk surfaces (not chairs). Since citizens at `type: "work"` anchors also get the sitting offset, the same issue may apply — the citizen is placed at propY + 2 = 5, which is at the front edge of the 3-tile-tall desk. This might actually be correct since the chair is in front of the desk. Leave these as-is unless visual testing shows they need adjustment — the desk_chair_dark props overlap the desk corners and provide the actual seating anchors.
   - Why: The desk corners are the desk surfaces, not seating. Citizens should sit at the desk_chair_dark props, not at the desk corners. The desk corner anchors serve as workstation assignment points. If the desk_chair_dark fix (step 7) positions citizens correctly, the desk corner anchors may need their `oy` adjusted to match. Note this as a potential follow-up if visual testing reveals misalignment.
   - Dependencies: step 7

### Phase 3: Tests

9. **Test hook agent ID resolution** (`tests/hooks-integration.test.ts`)
   - Action: Create a test file that validates:
     - `generateHookConfig` now includes `SessionStart` in its events
     - Verify the curl command URL includes `?agent=` and `?name=` query params for all events including SessionStart
   - Why: Ensures the hook config covers all events that `handleClaudeCodeHook` processes.
   - Dependencies: step 1

10. **Update existing hook tests** (`tests/hooks.test.ts`)
    - Action: Update the test that validates hook event count. Currently expects 4 events; after adding SessionStart it should expect 5. Verify the test assertion at the relevant line.
    - Why: Prevents the existing test from failing due to the new event.
    - Dependencies: step 1

## Testing Strategy

- Unit tests: `tests/hooks-integration.test.ts` for hook config coverage; updated `tests/hooks.test.ts` for event count
- Manual verification for bugs #2 and #3: Run `npx nightshift start --team dev`, open the miniverse browser UI, and verify:
  - No duplicate agent entries in the status panel (Bug #1)
  - Citizens sit on armchairs/ottomans instead of standing on them (Bug #2)
  - Citizens at desk chairs appear on the chair, not on the ground (Bug #3)
- The base-world.json changes are config-only — no unit tests needed as the rendering engine is vendored and proven correct (issue context confirms "the rendering engine works — just needs config tuning")

## Assumptions

- **`getSittingOffset()` returns `tileHeight * 1.2`**: This is a fixed value in the vendored miniverse core. The `oy` adjustments are calculated against this offset. If the offset changes in a future miniverse core update, the oy values would need recalibration.
- **`SessionStart` is fired by Claude Code before other events**: Adding SessionStart to HOOK_EVENTS ensures the first event always carries query params. If Claude Code fires events in a different order, duplicates could still briefly appear before the first curl-based hook fires.
- **`oy` values are estimated**: The exact visual positioning depends on sprite sizes and the miniverse core's rendering pipeline. The values 0.8 (desk chair) and 1.0 (armchair) are calculated from prop dimensions and sitting offset, but may need minor tuning after visual testing.

## Risks & Mitigations

- **Risk**: Changing anchor `oy` values might cause citizens to clip through furniture sprites
  - Mitigation: The values are conservative estimates. If visual testing shows clipping, adjust by 0.1-0.2 increments — this is pure config tuning with no code impact.

- **Risk**: Adding SessionStart to HOOK_EVENTS increases the number of curl calls per session
  - Mitigation: SessionStart fires once per agent session, so the overhead is one extra curl call at startup. The `-s -o /dev/null` flags ensure it's fire-and-forget with no output noise.

- **Risk**: The desk_corner anchors (step 8) may need adjustment after the desk_chair_dark fix
  - Mitigation: Step 8 explicitly notes this as a potential follow-up. The desk_corner anchors serve as workstation assignment points and may not need the same sitting offset treatment since citizens should preferentially anchor at the desk_chair_dark props.
