# Plan: Content Creation Pipeline — Multi-Agent Social Media Posts

> Issue: #51
> Date: 2026-04-17
> Status: draft

## Overview

Add a new nightshift team preset (`content`) that orchestrates 4 agents (producer, researcher, writer, reviewer) for autonomous social media content creation. The pipeline uses GitHub issues as its state machine, a repo-native knowledge base for voice consistency, and a human-merge gate before anything publishes. This is a preset-only change — no engine code modifications needed — plus a new `scaffold` directory feature in `init` to support content-repo-specific file structure.

## Requirements

- New `presets/content/` directory with `team.yaml`, 4 agent templates, and default extension files
- `npx nightshift init --team content` scaffolds the full content repo structure (`config/`, `knowledge/`, `content-calendar.md`, `drafts/`)
- `npx nightshift start --team content` launches 4 agents in tmux
- Label-driven state machine: `content:request` → `content:researching` → `content:writing` → `content:review` → `content:approved` → `content:published`
- Producer maintains `content-calendar.md` with 5–7 days of upcoming posts
- Writer opens PRs with markdown drafts; reviewer approves or requests revisions
- Past posts committed to `knowledge/past-posts/` after merge (knowledge loop)
- No angle repeated within 30 days (duplicate detection)
- Human merges approved PRs — nothing auto-publishes

## Architecture Changes

- **New directory**: `presets/content/team.yaml` — team definition with 9 stages, 4 agents
- **New directory**: `presets/content/agents/` — behavior templates: `producer.md`, `researcher.md`, `writer.md`, `reviewer.md`
- **New directory**: `presets/content/defaults/` — extension files: `ns-content-style-guide.md`, `ns-content-platforms.md`, `ns-content-citizens.json`
- **New directory**: `presets/content/scaffold/` — repo-root files copied during init: `config/topics.yaml`, `config/platforms.yaml`, `knowledge/style-guide.md`, `content-calendar.md`
- **Modified**: `lib/copy.ts` — add `copyScaffoldFiles()` function to copy `presets/<team>/scaffold/` to repo root
- **Modified**: `lib/init.ts` — call `copyScaffoldFiles()` after `copyExtensionFiles()` during init
- **New test**: `tests/copy.test.ts` — add tests for `copyScaffoldFiles()`
- **Modified test**: `tests/init.test.ts` — verify content preset scaffold works

## Implementation Steps

### Phase 1: Scaffold Infrastructure (engine change)

Add support for `presets/<team>/scaffold/` directories — files/folders that get copied to the repo root during `npx nightshift init`. This is the one engine change needed, since the existing `copyExtensionFiles` only copies flat files to `.claude/nightshift/`.

#### Tests First

- **Test file**: `tests/copy.test.ts` (extend existing)
- **Test cases**:
  - `copyScaffoldFiles copies directory tree to repo root`: create a temp preset with `scaffold/config/topics.yaml` and `scaffold/README.md` → call `copyScaffoldFiles(tmpRepo, 'test')` → assert files exist at `tmpRepo/config/topics.yaml` and `tmpRepo/README.md`
  - `copyScaffoldFiles skips existing files`: pre-create `tmpRepo/config/topics.yaml` with custom content → call `copyScaffoldFiles` → assert original content preserved, file in `skipped` list
  - `copyScaffoldFiles creates nested directories`: scaffold has `scaffold/knowledge/references/.gitkeep` → assert nested dir structure created
  - `copyScaffoldFiles returns empty result when no scaffold dir`: preset has no `scaffold/` directory → returns `{ copied: [], skipped: [] }`
  - `copyScaffoldFiles handles empty scaffold dir`: preset has empty `scaffold/` → returns `{ copied: [], skipped: [] }`

#### Implementation Steps

1. **Add `getPresetScaffoldDir()` and `copyScaffoldFiles()`** (`lib/copy.ts`)
   - `getPresetScaffoldDir(team)` → `join(getPresetDir(team), 'scaffold')`
   - `copyScaffoldFiles(repoRoot: string, team: string): CopyResult` — recursively walks `presets/<team>/scaffold/`, recreates the directory tree under `repoRoot`, copies files that don't already exist (same skip-if-exists pattern as `copyExtensionFiles`)
   - Why: the content preset needs repo-root structure (`config/`, `knowledge/`, `content-calendar.md`) that doesn't belong in `.claude/nightshift/`
   - Dependencies: none

2. **Call `copyScaffoldFiles()` from init** (`lib/init.ts`)
   - After step 11 (`copyExtensionFiles`), add a call to `copyScaffoldFiles(repoRoot, team)`
   - Only log output if files were actually copied (don't clutter output for presets with no scaffold dir)
   - Why: seamless integration — `npx nightshift init --team content` produces the full repo structure
   - Dependencies: step 1

### Phase 2: Content Preset — team.yaml and Defaults

Create the core preset definition and default extension files.

#### Tests First

- **Test file**: `tests/team-config.test.ts` (extend existing)
- **Test cases**:
  - `content team.yaml parses without errors`: `parseTeamConfig('presets/content/team.yaml')` succeeds
  - `content team.yaml validates successfully`: `validateTeamConfig(parsed)` returns `{ valid: true }`
  - `content team.yaml has required wip stage with meta`: assert stages includes `{ name: 'wip', meta: true }`
  - `content team.yaml has all 4 agents`: assert keys are `['producer', 'researcher', 'writer', 'reviewer']`
  - `content team.yaml agent watches reference valid stages`: all `watches` entries exist in `stages` or are `'unlabeled'`
  - `content team.yaml agent transitions reference valid stages`: all transition targets exist in `stages`

- **Test file**: `tests/copy.test.ts` (extend existing)
- **Test cases**:
  - `content preset defaults dir exists and has files`: assert `presets/content/defaults/` contains expected files
  - `content preset scaffold dir exists`: assert `presets/content/scaffold/` exists with expected structure

#### Implementation Steps

1. **Create `presets/content/team.yaml`**
   - Name: `content`, description: `Content creation pipeline`
   - 9 stages: `request` (teal/a2eeef), `researching` (blue/1d76db), `writing` (blue/1d76db), `review` (purple/5319e7), `revising` (yellow/fbca04), `approved` (green/0e8a16), `published` (grey/ededed), `wip` (grey/ededed, meta: true), `blocked` (red/d93f0b, meta: true)
   - 4 agents with watches and transitions as defined in the issue
   - Producer: `worktree: false`, `model: sonnet`, watches `[request, unlabeled]`, tools `[Read, Bash, Grep, Glob, Write, Edit, WebSearch]`
   - Researcher: `model: sonnet`, watches `[researching]`, tools `[Read, Bash, Grep, Glob, WebSearch, WebFetch]`
   - Writer: `model: opus`, watches `[writing, revising]`, tools `[Read, Bash, Grep, Glob, Write, Edit, Skill]`
   - Reviewer: `model: opus`, watches `[review]`, tools `[Read, Bash, Grep, Glob, Write, Edit, Skill]`
   - Why: defines the complete pipeline state machine; follows exact schema from `dev` preset
   - Dependencies: none

2. **Create `presets/content/defaults/ns-content-style-guide.md`**
   - Starter style guide with sections: Voice & Tone, Do's and Don'ts, Format Guidelines, Example Posts
   - Placeholder content the user customizes for their niche
   - Why: the writer and reviewer agents reference this; must exist from day one
   - Dependencies: none

3. **Create `presets/content/defaults/ns-content-platforms.md`**
   - Platform reference: Twitter/X (280 chars, thread conventions), LinkedIn (3000 chars, professional tone)
   - Character limits, hashtag rules, formatting conventions per platform
   - Why: writer needs platform constraints; reviewer validates against them
   - Dependencies: none

4. **Create `presets/content/defaults/ns-content-citizens.json`**
   - Color mapping for visualization: producer (blue), researcher (cyan), writer (green), reviewer (purple)
   - Same schema as `ns-dev-citizens.json`
   - Why: required for tmux pane coloring and miniverse visualization
   - Dependencies: none

5. **Create `presets/content/scaffold/` directory tree**
   - `scaffold/config/topics.yaml` — starter topics config with niche, audience, voice, and example topic entries
   - `scaffold/config/platforms.yaml` — platform handles and posting preferences (empty/template)
   - `scaffold/knowledge/style-guide.md` — symlink target or copy of the style guide for in-repo reference
   - `scaffold/knowledge/references/.gitkeep` — empty dir for user-curated reference material
   - `scaffold/knowledge/past-posts/.gitkeep` — empty dir for published posts (knowledge loop)
   - `scaffold/content-calendar.md` — starter calendar with header row and one example entry
   - `scaffold/drafts/.gitkeep` — empty dir for active draft PRs
   - `scaffold/CLAUDE.md` — content-repo-specific CLAUDE.md with project structure, conventions, and agent instructions
   - Why: `npx nightshift init --team content` should produce a ready-to-use content repo
   - Dependencies: none

### Phase 3: Agent Behavior Templates

Create the 4 agent behavior `.md` files. These are the core of the preset — they encode each agent's complete operating procedure using `{{mustache}}` template variables.

#### Tests First

- **Test file**: `tests/profiles.test.ts` (extend existing) or `tests/generate-agent.test.ts`
- **Test cases**:
  - `content agent templates exist for all roles`: assert files exist at `presets/content/agents/{producer,researcher,writer,reviewer}.md`
  - `content agent templates render without unresolved variables`: for each template, call `renderTemplate()` with `buildTemplateVars()` → assert no `{{...}}` remain in output
  - `content agent templates contain no banned terms`: check for terms like `TODO`, `FIXME`, `placeholder` (follow existing pattern from `profiles.test.ts`)
  - `content producer template references content-calendar.md`: grep for `content-calendar.md` in rendered output
  - `content writer template references style-guide`: grep for `style-guide` in rendered output
  - `content reviewer template references humanizer`: grep for `humanizer` or `AI-sounding` in rendered output

#### Implementation Steps

1. **Create `presets/content/agents/producer.md`**
   - Persona: pipeline orchestrator for content creation
   - Pipeline Role table: watches `content:request` and unlabeled issues
   - Workflow (each cycle):
     1. Fetch open issues
     2. **Inbox**: scan `content:request` issues → add to `content-calendar.md`, assign target date, enrich with angle/format, transition to `content:researching`, post comment
     3. **Fill gaps**: check `content-calendar.md` for empty dates in next 5–7 days → use `WebSearch` for trending topics in niche from `config/topics.yaml` → add as `status: idea`
     4. **Promote**: any `idea` rows with target date ≤ 3 days out → create GitHub issue with structured template, label `content:researching`, update calendar to `status: issue:#N`
     5. **Monitor**: issues stuck in a stage >2 cycles → add `content:blocked`, comment
     6. **Calendar maintenance**: update statuses as issues progress through pipeline
   - Guard rails: don't write content, don't research, just orchestrate
   - Comment format for triage
   - Uses `{{team_name}}`, `{{agent_name}}`, `{{home_branch}}` variables
   - Why: orchestrates the entire pipeline; must be precise about calendar format and state transitions
   - Dependencies: none

2. **Create `presets/content/agents/researcher.md`**
   - Persona: deep-dive researcher for content topics
   - Pipeline Role: watches `content:researching`
   - Workflow:
     1. Check lock, find work (issues labeled `content:researching`)
     2. Read the issue body for topic, references, guidelines
     3. Read `knowledge/references/` for any saved material on the topic
     4. Read `knowledge/past-posts/` to understand what angles have been covered recently (30-day window)
     5. Use `WebSearch` to find current discourse, data points, trending context, contrarian angles
     6. Compile a structured research brief as an issue comment with sections: Key Findings, Data Points, Quotes/Sources, Suggested Angles, Contrarian Takes, Related Past Posts
     7. Transition to `content:writing`
   - Guard rails: don't write drafts, output research only; keep research focused and actionable
   - Why: research quality determines post quality; structured brief format ensures writer has everything needed
   - Dependencies: none

3. **Create `presets/content/agents/writer.md`**
   - Persona: content writer turning research into polished drafts
   - Pipeline Role: watches `content:writing` and `content:revising`
   - Workflow:
     1. Check lock, find work
     2. Read issue body + research brief comment
     3. Read `knowledge/style-guide.md` for voice and tone rules
     4. Read `knowledge/past-posts/` recent posts for voice consistency
     5. Read `config/platforms.yaml` for platform constraints
     6. Write draft post(s) in markdown format:
        - Short-form version (≤280 chars for Twitter, ≤3000 for LinkedIn)
        - Thread version if configured (numbered sections with `---` separators)
        - Platform-specific variants if targeting multiple platforms
     7. Create/update a PR with draft at `drafts/YYYY-MM-DD-slug.md` including frontmatter (title, date, platform, topic, issue)
     8. Transition to `content:review`
     - For `content:revising`: read reviewer feedback, update the PR, re-request review
   - Draft format: defined markdown structure with YAML frontmatter
   - References `humanizer` skill for self-check before submitting
   - Guard rails: follow style guide strictly, never invent facts not in research brief
   - Why: the writer is the creative core; must produce platform-appropriate, voice-consistent content
   - Dependencies: none

4. **Create `presets/content/agents/reviewer.md`**
   - Persona: quality gatekeeper for content
   - Pipeline Role: watches `content:review`
   - Workflow:
     1. Check lock, find work
     2. Read the PR diff (the draft post)
     3. Read `knowledge/style-guide.md` for voice/tone rules
     4. Read `knowledge/past-posts/` for recent posts (30-day duplicate/angle check)
     5. Read the research brief from the issue comments
     6. Review checklist:
        - **Voice**: matches style guide tone? Sounds human, not AI-generated? (apply humanizer patterns)
        - **Accuracy**: all claims supported by research brief? No hallucinated stats or quotes?
        - **Originality**: angle not used in past 30 days? Fresh take, not rehash?
        - **Engagement**: has a hook? Provokes thought or action? Not generic?
        - **Format**: meets platform constraints? Thread structure correct? Hashtags appropriate?
     7. Decision:
        - Approve: approve the PR, transition to `content:approved`, post summary comment
        - Request changes: leave PR review with specific feedback, transition to `content:revising`
   - Guard rails: never rewrite content yourself, only provide feedback; be specific in revision requests
   - Why: quality gate prevents generic/AI-sounding content from reaching human review
   - Dependencies: none

### Phase 4: Knowledge Loop (post-merge commit-back)

Ensure published posts grow the knowledge base so future posts benefit from a richer style reference.

#### Tests First

- **Test file**: `tests/team-config.test.ts` or new `tests/content-producer.test.ts` (if testing producer logic)
- **Test cases**:
  - `producer template includes past-post commit-back instructions`: grep producer template for `past-posts` and `commit-back` or `after merge`
  - `reviewer template includes 30-day duplicate check`: grep for `30 days` or `duplicate` in reviewer template
  - `writer template includes duplicate awareness`: grep for `past-posts` in writer template

Note: the commit-back behavior is encoded in the producer's behavior template (instructions to check for merged PRs with `content:approved` and copy the final post to `knowledge/past-posts/`). No engine code change needed — this is agent behavior, not framework logic.

#### Implementation Steps

1. **Add commit-back instructions to producer template** (already part of Phase 3 step 1, but called out here for clarity)
   - In the producer's monitoring loop: check for merged PRs with `content:approved` label
   - For each merged PR: read the draft file from the PR, copy it to `knowledge/past-posts/YYYY-MM-DD-slug.md`, commit and push, update the issue label to `content:published`, close the issue
   - Why: the knowledge base must grow over time for voice consistency and duplicate detection to work
   - Dependencies: Phase 3

2. **Duplicate detection in writer and reviewer templates** (already part of Phase 3 steps 3-4)
   - Both agents read `knowledge/past-posts/` and check that the current angle hasn't been used in the past 30 days
   - The writer avoids repeating angles; the reviewer catches any that slip through
   - Why: prevents content staleness and repetition
   - Dependencies: Phase 3

## Testing Strategy

- **Approach**: Test-Driven Development (TDD) — tests are written BEFORE implementation in each phase
- **Unit tests** (Phase 1): `tests/copy.test.ts` — test `copyScaffoldFiles()` with temp directories (follow existing pattern of `mkdtempSync` + cleanup in `afterEach`)
- **Validation tests** (Phase 2): `tests/team-config.test.ts` — parse and validate `presets/content/team.yaml`
- **Template rendering tests** (Phase 3): `tests/profiles.test.ts` or `tests/generate-agent.test.ts` — render all 4 content agent templates, assert no unresolved variables, assert key content markers
- **Integration test** (Phase 2): `tests/copy.test.ts` — verify scaffold files exist and copy correctly
- **Test infrastructure**: reuse existing patterns — `node:test` + `node:assert/strict`, `mkdtempSync` for temp dirs, `rmSync` in `afterEach`, `fileURLToPath(import.meta.url)` for paths to real preset files
- **Verification command**: `npm run typecheck && npm run test`

## Assumptions

1. **No engine code changes beyond scaffold support** — the `presets/` autodiscovery and `team.yaml` → agent generation pipeline handles everything. The only engine change is adding `copyScaffoldFiles()` for repo-root scaffolding. Reviewer should validate this is the minimal-touch approach.
2. **WebSearch and WebFetch tools are available** — the researcher agent relies on these for trending topic research. They appear in the deferred tools list, so they should be available when the agent runs.
3. **Content repo is separate from nightshift repo** — the preset is designed for a dedicated content repository, not for running inside the nightshift codebase itself. The scaffold creates the full repo structure.
4. **Thread format uses `---` separators** — chose `---` between thread segments as the convention since it's visually clear in markdown and easy to parse. This resolves open question #2 from the issue.
5. **Text-only for v1** — no image/media generation per the issue's out-of-scope section. Resolves open question #3.
6. **Platform-specific variants** — writer produces separate versions for Twitter and LinkedIn rather than cross-posting identical content. Resolves open question #4 in favor of quality.
7. **Producer watches `unlabeled` for auto-generated content ideas** — the producer creates issues from `content-calendar.md` ideas that hit the 3-day-out threshold, using the same issue → pipeline flow as user-submitted requests.
8. **`Skill` tool for humanizer** — the writer and reviewer reference the `humanizer` skill. The reviewer uses it to catch AI-sounding language; the writer uses it for self-check before submitting.
9. **`scaffold/knowledge/style-guide.md` is a separate copy** from `defaults/ns-content-style-guide.md` — the defaults version is the nightshift-internal reference (used in `.claude/nightshift/`), the scaffold version is the user-facing in-repo file that agents read directly. They start with the same content but diverge as the user customizes.

## Risks & Mitigations

- **Risk**: Agent behavior templates are large and complex — the content pipeline is fundamentally different from the dev pipeline (no code, no tests, no PRs-as-code)
  - Mitigation: follow the exact structure of existing dev agent templates (persona → pipeline role → workflow → guard rails). Reuse the same `{{mustache}}` variables and generated Team Protocol section. The content-specific behavior is in the workflow steps, not the template structure.

- **Risk**: `copyScaffoldFiles()` could conflict with existing repo files if init is run in a non-empty repo
  - Mitigation: same skip-if-exists pattern as `copyExtensionFiles()` — never overwrite existing files. Files in `skipped` list are reported to the user.

- **Risk**: Research depth vs. speed tradeoff (open question #1) — shallow research produces generic posts
  - Mitigation: researcher template should be designed for one focused cycle per topic. The research brief structure (Key Findings, Data Points, Suggested Angles) ensures quality even in a single pass. If research is insufficient, the reviewer will catch it and transition to `content:revising` → back to researcher.

- **Risk**: Calendar format drift — producer manually edits a markdown table which can break formatting
  - Mitigation: producer template includes strict format rules and a self-validation step (parse the table after editing, ensure all required columns exist). The calendar format is simple enough that an LLM agent can maintain it reliably.
