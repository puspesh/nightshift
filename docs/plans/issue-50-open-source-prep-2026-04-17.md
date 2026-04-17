# Plan: Prep for open source — documentation, badges, contributor ergonomics

> Issue: #50
> Date: 2026-04-17
> Status: draft

## Overview

Prepare nightshift for public consumption by rewriting core documentation, adding missing
contributor infrastructure (`.github/`, SECURITY.md, CI), auditing the npm package, and
cleaning up internal plan artifacts. The guiding principle: someone should be able to clone
the repo, hand the README to Claude Code, and get a working install without asking a human.

## Requirements

- First-time visitor understands nightshift's purpose in ≤ 60 seconds (README intro rewrite)
- All top-level docs (README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, CHANGELOG) exist and are current
- `.github/` has issue templates, PR template, and CI workflow
- CI runs on every PR; badge is green in README
- `npm pack --dry-run` ships no tests, plans, or internal docs
- FAQ answers top predictable questions
- Compatibility matrix documents supported versions
- No doc references "manual testing" workflow
- Error messages are findable in troubleshooting.md
- Consistent terminology across all docs

## Architecture Changes

This issue is documentation/infra only — no source code changes to `lib/` or `tests/`.

- **New files**: SECURITY.md, `.github/ISSUE_TEMPLATE/bug_report.md`, `.github/ISSUE_TEMPLATE/feature_request.md`, `.github/ISSUE_TEMPLATE/config.yml`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `docs/faq.md`, `docs/quickstart.md`, `docs/compatibility.md`
- **Rewritten files**: README.md, CONTRIBUTING.md
- **Updated files**: docs/troubleshooting.md, docs/architecture.md, package.json, .npmignore
- **Removed from npm**: `docs/plans/` (16 internal plan files currently ship in the npm tarball — 200+ KB of internal artifacts)
- **Removed from repo**: `plans/` directory (internal specs — move or delete; currently `plans/core-spec.md` and `plans/agentville-spec.md`)

## Implementation Steps

### Phase 1: Package hygiene and CI (foundation)

Fix the build/publish pipeline first — everything else depends on a clean package and green CI.

#### Tests First

- **Test file**: `tests/package-hygiene.test.ts`
- **Test cases**:
  - `npm pack output excludes docs/plans/`: run `npm pack --dry-run`, assert no `docs/plans/` files in output
  - `npm pack output excludes plans/`: assert no `plans/` files in output
  - `npm pack output excludes tests/`: assert no `tests/` files in output (already excluded, but codify)
  - `npm pack output includes required files`: assert `dist/`, `presets/`, `defaults/`, `worlds/`, `README.md`, `LICENSE`, `CHANGELOG.md` are present
  - `package.json has required fields`: assert `bugs`, `homepage`, `repository.url` are set and non-empty

#### Implementation Steps

1. **Fix package.json `files` field** (`package.json`)
   - Action: Remove `docs/` from the `files` array. Add `docs/architecture.md`, `docs/customization.md`, `docs/adding-agents.md`, `docs/headless.md`, `docs/troubleshooting.md`, `docs/faq.md`, `docs/quickstart.md`, `docs/compatibility.md` individually (or create a glob like `docs/*.md` that excludes subdirectories). This prevents `docs/plans/` from shipping.
   - Why: `npm pack --dry-run` currently ships 16 internal plan files (200+ KB). These are development artifacts, not user-facing docs.
   - Note: The `docs/` entry in `files` array includes all subdirectories. Switching to explicit file listing or `docs/*.md` (top-level only) fixes this cleanly.

2. **Add missing package.json fields** (`package.json`)
   - Action: Add `"bugs": { "url": "https://github.com/nightshift-agents/nightshift/issues" }`, `"homepage": "https://github.com/nightshift-agents/nightshift#readme"`. Verify `repository.url` is correct.
   - Why: npm and GitHub use these for linking. Missing fields create dead-end UX.

3. **Update .npmignore** (`.npmignore`)
   - Action: Add `plans/`, `docs/plans/`, `.github/` to `.npmignore` as defense-in-depth alongside the `files` field fix.
   - Why: Belt-and-suspenders. The `files` allowlist is primary; `.npmignore` catches anything that slips through.

4. **Create CI workflow** (`.github/workflows/ci.yml`)
   - Action: Create workflow that runs on push to `main` and all PRs. Matrix: Node 18, 20, 22 on ubuntu-latest and macos-latest. Steps: checkout, setup-node, `npm ci`, `npm run typecheck`, `npm run test`.
   - Why: No CI exists today. Tests run only locally. Required for the CI badge.
   - Dependencies: None

5. **Create release workflow** (`.github/workflows/release.yml`)
   - Action: Triggered on tag push (`v*`). Steps: checkout, setup-node with registry-url, `npm ci`, `npm run build`, `npm publish --provenance`. Use `NODE_AUTH_TOKEN` secret.
   - Why: Automated publishing with npm provenance for supply-chain security.
   - Dependencies: None

6. **Handle `plans/` directory** (repo root)
   - Action: The `plans/` directory contains `core-spec.md` (1,099 lines) and `agentville-spec.md` (1,135 lines). These are internal design specs. Add `plans/` to `.npmignore` (already handled above). In the repo, leave them as-is — they're useful for contributors to understand design intent. Add a `plans/README.md` one-liner: "Internal design specs. Not shipped to npm."
   - Why: These specs document the project's design history and are useful for new contributors, but should not confuse end users or ship in the package.

### Phase 2: README rewrite and new top-level docs

#### Tests First

- **Test file**: `tests/docs-integrity.test.ts`
- **Test cases**:
  - `README.md contains "Why nightshift" section`: grep for heading
  - `README.md contains "What it is NOT" section`: grep for heading
  - `README.md contains "Who is this for" section`: grep for heading
  - `README.md contains CI badge`: grep for `workflows/ci` or `actions/workflows`
  - `SECURITY.md exists and is non-empty`: file read check
  - `CONTRIBUTING.md references automated tests`: grep for `npm run test` and absence of "manual testing"
  - `CONTRIBUTING.md contains dev setup section`: grep for `npm install` and `npm run build`
  - `CONTRIBUTING.md contains verification command`: grep for `npm run typecheck && npm run test`
  - `All doc links in README resolve`: for each `](docs/*.md)` link, assert the target file exists

#### Implementation Steps

1. **Rewrite README.md** (`README.md`)
   - Action: Restructure the README with this order:
     1. ASCII art header (keep)
     2. Badges row — add CI status badge: `[![CI](https://github.com/nightshift-agents/nightshift/actions/workflows/ci.yml/badge.svg)](https://github.com/nightshift-agents/nightshift/actions/workflows/ci.yml)`. Consider adding: npm downloads/month (`https://img.shields.io/npm/dm/nightshift`).
     3. One-line tagline (keep existing: "Coordinating AI agents...")
     4. **NEW: "Why nightshift?"** — 4-5 bullets covering: autonomous overnight triage, end-to-end issue→PR pipeline, git worktree isolation, GitHub label state machine, miniverse visualization for observability.
     5. **NEW: "What it is NOT"** — bullets: not a hosted service, not a Claude Code replacement, not a CI system, not a general-purpose agent framework, not a chatbot.
     6. **NEW: "Who is this for?"** — maintainers of small-to-medium repos wanting unattended dev work, teams experimenting with agentic PRs, solo developers who want overnight issue processing.
     7. **NEW: Visual demo** — placeholder for GIF/screenshot. Add `<!-- TODO: Add asciinema recording and miniverse screenshot -->`. The actual recording is out of scope for this PR but the section should exist.
     8. Quick Start (keep, tighten)
     9. How It Works (keep)
     10. Commands (keep)
     11. **NEW: "Set up with Claude Code"** — 3-4 lines inviting users to paste the repo into Claude Code. Include a starter prompt like: "I just cloned nightshift. Help me run `npx nightshift init --team dev` in my project repo, configure it for [my stack], and start the agents."
     12. Prerequisites (keep)
     13. Documentation (update links to include new docs)
     14. Examples (keep)
     15. **NEW: Roadmap** — 3-5 bullet points linking to milestones or key issues. Alternative: link to a GitHub milestone.
     16. Contributing (keep)
     17. License (keep)
   - Why: Current README dives into Quick Start without explaining what the tool does or why someone should care.

2. **Create SECURITY.md** (`SECURITY.md`)
   - Action: Standard security policy covering:
     - How to report (GitHub Security Advisories preferred, email fallback)
     - Scope: dependency vulnerabilities, agent prompt-injection risks, `--dangerously-skip-permissions` implications
     - Response timeline: acknowledge within 72 hours, fix within 30 days for critical
     - Supported versions: latest minor release only (0.2.x currently)
     - Disclosure policy: coordinated disclosure after fix is published
   - Why: Required for responsible open-source stewardship. GitHub surfaces this in the Security tab.

3. **Rewrite CONTRIBUTING.md** (`CONTRIBUTING.md`)
   - Action: Expand from 59 lines to ~150 lines covering:
     - **Dev setup**: `git clone`, `npm install`, `npm run build`, `npm run typecheck`, `npm run test` with expected output
     - **Test discipline**: 263 automated tests (19 files) using Node.js built-in test runner (`node:test`). Tests live in `tests/`. Never hit real `~/.claude/agents/` directories (lesson from #46). No "manual testing" language.
     - **Branch/commit/PR conventions**: `issue-N-slug` branch names, `type(issue-N): description` commit format, one-idea-per-PR
     - **Local verification**: `npm run typecheck && npm run test` — one copy-paste line
     - **Agent pipeline meta-section**: explain that this repo uses nightshift on itself; contributors may see agent comments on their issues
     - **Release process**: maintainer bumps version, tags, CI publishes to npm
     - **Good first issues**: link to `good first issue` label
     - Remove: all references to `bun`/`bunx` (project migrated to npm), "testing is primarily manual" (false — 263 tests exist)
   - Why: Current CONTRIBUTING.md is outdated and misleading. References bun, claims manual testing.

4. **Create `.github/ISSUE_TEMPLATE/bug_report.md`**
   - Action: YAML frontmatter template with fields: description, steps to reproduce, expected vs actual behavior, nightshift version (`npx nightshift --version`), Node.js version, OS, Claude Code version.
   - Why: Structured bug reports reduce back-and-forth.

5. **Create `.github/ISSUE_TEMPLATE/feature_request.md`**
   - Action: YAML frontmatter template with fields: problem description, proposed solution, alternatives considered.
   - Why: Standard contributor UX.

6. **Create `.github/ISSUE_TEMPLATE/config.yml`**
   - Action: Disable blank issues. Link to FAQ for common questions.
   - Why: Channels support questions away from the issue tracker.

7. **Create `.github/PULL_REQUEST_TEMPLATE.md`**
   - Action: Checklist: changelog entry (if user-facing), tests added/updated, docs updated, no real-dir side-effects in tests (#46 lesson), `npm run typecheck && npm run test` passes locally.
   - Why: Ensures consistent PR quality.

8. **Create `.github/CODEOWNERS`**
   - Action: Assign `@puspesh` (or `@nightshift-agents/maintainers` if org team exists) as default owner. Add specific paths: `presets/` → maintainer, `.github/workflows/` → maintainer, `package.json` → maintainer.
   - Why: Ensures review on sensitive paths.

### Phase 3: Docs gap-fill

#### Tests First

- **Test file**: `tests/docs-completeness.test.ts`
- **Test cases**:
  - `docs/faq.md exists and has ≥ 8 Q&A entries`: read file, count `##` headings
  - `docs/quickstart.md exists and references all prerequisites`: grep for `gh auth login`, `claude`, `tmux`
  - `docs/compatibility.md exists and lists Node versions`: grep for `18`, `20`, `22`
  - `docs/troubleshooting.md covers all CLI error patterns`: for each known error string (list the major ones like "Missing prerequisites", "Team .* not found", "tmux is required"), assert it appears in troubleshooting.md or is cross-referenced
  - `docs/architecture.md references team.yaml`: grep for `team.yaml` (was added in #43, doc may be stale)
  - `No docs contain "manual testing" or "bunx"`: grep across all `docs/*.md` and top-level `.md` files

#### Implementation Steps

1. **Create docs/faq.md**
   - Action: Answer these questions (at minimum):
     1. Does this work with models other than Claude? (No — requires Claude Code's agent system)
     2. How do I run this without GitHub? (You can't — GitHub labels are the state machine)
     3. What happens if two agents pick up the same issue? (dev:wip label mutex — see architecture.md)
     4. Can I use this on a private repo? (Yes, needs `gh` auth with appropriate scopes)
     5. Does data leave my machine? (Only via GitHub API and Claude API — same as using Claude Code directly)
     6. What's the cost/token impact? (Depends on loop interval and issue complexity; each agent is an independent Claude Code session)
     7. Can I add custom agent roles? (Yes — see docs/adding-agents.md)
     8. What happens if an agent crashes or gets stuck? (Lock files expire after 60 min; other agents continue; see troubleshooting)
     9. How do I customize review criteria? (See docs/customization.md)
     10. Does this work on Windows? (Not yet — tmux dependency; headless mode may work under WSL)
   - Why: Preempts the top 10 questions a new visitor will have.

2. **Create docs/quickstart.md**
   - Action: Full walkthrough from zero to first merged PR:
     1. Prerequisites install (Node, Claude Code, gh, git, tmux)
     2. Authentication (`gh auth login`, `claude login`)
     3. `npx nightshift init --team dev` in a test repo
     4. Configure `repo.md` with build/test commands
     5. Create a test issue
     6. `npx nightshift start --team dev`
     7. Observe the pipeline processing the issue
     8. Review and merge the resulting PR
   - Why: README Quick Start is intentionally terse. This doc holds the hand of someone brand new.

3. **Create docs/compatibility.md**
   - Action: Supported matrix table:
     | Dependency | Minimum | Tested | Notes |
     |------------|---------|--------|-------|
     | Node.js | 18.0.0 | 18, 20, 22 | Set in `engines.node` |
     | macOS | 12+ | 15 (Sequoia) | Primary development platform |
     | Linux | Ubuntu 22.04+ | Ubuntu 24.04 | CI-tested |
     | Windows | — | — | Not supported; WSL untested |
     | Claude Code | Latest | — | Requires agent system support |
     | GitHub CLI (gh) | 2.0+ | 2.72+ | For label/issue management |
     | tmux | 3.0+ | 3.5+ | Required for `start` command |
     | git | 2.20+ | 2.39+ | For worktree support |
   - Why: Users need to know what's supported before investing time.

4. **Update docs/troubleshooting.md** (`docs/troubleshooting.md`)
   - Action: Audit against all CLI error messages found in exploration. Add entries for:
     - "Missing prerequisites. Install them and try again" → which prerequisites, how to check
     - "Invalid team name" → naming rules
     - "No team.yaml found" → what team.yaml is, where it should be
     - "Team X has not been initialized for this repo" → run `npx nightshift init` first
     - "tmux is required" → install instructions per OS
     - "Failed to create labels" → gh auth scope issue
     - "Failed to create worktrees" → branch conflicts, disk space
     - Map every error to cause + fix
   - Cross-link from error messages in source where practical (comment in code pointing to doc).
   - Why: Issue body says "All error messages emitted by the CLI are findable in troubleshooting.md"

5. **Update docs/architecture.md** (`docs/architecture.md`)
   - Action: Verify it reflects `team.yaml`-driven engine (landed in #43). Check for any stale references to hardcoded team configs. Add a section on the three-layer architecture if not already there.
   - Why: Architecture doc must match current implementation.

6. **Add README documentation links** (`README.md`)
   - Action: Add new docs to the Documentation section: FAQ, Quickstart, Compatibility.
   - Dependencies: Requires step 1 of this phase (new doc files created).

### Phase 4: Copy pass and cleanup (polish)

#### Tests First

- **Test file**: `tests/docs-consistency.test.ts`
- **Test cases**:
  - `No doc uses "bot" when meaning "agent"`: grep all `.md` files for standalone "bot" (exclude code blocks, URLs)
  - `No doc uses "bun" or "bunx"`: grep all `.md` files
  - `No doc contains TODO placeholders`: grep for `TODO` across docs (excluding the visual demo placeholder which is intentional)
  - `All internal links resolve`: for each `[text](path)` in all `.md` files, verify target exists
  - `README headings follow expected order`: parse README, verify section ordering

#### Implementation Steps

1. **Terminology pass across all `.md` files**
   - Action: Enforce consistent terminology:
     - "agent" (not "bot" or "worker")
     - "team" (not "pipeline" when referring to the team concept)
     - "pipeline" (only for the overall issue→PR flow)
     - `npx nightshift` (not `bunx nightshift` — migration happened)
     - "nightshift" lowercase (not "Nightshift" or "NightShift" except at sentence start)
   - Scope: README.md, CONTRIBUTING.md, CHANGELOG.md, all `docs/*.md`
   - Why: Inconsistent terminology confuses newcomers.

2. **Remove stale content**
   - Action:
     - Remove "testing is primarily manual" from any file (already handled in CONTRIBUTING rewrite, but verify across all files)
     - Remove any `bun`/`bunx` references (verify across all files)
     - Check for TODO placeholders in docs — resolve or remove
     - Verify examples in docs are actually runnable (commands produce expected output)
   - Why: Stale content erodes trust.

3. **Verify all internal doc links**
   - Action: Check every `[text](path)` link in every `.md` file. Fix broken links, especially after new files are created.
   - Why: Dead links are the first sign of neglected docs.

4. **Add `plans/README.md`** (`plans/README.md`)
   - Action: One-liner: "# Internal Design Specs\n\nThese are internal design documents used during nightshift development. They are not shipped in the npm package and are not required to use nightshift."
   - Why: If someone browses the repo, they should understand these aren't user-facing docs.

## Testing Strategy

- **Approach**: Test-Driven Development (TDD) — tests are written BEFORE implementation in each phase
- **Unit tests**: New test files `tests/package-hygiene.test.ts`, `tests/docs-integrity.test.ts`, `tests/docs-completeness.test.ts`, `tests/docs-consistency.test.ts`
- **Test infrastructure**: Uses existing `node:test` framework with `node:assert/strict`. Tests use `fs.readFileSync` to verify file existence and content. No new test helpers needed — these are simple file-content assertions.
- **Integration tests**: CI workflow itself serves as integration test (typecheck + test on matrix)
- **E2E tests**: None — this is documentation/infra work
- **Verification**: `npm run typecheck && npm run test` must pass. `npm pack --dry-run` must show clean output.

## Assumptions

1. **Repository URL stays `nightshift-agents/nightshift`** — badges and links use this. If the org/repo changes, all URLs need updating. (Reviewer: confirm this is the canonical home.)
2. **No lint tool exists yet** — CI runs typecheck + test only. If a linter is added later, CI should be updated separately.
3. **Visual demo is out of scope** — the README will have a placeholder section for GIF/screenshot but actual recording is not part of this issue. The issue says "Live demo / visual" but creating the actual recording requires a working demo environment.
4. **`plans/` stays in-repo** — rather than deleting design specs, we keep them for contributor context and add a README explaining they're internal. They just won't ship in the npm package.
5. **No DCO/sign-off** — CONTRIBUTING.md will explicitly state sign-off is not required. If the maintainer wants DCO, this is easy to add later.
6. **Good first issues will be seeded separately** — the CONTRIBUTING.md will link to the label, but actually creating 3-5 well-scoped issues is a separate task (likely done by @ns-dev-producer or the maintainer).
7. **The `docs/plans/` directory stays in the repo** for the same reason as `plans/` — historical design context. But it is excluded from npm.
8. **macOS + Ubuntu only for CI** — Windows is not supported (tmux dependency). WSL is untested and out of scope.
9. **Release workflow uses `NODE_AUTH_TOKEN` secret** — assumes the maintainer has configured this in the repo's GitHub secrets. The workflow file itself is straightforward but won't work without the secret.

## Risks & Mitigations

- **Risk**: README rewrite changes the "voice" of the project — subjective, may not match maintainer's intent.
  - Mitigation: Phase 2 is the most subjective phase. The plan specifies structure and content but the actual copy should be reviewed carefully. The reviewer should focus on whether the messaging accurately represents the project.

- **Risk**: CI matrix (6 combinations) may be slow or flaky.
  - Mitigation: Start with ubuntu-latest only + Node 18/20/22 (3 jobs). Add macOS after confirming stability. Tests currently take seconds to run, so matrix overhead is minimal.

- **Risk**: `files` field change in package.json could accidentally exclude needed files.
  - Mitigation: The `package-hygiene.test.ts` test explicitly verifies both inclusions and exclusions. Run `npm pack --dry-run` as part of CI.

- **Risk**: docs/plans/ removal from npm could break something if any downstream tool references them.
  - Mitigation: These are markdown plan files — no code imports them. The risk is effectively zero. The test verifies they're excluded.
