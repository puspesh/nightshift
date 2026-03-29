# Plan: Fix nightshift logo in README.md

> Issue: #24
> Date: 2026-03-26
> Status: draft

## Overview

The README.md logo has alignment issues. The ASCII art banner uses `<pre align="center">` which is a deprecated HTML4 attribute that GitHub's markdown renderer ignores, causing the banner to appear left-aligned instead of centered. Fix by wrapping in a `<div align="center">` container, which GitHub does support.

## Requirements

- R1: The logo/banner in README.md should be visually centered on GitHub
- R2: No functional regressions to the rest of the README content

## Architecture Changes

- **Modified**: `README.md` -- fix the logo alignment HTML

No new files. No code changes. Single-file markdown fix.

## Implementation Steps

### Phase 1: Fix alignment (single phase)

1. **Wrap `<pre>` in a centered `<div>`** (`README.md`)
   - Action: Replace the current `<pre align="center">...</pre>` block (lines 1-8) with a `<div align="center">` wrapper around a plain `<pre>` tag:
     ```html
     <div align="center">
     <pre>
            _       __    __       __    _ ______
      ___  (_)___ _/ /_  / /______/ /_  (_) __/ /_
     / _ \/ / __ `/ __ \/ __/ ___/ __ \/ / /_/ __/
     / / / / / /_/ / / / / /_(__  ) / / / / __/ /_
     /_/ /_/_/\__, /_/ /_/\__/____/_/ /_/_/_/  \__/
             /____/
     </pre>
     </div>
     ```
   - Why: GitHub's markdown renderer supports `align="center"` on `<div>` and `<p>` elements, but NOT on `<pre>` elements. The `<div>` wrapper centers the entire block while `<pre>` preserves the monospace formatting. This is the standard pattern used across popular GitHub repositories for centered ASCII art.
   - Dependencies: none

2. **Verify rendering**
   - Action: After pushing, check the README on GitHub to confirm the ASCII art is centered and the badges below remain centered.
   - Why: Visual verification is the only reliable test for markdown rendering.
   - Dependencies: step 1

## Testing Strategy

- **Visual verification**: View README.md on GitHub after push. Confirm:
  - ASCII art banner is horizontally centered
  - Badge row below remains centered (should be unaffected)
  - No extra whitespace or broken formatting
- **Regression**: Remaining README content (Quick Start, How It Works, etc.) is untouched and unaffected.

## Assumptions

- GitHub's markdown renderer supports `align="center"` on `<div>` elements. This is well-established and used by thousands of repos (e.g., the pattern is documented in GitHub's own guides). Verified by convention.

## Risks & Mitigations

- **Risk**: Minor rendering differences across GitHub (web, mobile, API preview)
  - Mitigation: The `<div align="center">` pattern is the most widely compatible centering approach on GitHub. No known issues across platforms.
