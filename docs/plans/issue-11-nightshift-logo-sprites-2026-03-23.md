# Plan: Replace Gear Supply logo with nightshift logo in world sprites

> Issue: #11
> Date: 2026-03-23
> Status: draft

## Overview

The miniverse world currently displays a "gear supply" neon logo on the office wall (`prop_17_logo_neon.png`). Replace it with a nightshift-branded logo that matches the ASCII art used in the CLI shell banners (`start.ts`, `init.ts`). The logo should be a pixel-art neon sign rendering of the "nightshift" text, keeping the same neon-glow aesthetic as the current logo.

## Requirements

- Replace the "gear supply" logo with "nightshift" in the world sprite
- Use the shell ASCII art design as the reference for the text/typography
- Keep the neon-sign visual style consistent with the world's aesthetic
- No changes to world layout or positioning — same prop slot

## Architecture Changes

- **Replaced**: `worlds/nightshift/world_assets/props/prop_17_logo_neon.png` — new nightshift logo image
- **Modified**: `worlds/nightshift/base-world.json` — update prop dimensions if the new logo has different aspect ratio

## Implementation Steps

### Phase 1: Create and replace logo

1. **Generate nightshift neon logo sprite** (`worlds/nightshift/world_assets/props/prop_17_logo_neon.png`)
   - Action: Create a pixel-art PNG image of the text "nightshift" in a neon sign style. Design reference:
     - **Text**: "nightshift" (lowercase, matching the CLI banner and project name)
     - **Style**: Neon glow on dark background — the current Gear Supply logo uses orange/blue neon tubes on a dark translucent background. Keep the same general feel but use the project's accent color `#58a6ff` (blue) as the primary neon color, matching the frontend's `h1` color and the coder agent color.
     - **Size**: The current prop is 3 tiles wide × 1 tile high (at 32px per tile × 2x scale = 192×64px render area). The image should be approximately 192×64px or similar aspect ratio. "nightshift" is a longer word than "gear supply", so the image may need to be slightly wider — up to 4 tiles wide (256×64px) if needed for legibility.
     - **Typography reference**: The CLI ASCII art (from `start.ts` lines 232-237) renders "nightshift" in a figlet-style font. The pixel-art logo doesn't need to replicate the ASCII art exactly, but should evoke the same angular, technical feel.
   - Why: Branding consistency — the miniverse world should display the project's own identity, not a placeholder.
   - Dependencies: none

2. **Update base-world.json prop dimensions if needed** (`worlds/nightshift/base-world.json`)
   - Action: If the new logo image width changes (e.g., from 3 tiles to 4 tiles), update the `logo_neon` prop definition at line 418:
     ```json
     {
       "id": "logo_neon",
       "x": 10.75,
       "y": 0.5,
       "w": 3,
       "h": 1,
       "layer": "below"
     }
     ```
     Adjust `w` to match the new image's width in tile units. Adjust `x` to keep the logo centered on the wall if width changes. The prop is currently centered between the two desk corner props (at x=10.75 and x=15). If `w` changes to 4, shift `x` to approximately 10.25 to maintain centering.
   - Why: Mismatched prop dimensions cause the image to stretch or clip in the renderer.
   - Dependencies: step 1

3. **Keep prop ID and propImages reference unchanged** (`worlds/nightshift/base-world.json`)
   - Action: Do NOT rename the prop ID from `logo_neon` or change the `propImages` entry at line 556 (`"logo_neon": "world_assets/props/prop_17_logo_neon.png"`). The file is being replaced in-place, so the reference stays valid.
   - Why: Renaming the prop ID would require updating all references. Since we're replacing the file content, keeping the same path avoids unnecessary changes.
   - Dependencies: none

## Testing Strategy

- Visual verification: Run `npx nightshift start --team dev`, open `http://localhost:4321`, and verify the nightshift logo appears on the office wall in the correct position with neon styling.
- Check that the logo doesn't overlap with adjacent props (windows, desk corners).

## Assumptions

- **Image generation**: The coder will create the pixel-art PNG using an image generation tool or manual pixel art. The neon glow effect can be achieved with bright colored pixels on a dark/transparent background — no complex rendering needed for pixel art at this scale.
- **Prop ID preserved**: Keeping `logo_neon` as the prop ID avoids cascading changes. The name is generic enough ("neon logo") to work for any brand.

## Risks & Mitigations

- **Risk**: Generated pixel art doesn't match the neon aesthetic of the existing world
  - Mitigation: Use the current `prop_17_logo_neon.png` as a direct style reference — same background treatment, similar glow radius, matching pixel density. The only change is the text content.
