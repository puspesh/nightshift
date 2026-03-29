# Plan: Add game-style HUD for coins and energy

> Issue: #38
> Date: 2026-03-29
> Status: draft

## Overview

Add a game-style HUD (Heads-Up Display) overlay to the miniverse canvas showing world-level coins and energy indicators with fixed placeholder values. The HUD is positioned inside the canvas container as absolutely-positioned HTML elements, matching the pixel-art dark theme. Values are hardcoded for now but structured so they can be wired to real data later.

## Requirements

- R1: Display a coins indicator with an icon and numeric value on the canvas
- R2: Display an energy indicator with an icon and numeric value on the canvas
- R3: HUD must look like a game screen overlay (semi-transparent, positioned over the canvas)
- R4: Values are fixed/hardcoded placeholder numbers
- R5: HUD should match the existing dark theme and monospace font aesthetic

## Architecture Changes

### Modified files

| File | Change |
|------|--------|
| `lib/miniverse/server/frontend.ts` | Add HUD CSS styles, HTML elements, and positioning logic |

### No new files

This is a self-contained frontend change. No server, store, or config changes needed.

## Implementation Steps

### Phase 1: Add HUD overlay to the frontend

#### 1. Add HUD CSS styles

- **File**: `lib/miniverse/server/frontend.ts`
- **Location**: Inside the `<style>` block, after the `#team-selector` styles (around line 130)
- **Action**: Add styles for the HUD container and items:
  ```css
  #hud {
    position: absolute;
    top: 12px;
    left: 12px;
    right: 12px;
    display: flex;
    justify-content: space-between;
    pointer-events: none;
    z-index: 10;
  }

  .hud-item {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(13, 17, 23, 0.85);
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .hud-icon {
    font-size: 16px;
    line-height: 1;
  }

  .hud-coins .hud-icon { color: #f0c040; }
  .hud-coins .hud-value { color: #f0c040; }

  .hud-energy .hud-icon { color: #3fb950; }
  .hud-energy .hud-value { color: #3fb950; }
  ```
- **Why**: The HUD uses absolute positioning within the canvas container, matching the dark translucent game-overlay aesthetic. `pointer-events: none` ensures the HUD doesn't interfere with canvas click/hover interactions (tooltip, citizen click). Gold (#f0c040) for coins and green (#3fb950) for energy follow standard game HUD color conventions. The semi-transparent background (`rgba(13,17,23,0.85)`) matches the body background color with slight transparency.
- **Dependencies**: none

#### 2. Make canvas container position-relative

- **File**: `lib/miniverse/server/frontend.ts`
- **Location**: Inside the `#canvas-container` CSS rule (around line 35-41)
- **Action**: Add `position: relative;` to the existing `#canvas-container` styles:
  ```css
  #canvas-container {
    position: relative;
    border: 1px solid #30363d;
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 24px;
    image-rendering: pixelated;
  }
  ```
- **Why**: The HUD uses `position: absolute` to overlay on the canvas. The container needs `position: relative` to serve as the positioning anchor. Without this, the HUD would position relative to the viewport instead of the canvas.
- **Dependencies**: none

#### 3. Add HUD HTML elements

- **File**: `lib/miniverse/server/frontend.ts`
- **Location**: Inside the `<div id="canvas-container">` element (line 142), as the first child
- **Action**: Add the HUD markup with fixed placeholder values:
  ```html
  <div id="canvas-container">
    <div id="hud">
      <div class="hud-item hud-coins">
        <span class="hud-icon">&#x1FA99;</span>
        <span class="hud-value" id="hud-coins">1,250</span>
      </div>
      <div class="hud-item hud-energy">
        <span class="hud-icon">&#x26A1;</span>
        <span class="hud-value" id="hud-energy">850</span>
      </div>
    </div>
  </div>
  ```
  The icons use Unicode characters:
  - `&#x1FA99;` = coin emoji (U+1FA99). If this doesn't render on all systems, fall back to `&#x25C9;` (fisheye/circle) or the text "COIN".
  - `&#x26A1;` = high voltage/lightning bolt (U+26A1) for energy.
- **Why**: HTML overlay is simpler than canvas drawing, DOM-inspectable for testing, and naturally matches the existing font/styling. The `id` attributes on value spans (`hud-coins`, `hud-energy`) make it easy to update values programmatically later. Fixed values "1,250" and "850" serve as placeholders per the issue requirement.
- **Dependencies**: steps 1, 2

#### 4. Verify icon rendering and add fallback

- **Action**: During implementation, test that the Unicode coin emoji (U+1FA99) renders in the browser. This character was added in Unicode 13.0 (2020) and may not render on all systems. If it shows as a missing glyph box:
  - **Option A**: Use SVG inline icons (small coin and lightning bolt SVGs, ~50 bytes each)
  - **Option B**: Use simpler Unicode: `&#x25CF;` (filled circle, styled gold) for coins, `&#x26A1;` for energy (lightning bolt has better support)
  - **Option C**: Use text labels: "COINS" and "ENERGY" as the icon

  The coder should pick whichever looks best. The lightning bolt (U+26A1) has broad support and should work everywhere. The coin character is the riskiest.
- **Why**: Unicode emoji rendering varies by OS and font stack. The monospace font stack (`SF Mono`, `Cascadia Code`, `Fira Code`) may not include emoji glyphs. A fallback ensures the HUD looks correct regardless of platform.
- **Dependencies**: step 3

## Testing Strategy

### Unit test regression
Run `bun test` — frontend changes don't affect any unit tests.

### Typecheck
Run `bun run typecheck` — only template literal string changes in `frontend.ts`, no type implications.

### Visual verification
1. Run `bunx nightshift start --team dev` in a test repo
2. Open the miniverse URL in browser
3. Verify:
   - HUD appears at the top of the canvas area
   - Coins indicator on the left shows icon + "1,250"
   - Energy indicator on the right shows icon + "850"
   - HUD has semi-transparent dark background
   - HUD doesn't block canvas interactions (clicking citizens, tooltip)
   - HUD stays positioned correctly when switching worlds
   - Icons render correctly (no missing glyph boxes)

## Assumptions

1. **Canvas container dimensions are consistent** — The canvas is always 512x384 at 2x scale (1024x768 rendered). The HUD uses percentage-based positioning (`left: 12px`, `right: 12px`) which adapts to any canvas width.

2. **Unicode emoji rendering** — The coin emoji (U+1FA99) may not render in all monospace fonts. The fallback strategy in step 4 handles this. The lightning bolt (U+26A1) has universal support.

3. **Values are purely decorative for now** — The hardcoded values "1,250" and "850" have no meaning. They're visual placeholders. Future issues can wire these to real metrics (e.g., total tasks completed, aggregate agent energy).

4. **No server-side changes needed** — The HUD is entirely client-side HTML/CSS. No new API endpoints, WebSocket messages, or store fields are required for the placeholder implementation.

## Risks & Mitigations

- **Risk**: The HUD overlaps with the canvas content in the top corners, obscuring important visual elements
  - **Mitigation**: Rows 0-1 of the grid are walls (non-interactive). The HUD at `top: 12px` overlaps only the wall area. Citizens and props are in rows 2+ and won't be obscured. If overlap is a concern, increase `top` to `20px` or add a slight inset.

- **Risk**: `position: relative` on `#canvas-container` breaks existing canvas rendering or world caching
  - **Mitigation**: The Miniverse constructor creates child `<div>` elements inside the container. Adding `position: relative` to the parent doesn't affect child layout since the children use default positioning. The world cache system creates/hides child divs — this is unaffected by the parent's position property.
