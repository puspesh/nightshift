# Plan: Update README with badges and logo for open-sourcing

> Issue: #14
> Date: 2026-03-23
> Status: draft

## Overview

Prepare the README for open-sourcing by adding trust-building badges (npm version, license, Node.js, TypeScript, etc.) and the nightshift logo. Also add links to CONTRIBUTING.md and CODE_OF_CONDUCT.md which already exist in the repo but aren't referenced from the README.

## Requirements

- Add badges/shields to the README header for trust signals
- Add the nightshift logo to the README
- Link existing community files (CONTRIBUTING.md, CODE_OF_CONDUCT.md)

## Architecture Changes

- **New file**: `assets/logo.svg` — nightshift logo for README
- **Modified**: `README.md` — add badges, logo, and community links

## Implementation Steps

### Phase 1: Create logo and update README

1. **Create nightshift logo** (`assets/logo.svg`)
   - Action: Create a simple, clean SVG logo for nightshift. The project's aesthetic is a pixel-art office world with AI agents as citizens, using a dark theme (`#0d1117` background, `#58a6ff` accent — matching the miniverse frontend). The logo should evoke the "night shift" concept: a moon, code, or shift-work imagery. Keep it simple — a text-mark logo with a small icon element. Use monospace font styling to match the terminal/CLI nature of the tool.
   - Why: A logo gives the project visual identity and makes the README more professional for open-sourcing.
   - Dependencies: none

2. **Add badges to README header** (`README.md`)
   - Action: Replace the current single badge line (line 3) with a comprehensive badge block. Add these shields.io badges, in this order:
     - **npm version**: `https://img.shields.io/npm/v/nightshift` — shows published version
     - **License**: `https://img.shields.io/badge/license-MIT-blue.svg` — already exists, keep it
     - **Node.js**: `https://img.shields.io/badge/node-%3E%3D18-brightgreen` — from `engines.node` in package.json
     - **TypeScript**: `https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript&logoColor=white` — signals type safety
     - **Claude Code**: `https://img.shields.io/badge/Claude_Code-compatible-blueviolet` — key dependency and differentiator
     - **PRs Welcome**: `https://img.shields.io/badge/PRs-welcome-brightgreen.svg` — invites contributions
   - Why: Badges are the first thing visitors scan on a GitHub README. They communicate maturity, compatibility, and openness at a glance.
   - Dependencies: none

3. **Add logo to README** (`README.md`)
   - Action: Insert the logo image at the very top of the README, above the `# nightshift` heading. Use centered HTML:
     ```html
     <p align="center">
       <img src="assets/logo.svg" alt="nightshift" width="400">
     </p>
     ```
     Remove the `# nightshift` text heading since the logo replaces it as the title. Keep the subtitle paragraph ("Coordinating AI agents...") below the logo.
   - Why: A centered logo with badges immediately below is the standard open-source README layout. It looks professional and establishes brand identity.
   - Dependencies: step 1

4. **Add community section** (`README.md`)
   - Action: Add a "## Contributing" section before the "## License" section at the bottom. Content:
     ```markdown
     ## Contributing

     Contributions are welcome! Please read the [Contributing Guide](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md) before submitting pull requests.
     ```
   - Why: CONTRIBUTING.md and CODE_OF_CONDUCT.md already exist in the repo but aren't linked from the README. For open-sourcing, contributors need to find these easily.
   - Dependencies: none

### Phase 2: Package metadata alignment

5. **Verify package.json metadata** (`package.json`)
   - Action: Review and ensure the following fields are accurate for open-sourcing:
     - `repository.url` — currently points to `nightshift-agents/nightshift`. Confirm this is the intended public org or update to match the actual GitHub URL.
     - `keywords` — already has good keywords; consider adding `"github"`, `"tmux"`, `"claude-code"`, `"ci-cd"` for better npm discoverability.
     - `description` — currently good, no changes needed.
   - Why: npm badges pull metadata from package.json. Incorrect repo URL means badge links go to the wrong place.
   - Dependencies: none

## Testing Strategy

- Visual verification: Review the README on GitHub after pushing — check that badges render correctly, logo displays at proper size, and all links work.
- No automated tests needed — this is documentation only.

## Assumptions

- **Logo as SVG**: SVG renders natively on GitHub and scales well. If SVG rendering has issues on npm, a PNG fallback can be added later.
- **npm version badge**: The badge will show "not found" until the package is actually published to npm. This is expected for pre-release — the badge will auto-populate once published.
- **Repository URL**: The plan notes the `nightshift-agents/nightshift` URL in package.json may differ from the current `puspesh/nightshift`. This is assumed intentional (eventual org transfer) and is flagged for the coder to confirm with the user.

## Risks & Mitigations

- **Risk**: Logo SVG may not render on all platforms (npm, some markdown renderers)
  - Mitigation: Keep the SVG simple (no external fonts, no embedded images). If needed, add a PNG export alongside the SVG and reference the PNG in the README.

- **Risk**: npm version badge shows "not found" before first publish
  - Mitigation: This is acceptable for pre-release. The badge auto-populates once published. No action needed.
