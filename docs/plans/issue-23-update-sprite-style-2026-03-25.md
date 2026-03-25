# Plan: Update sprite style to be less pixelated

> Issue: #23
> Date: 2026-03-25
> Status: draft

## Overview

Replace all current pixel-art sprites with higher-fidelity, semi-realistic isometric assets. The existing 64x64 citizen sprites, 32x32 tiles, and prop PNGs have a heavily pixelated retro aesthetic. The issue asks for a more modern, polished office look with role-specific citizen appearances. This plan covers: (1) updating the rendering pipeline to support smoother scaling, (2) regenerating tile/wall assets for a modern office, (3) regenerating all citizen sprite sheets with role-appropriate attire, and (4) fixing citizen positioning offsets (especially nova).

## Requirements

- R1: All sprites should look less pixelated -- smoother lines, more detail, more modern feel
- R2: Office tiles and wall sprites should represent a modern office setup (clean floors, modern walls)
- R3: Each citizen sprite should visually reflect their role:
  - **reviewer**: formal attire (suit, glasses)
  - **coder(s)**: casual attire (hoodie, shorts, or pullover)
  - **producer**: business-casual (polo or button-up)
  - **planner**: smart-casual (sweater or blazer)
  - **tester**: casual-technical (t-shirt, utility vest or similar)
- R4: Fix x,y offset issues (nova and potentially others) so citizens sit correctly at workstations
- R5: Maintain backward compatibility with the miniverse-core rendering engine (same sprite sheet format, same animation definitions)

## Architecture Changes

### Modified files

| File | Change |
|------|--------|
| `worlds/nightshift/universal_assets/citizens/*.png` | Replace all 8 sprite sheet PNGs (4 characters x 2 sheets each) with 10 new ones (5 role-specific characters x 2 sheets) |
| `worlds/nightshift/world_assets/tiles/*.png` | Replace 9 tile PNGs with modern office tiles |
| `worlds/nightshift/world_assets/props/*.png` | Replace prop PNGs with higher-fidelity modern office furniture |
| `lib/world-config.ts` | Update `CITIZEN_SPRITES` array to use role-based sprite names instead of generic character names |
| `lib/miniverse/server/frontend.ts` | Update sprite sheet resolution to use role-based sprite names, adjust rendering config |
| `lib/miniverse/core/miniverse-core.js` | Change `image-rendering: pixelated` to `image-rendering: auto` and enable `imageSmoothingEnabled` for smoother upscaling |
| `worlds/nightshift/world.json` | Potentially increase canvas dimensions if higher-res assets need more space |
| `worlds/nightshift/base-world.json` | Fix anchor `oy` offset values for seating props |
| `scripts/generate-sprites.mjs` | New script for regenerating sprite assets using AI image generation |
| `tests/visualize.test.ts` | Update sprite name assertions from generic names to role-based names |

### New files

| File | Purpose |
|------|---------|
| `scripts/generate-sprites.mjs` | Node.js script that generates sprite sheets using an AI image generation API (or documents the manual generation process with detailed prompts) |
| `worlds/nightshift/universal_assets/citizens/producer_walk.png` | Producer walk sprite sheet |
| `worlds/nightshift/universal_assets/citizens/producer_actions.png` | Producer actions sprite sheet |
| `worlds/nightshift/universal_assets/citizens/planner_walk.png` | Planner walk sprite sheet |
| `worlds/nightshift/universal_assets/citizens/planner_actions.png` | Planner actions sprite sheet |
| `worlds/nightshift/universal_assets/citizens/reviewer_walk.png` | Reviewer walk sprite sheet |
| `worlds/nightshift/universal_assets/citizens/reviewer_actions.png` | Reviewer actions sprite sheet |
| `worlds/nightshift/universal_assets/citizens/coder_walk.png` | Coder walk sprite sheet |
| `worlds/nightshift/universal_assets/citizens/coder_actions.png` | Coder actions sprite sheet |
| `worlds/nightshift/universal_assets/citizens/tester_walk.png` | Tester walk sprite sheet |
| `worlds/nightshift/universal_assets/citizens/tester_actions.png` | Tester actions sprite sheet |

## Current State Analysis

### Sprite sheet format (must be preserved)
- **Dimensions**: 256x256 PNG, containing a 4x4 grid of 64x64 frames
- **Walk sheet layout** (4 rows x 4 frames each):
  - Row 0: walk_down
  - Row 1: walk_up
  - Row 2: walk_left
  - Row 3: walk_right
- **Actions sheet layout** (4 rows x 4 frames, some rows use only 2 frames):
  - Row 0: working (4 frames, speed 0.3)
  - Row 1: sleeping (2 frames, speed 0.8)
  - Row 2: talking (4 frames, speed 0.15)
  - Row 3: idle_down / idle_up (4 frames, speed 0.5)
- This format is hardcoded in `createStandardSpriteConfig()` in miniverse-core.js and **must not change**

### Current rendering pipeline
- Canvas CSS: `image-rendering: pixelated` (line 26, miniverse-core.js) -- forces nearest-neighbor upscaling
- Canvas context: `ctx.imageSmoothingEnabled = false` (lines 29, 55, miniverse-core.js) -- disables anti-aliasing
- Scale: 2x (64px frames displayed at 128px effective)
- These settings enforce the pixelated look even on detailed sprites

### Current citizen sprites
- 4 generic characters: `dexter`, `morty`, `nova`, `rio`
- Assigned round-robin to agents (no role-visual correlation)
- All sprites share a similar semi-pixel-art style with decent detail but jagged edges due to nearest-neighbor scaling
- **nova** has known offset issues when sitting at workstations (per issue body and issue #9)

### Current tile/prop assets
- Tiles: 32x32 pixel art (dark wood floor, plain walls with accents)
- Props: various sizes, pixel-art style furniture (desks ~595x605, chairs ~77x128, etc.)
- Props are drawn at tile-grid sizes via `ctx.drawImage()` with `imageSmoothingEnabled = false`

## Implementation Steps

### Phase 1: Rendering Pipeline Update (enable smooth scaling)

This phase changes the rendering engine to support higher-quality sprite display. Without this, even perfectly detailed sprites will be nearest-neighbor upscaled and look jagged.

1. **Update miniverse-core canvas rendering mode** (`lib/miniverse/core/miniverse-core.js`)
   - Action: Change `this.canvas.style.imageRendering = "pixelated"` to `this.canvas.style.imageRendering = "auto"` (line 26 in the Renderer constructor). Change `this.ctx.imageSmoothingEnabled = !1` to `this.ctx.imageSmoothingEnabled = !0` in all 3 locations (lines 29, 55, and the PropSystem render call around line 909/915). Set `this.ctx.imageSmoothingQuality = "high"` after each smoothing enable.
   - Why: The `pixelated` CSS and disabled smoothing are the primary cause of the blocky look. Enabling bilinear/bicubic interpolation will make higher-res sprites look smooth when scaled.
   - Dependencies: none
   - **Risk note**: This is a vendored/bundled file. Changes here are local to nightshift's fork. If miniverse-core is updated upstream, these changes will need to be re-applied. Consider adding a comment at each change site: `// nightshift: smooth rendering (issue #23)`.

2. **Update PropSystem rendering** (`lib/miniverse/core/miniverse-core.js`)
   - Action: Find the PropSystem `render()` method where it sets `ctx.imageSmoothingEnabled = !1` before drawing props. Change to `ctx.imageSmoothingEnabled = !0` and add `ctx.imageSmoothingQuality = "high"`.
   - Why: Props also need smooth scaling -- the desk, chair, and furniture sprites are drawn at grid-tile sizes and would look blocky without smoothing.
   - Dependencies: none

3. **Verify tile rendering uses smoothing** (`lib/miniverse/core/miniverse-core.js`)
   - Action: Check the Scene class `render()` method for tiles. The tiles are 32x32 drawn at 32x32 (1:1 within the canvas coordinate system), so smoothing shouldn't be needed for tiles. However, because the canvas itself is 2x scaled via CSS, tiles will benefit from `image-rendering: auto` on the canvas element (already changed in step 1). No additional code change needed for tiles specifically.
   - Why: Tiles are drawn at native resolution within the canvas -- the CSS-level scaling handles the rest.
   - Dependencies: step 1

### Phase 2: Regenerate Tile and Wall Assets

4. **Design modern office tile palette**
   - Action: Define the target aesthetic for office tiles. The current tiles use a dark wood/moss color scheme. Replace with:
     - `main_floor.png`: Light hardwood or clean gray carpet texture (32x32)
     - `main_wall.png`: Clean white/light gray modern wall (32x32)
     - `kitchen_wall.png`: Subtle backsplash tile pattern (32x32)
     - `green_wall_accent.png`: Modern accent wall in muted green (32x32)
     - `office_wall_accent.png`: Feature wall with subtle texture (32x32)
     - `chevron_accent.png`: Modern geometric pattern (32x32)
     - `moss_wall.png` / `moss_wall_accent.png`: Soft green-gray with plant-wall feel (32x32)
     - `rug_pattern.png`: Modern geometric rug pattern (32x32)
   - Why: Tiles need to match a modern office aesthetic. The current dark wood flooring reads as a cabin or old bar, not a tech office.
   - Dependencies: none

5. **Generate new tile PNGs** (`worlds/nightshift/world_assets/tiles/`)
   - Action: Generate or create 32x32 tile PNGs using one of these approaches (in order of preference):
     - **Option A (recommended)**: Use an AI image generation API (e.g., DALL-E, Stable Diffusion) with prompts targeting "isometric office tile, 32x32, seamless, modern office floor/wall, clean lines". Post-process to exact 32x32 with transparency where needed.
     - **Option B**: Use the existing `generate-logo.mjs` pattern -- write a Node.js script (`scripts/generate-tiles.mjs`) that programmatically draws tiles using raw pixel manipulation (gradients, patterns, noise). This produces deterministic, reproducible results.
     - **Option C**: Source from a free isometric tileset (e.g., kenney.nl modern office pack) with compatible licensing.
   - Replace all 9 tile files in `worlds/nightshift/world_assets/tiles/`. Also regenerate `tileset.png` (512x32 combined tileset) to match.
   - Why: Higher-quality tile textures combined with the smooth rendering from Phase 1 will eliminate the pixelated floor/wall appearance.
   - Dependencies: step 4

6. **Generate new prop PNGs** (`worlds/nightshift/world_assets/props/`)
   - Action: Regenerate all 20 prop images with a modern office aesthetic. Props have varied dimensions (see current state analysis), so each must be regenerated at its current pixel dimensions to avoid layout breakage. Key props to update:
     - Desks (`prop_0_desk_corner_left.png`, `prop_1_desk_corner_right.png`): Modern standing/sitting desk with monitor, clean lines
     - Chairs (`desk_chair_dark.png`, `desk_chair_light.png`, `prop_2_office_chair_black.png`): Modern ergonomic office chairs
     - Lounge (`prop_3_yellow_armchair.png`, `prop_5_orange_ottoman.png`): Modern lounge furniture
     - Kitchen (`prop_7_fridge_stainless.png`, `prop_8_kitchen_counter_sink.png`, `prop_9_kitchen_counter_plain.png`): Modern kitchenette
     - Decor (`prop_11/12_decorative_wall_panel`, `prop_13_window_large_vertical.png`, `prop_14_framed_pictures_shelf.png`): Modern wall art, large windows, floating shelf
     - Logo (`prop_17_logo_neon.png`): Keep as-is (already regenerated in issue #11)
   - Each prop must maintain its exact current pixel dimensions to avoid breaking the prop positioning system.
   - Why: Props are the most visually prominent elements. Modern, detailed props combined with smooth rendering will transform the office feel.
   - Dependencies: step 4 (for style consistency)

### Phase 3: Regenerate Citizen Sprites (role-specific)

7. **Define role-specific character designs**
   - Action: Document the visual design for each role's citizen sprite:
     - **producer** (assigned color: cyan `#00cccc`): Business-casual attire -- polo shirt or button-up, slacks. Confident posture. Could carry a clipboard or tablet.
     - **planner** (assigned color: yellow `#cccc00`): Smart-casual -- sweater or light blazer, chinos. Thoughtful look. Could have a notepad.
     - **reviewer** (assigned color: magenta `#cc00cc`): Formal -- suit jacket, dress shirt, glasses. Sharp, detail-oriented look.
     - **coder** (assigned color: blue `#0066cc`): Casual -- hoodie or pullover, shorts or jeans. Relaxed tech-worker vibe. Could have headphones.
     - **tester** (assigned color: green `#00cc00`): Casual-technical -- t-shirt with utility vest, cargo pants. Practical, hands-on look.
   - Each character should have distinct hair, skin tone, and build for visual differentiation.
   - Why: The issue specifically calls out role-appropriate attire. Visual distinction helps identify agents at a glance.
   - Dependencies: none

8. **Generate citizen sprite sheets** (`worlds/nightshift/universal_assets/citizens/`)
   - Action: Create 10 new sprite sheet PNGs (5 roles x 2 sheets each). Each must be **exactly 256x256 pixels** with a **4x4 grid of 64x64 frames** following the layout documented in Current State Analysis.
   - Generation approach:
     - **Option A (recommended for consistency)**: Use AI image generation to create a reference character design for each role, then manually or semi-automatically create the sprite sheet frames. Tools like Aseprite, LibreSprite, or Piskel can help arrange frames into sheets.
     - **Option B**: Use a sprite sheet generator service/tool that can produce walk cycles and action poses from a character description. Ensure output matches the exact 4x4 grid format.
     - **Option C**: Commission from a free game-art resource with matching style.
   - The art style should be **semi-realistic isometric chibi** -- more detailed than pixel art but still stylized for the small 64x64 frame size. Think "high-quality RPG Maker" or "modern Stardew Valley" level of detail.
   - File naming: `{role}_walk.png` and `{role}_actions.png` (e.g., `producer_walk.png`, `coder_actions.png`)
   - Why: Role-specific sprites are the core deliverable of this issue.
   - Dependencies: step 7

9. **Remove old generic sprites**
   - Action: Delete the old character sprite files:
     - `dexter_walk.png`, `dexter_actions.png`
     - `morty_walk.png`, `morty_actions.png`
     - `nova_walk.png`, `nova_actions.png`
     - `rio_walk.png`, `rio_actions.png`
   - Why: These are replaced by role-specific sprites. Keeping them would be confusing and waste space.
   - Dependencies: step 8

10. **Update `CITIZEN_SPRITES` in world-config.ts** (`lib/world-config.ts`)
    - Action: Change the sprite assignment from round-robin generic names to direct role-based names:
      ```typescript
      // Before:
      const CITIZEN_SPRITES = ['dexter', 'morty', 'nova', 'rio'];
      // ...
      const sprite = CITIZEN_SPRITES[i % CITIZEN_SPRITES.length];

      // After:
      // Sprite name now matches the agent role directly
      const sprite = agent.role.replace(/-\d+$/, '');  // 'coder-1' -> 'coder', 'producer' -> 'producer'
      ```
      The `replace(/-\d+$/, '')` strips the numeric suffix from coder variants (coder-1, coder-2, etc.) so they all use the same `coder` sprite.
    - Remove the `CITIZEN_SPRITES` constant entirely -- it's no longer needed.
    - Why: With role-specific sprites, the sprite name IS the role name. Round-robin assignment no longer makes sense.
    - Dependencies: step 8

11. **Update frontend sprite sheet loading** (`lib/miniverse/server/frontend.ts`)
    - Action: The frontend already uses `createStandardSpriteConfig(def.sprite)` which generates paths like `/universal_assets/citizens/{sprite}_walk.png`. Since step 10 changes the sprite field to the role name, the frontend will automatically load `producer_walk.png`, `coder_walk.png`, etc. Verify this works correctly by tracing the data flow:
      - `world-config.ts` sets `sprite: 'producer'` (or `'coder'`, etc.)
      - `frontend.ts:285` calls `createStandardSpriteConfig('producer')`
      - This returns paths: `/universal_assets/citizens/producer_walk.png` and `producer_actions.png`
    - No code change needed if the data flow is correct. Just verify.
    - Why: Confirms the sprite name change propagates correctly through the rendering pipeline.
    - Dependencies: step 10

### Phase 4: Fix Citizen Positioning Offsets

12. **Fix nova/citizen sitting offset values** (`worlds/nightshift/base-world.json`)
    - Action: Update anchor `oy` values for seating props in `base-world.json`. The issue mentions "nova has issues" and issue #9 documents specific fixes needed:
      - `desk_chair_dark`: anchors `oy` should be `0.8` (already correct in `world-config.ts` line 87 for dynamic chairs, but base-world.json decorative chairs may still have `oy: 2`)
      - `yellow_armchair` (`prop_3`): change anchor type to `rest`, change `oy: 2` to `oy: 1`
      - `orange_ottoman` (`prop_5`): change anchor type to `rest`, change `oy: 1` to `oy: 0.5`
    - Why: Incorrect `oy` values cause citizens to appear on the floor instead of sitting on furniture. This affects all citizens at those positions, but nova was most visible because of its specific workstation assignment.
    - Dependencies: none

13. **Verify citizen draw offset calculation** (`lib/miniverse/core/miniverse-core.js`)
    - Action: Review the citizen `draw()` method (around line 477-480):
      ```javascript
      const n = this.x + (this.tileWidth - this.frameWidth) / 2 + t;
      const s = this.y + (this.tileHeight - this.frameHeight) - this.getSittingOffset() + i;
      ```
      The `getSittingOffset()` returns `tileHeight * 1.2` (~38.4px at tileHeight=32). Verify that with the new sprites (still 64x64 frames, 32px tiles), the offset math produces correct visual positioning. If the new sprites have different visual centers (e.g., character drawn higher or lower within the 64x64 frame), the offset may need adjustment.
    - Why: New sprites may have different character positioning within the 64x64 frame compared to the old ones. The sitting offset is a common source of visual bugs.
    - Dependencies: step 8

14. **Update tests** (`tests/visualize.test.ts`)
    - Action: Update sprite-related test assertions:
      - Tests that check for generic sprite names (`dexter`, `morty`, `nova`, `rio`) need to check for role-based names (`producer`, `planner`, `reviewer`, `coder`, `tester`)
      - Tests that check round-robin sprite assignment need to verify direct role mapping instead
      - Ensure the `CITIZEN_SPRITES` array reference is removed from tests if it existed
    - Why: Tests must match the new sprite naming convention.
    - Dependencies: step 10

### Phase 5: Sprite Generation Tooling

15. **Create sprite generation script** (`scripts/generate-sprites.mjs`)
    - Action: Create a Node.js script that documents (and optionally automates) the sprite generation process. At minimum, the script should:
      - Define the exact specifications for each sprite sheet (dimensions, frame layout, animation rows)
      - Include AI image generation prompts for each role's character design
      - Include post-processing logic: take generated character images and arrange them into the 256x256 sprite sheet grid
      - Optionally: call an AI image generation API (configurable via env var) to generate base character art
    - The script serves as documentation even if generation is done manually -- it records the prompts and specs so sprites can be regenerated consistently.
    - Why: Sprite generation is the most labor-intensive part. A documented, reproducible process prevents knowledge loss.
    - Dependencies: step 7

16. **Add tile generation script** (`scripts/generate-tiles.mjs`)
    - Action: Similar to step 15, create a script for tile generation. Following the pattern of `generate-logo.mjs`, this could programmatically generate tiles using:
      - Noise functions for floor textures
      - Gradient patterns for walls
      - Geometric patterns for accents
    - This approach produces deterministic, reproducible tiles without external API dependencies.
    - Why: Tiles are simpler than character sprites and can be generated programmatically with good results.
    - Dependencies: step 4

## Testing Strategy

- **Unit tests** (`tests/visualize.test.ts`): Update sprite name assertions. Verify role-to-sprite mapping produces correct sprite names for all roles including coder variants.
- **Unit tests** (`tests/world-config.test.ts`): Verify merged world config preserves new prop anchor offsets.
- **Visual verification** (manual):
  1. Run `npx nightshift start --team dev`
  2. Open the miniverse visualization in browser
  3. Verify: tiles and walls look like a modern office
  4. Verify: citizens have role-appropriate attire (reviewer in suit, coder in hoodie, etc.)
  5. Verify: sprites are not jagged/pixelated -- smooth scaling
  6. Verify: citizens sit correctly at workstations (no floating above or sinking below chairs)
  7. Verify: all animation states work (walk, idle, working, sleeping, talking)
  8. Verify: multiple coders all use the same coder sprite
- **Regression**: Run `npm run test` to ensure all existing tests pass after updates.
- **Asset validation**: Verify all new PNGs are exactly the expected dimensions (256x256 for citizen sheets, 32x32 for tiles).

## Assumptions

- **Miniverse-core is vendored and editable**: The rendering changes (Phase 1) modify `miniverse-core.js` directly. This is a bundled/vendored file in `lib/miniverse/core/`. If it's meant to be updated from upstream, these changes will need to be re-applied after updates. I'm assuming local modifications are acceptable since the file is already committed to this repo.

- **AI-generated sprites are acceptable**: The issue says "regenerate" which implies automated generation. I'm assuming AI-generated sprite art (via DALL-E, Stable Diffusion, or similar) is acceptable. If not, the plan still works with manually created sprites -- the sprite sheet format and code changes are the same.

- **All coders share one sprite**: Since the issue mentions "coder(s)" as a single category, I'm assuming coder-1 through coder-4 all use the same `coder` sprite. If distinct coders are desired later, additional sprites can be added without architectural changes.

- **Sprite sheet frame size stays at 64x64**: Increasing frame size (e.g., to 128x128) would require changes to `createStandardSpriteConfig()` in the vendored miniverse-core. Keeping 64x64 frames but with more detailed art and smooth rendering should achieve the "less pixelated" goal without touching the animation system.

- **Canvas dimensions stay at 512x384**: The current canvas with 2x CSS scaling produces a 1024x768 display. This should be sufficient for the new art style. If higher-res assets need more canvas space, `world.json` can be updated, but this would cascade to grid dimensions and prop placement.

- **Offset fixes from issue #9 may already be partially applied**: The `world-config.ts` already has `oy: 0.8` for desk chairs (line 87), suggesting issue #9's fixes for dynamic props are done. The base-world.json decorative furniture may still have old values. I'll verify and fix any remaining incorrect offsets.

## Risks & Mitigations

- **Risk**: AI-generated sprite sheets may not perfectly match the 4x4 grid format, causing animation glitches
  - Mitigation: Post-process all generated art through a strict 256x256 template with 64x64 grid lines. Use the generation script (step 15) to enforce exact pixel alignment. Manual touch-up may be needed for frame boundaries.

- **Risk**: Enabling `imageSmoothingEnabled` may cause blurry rendering of small details or text labels
  - Mitigation: Test with existing sprites first before replacing them. The name label rendering (8px monospace at canvas scale) should be unaffected since text is drawn via `fillText()`, not `drawImage()`. If prop labels or small sprites look blurry, selectively disable smoothing for specific draw calls.

- **Risk**: New higher-fidelity PNGs may be significantly larger in file size, slowing initial load
  - Mitigation: Run all new PNGs through `pngquant` or similar lossy PNG compression. Citizen sheets at 256x256 are small regardless (~50KB each currently). Props at 500-900px could be larger -- target <100KB per prop.

- **Risk**: Modifying the vendored miniverse-core.js may conflict with future upstream updates
  - Mitigation: Mark all changes with `// nightshift: issue #23` comments. Keep changes minimal (3-4 line changes total in the renderer). Consider upstreaming a `smoothRendering` option to miniverse-core as a follow-up.

- **Risk**: Some sprite animations may look wrong with smooth rendering (subpixel blending between frames)
  - Mitigation: Test each animation state. If specific animations look worse with smoothing (e.g., sleeping 2-frame animation may blur), consider keeping pixel-perfect rendering for citizen sprites only and smooth rendering for tiles/props. This can be done by toggling `imageSmoothingEnabled` per layer in the render loop.
