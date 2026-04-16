# Nightshift Core — Product Spec

> The agent orchestration engine. Turns GitHub issues into shipped code
> via coordinated AI agent teams.

---

## WHY

1. **Tokenmaxxing** — maximize the value of every dollar spent on AI compute
2. **Hard to parallelize work if you're micro-managing** — the human bottleneck is oversight, not ideas
3. **Just work on defining things** — let agents handle execution

## WHO

**Everyone who vibe codes** — engineers and non-engineers alike.

## WHAT

A CLI tool that sets up coordinated AI agent teams in any GitHub repo. Agents autonomously triage issues, design systems, write plans, review code, implement features, run tests, write docs, and create content — all orchestrated through GitHub labels.

- **AI backends:** Claude Code (primary) + Codex
- **Platform:** GitHub only (issues, labels, PRs)

---

## Primitives

Three concepts. That's it.

### Team

A named group of agents that processes GitHub issues through stages. Defined in a single `team.yaml` file.

The team name = the GitHub label prefix = the `--team` flag value. A repo can run multiple teams concurrently (`dev`, `design`, `content`), each with its own labels, worktrees, and agents.

### Stage

A state an issue can be in. Issues flow through stages via agent transitions.

Regular stages are workflow states agents watch and transition between. Meta stages (`meta: true`) are labels used for signaling — `wip` (mutex lock), `blocked` (error state), `needs-info` (awaiting input) — but are never in any agent's "Finding Work" list. Every team must include `wip` as a meta stage.

### Agent

A single autonomous worker. Defined in two parts:

- **Config** (in `team.yaml`) — what it watches, transitions to, tools, model, worktree, scalability
- **Behavior** (in `agents/<name>.md`) — how it does its job. Zero coordination logic — just instructions.

`init` merges both into a **complete, self-contained `.md` file** installed to `~/.claude/agents/`. At runtime, the agent reads only its own file — no YAML parsing, no template resolution.

---

## Teams

### Dev **[BUILT]**

Triage → plan → review → code → test → merge.

| Agent | Purpose | Status |
|-------|---------|--------|
| **Producer** | Triages issues, creates branches, monitors health | [BUILT] |
| **Planner** | Explores codebase, writes TDD implementation plans | [BUILT] |
| **Reviewer** | Reviews plans and code with staff-level rigor | [BUILT] |
| **Coder** | Implements from approved plans, raises PRs (TDD) | [BUILT] |
| **Tester** | Runs test suites, reports results | [BUILT] |

Labels: `dev:planning` → `dev:plan-review` → `dev:approved` → `dev:code-review` → `dev:testing` → `dev:ready-to-merge`

Features shipped: multi-coder (1-4), bug fast-track, stale issue detection, `dev:wip` mutex, git worktree isolation, per-agent model config.

### System Design (NEW)

The "thinking" layer above dev. For features too big or ambiguous for a single planner pass. Output: a spec + set of GitHub issues that feed into the dev team.

| Agent | Purpose |
|-------|---------|
| **Producer** | Triages complex feature requests needing system-level design |
| **Planner** | Deeply researches codebase + requirements, produces system design with phased TDD breakdown |
| **Reviewer** | Reviews architecture for scalability, maintainability, TDD compliance |
| **Issue Creator** | Breaks approved spec into well-scoped GitHub issues for the dev team |

Same agent name (`planner`), different scope: `ns-dev-planner` = issue-level, `ns-design-planner` = system-level.

### Adversarial Review (NEW)

A standalone `@ns-dev-adversary` agent that independently attacks PRs — finds edge cases, security holes, race conditions. Can be a **different AI model** (Codex, Gemini) for cross-model diversity.

### Docs & Changelog (NEW)

| Agent | Purpose |
|-------|---------|
| **Docs Producer** | Detects merged PRs needing doc updates |
| **Doc Writer** | Generates/updates API docs, guides, changelogs |
| **Doc Reviewer** | Reviews docs for accuracy and completeness |

### Content (NEW)

| Agent | Purpose |
|-------|---------|
| **Content Producer** | Picks up content requests (issues, release triggers) |
| **Writer** | Drafts blog posts, tweets, LinkedIn posts |
| **Editor** | Reviews content for tone, accuracy, engagement |

### Roadmap Order

1. Dev — [BUILT]
2. System Design
3. Adversarial Review
4. Docs & Changelog
5. Content

---

## `team.yaml`

Each team is defined by one config file. Full example (dev team):

```yaml
name: dev
description: Software development team

stages:
  - name: planning
    color: "1d76db"
  - name: plan-review
    color: "5319e7"
  - name: plan-revising
    color: "fbca04"
  - name: approved
    color: "0e8a16"
  - name: code-review
    color: "5319e7"
  - name: code-revising
    color: "fbca04"
  - name: testing
    color: "1d76db"
  - name: ready-to-merge
    color: "0e8a16"
  - name: wip
    color: "ededed"
    meta: true
  - name: blocked
    color: "d93f0b"
    meta: true
  - name: needs-info
    color: "d93f0b"
    meta: true

agents:
  producer:
    description: Triages new issues, monitors team health
    watches: [unlabeled, ready-to-merge]
    transitions:
      triage-feature: planning
      triage-bug: approved
      validate-fail: code-revising
    tools: [Read, Grep, Glob, Bash]
    worktree: false
    model: sonnet

  planner:
    description: Explores codebase, writes implementation plans
    watches: [planning, plan-revising]
    transitions:
      success: plan-review
      error: blocked
    tools: [Read, Grep, Glob, Bash, Write, Edit, Agent]
    worktree: true
    model: opus

  reviewer:
    description: Reviews plans and code for quality
    watches: [plan-review, code-review]
    transitions:
      plan-approve: approved
      plan-reject: plan-revising
      code-approve: testing
      code-reject: code-revising
    tools: [Read, Grep, Glob, Bash]
    worktree: true
    model: opus

  coder:
    description: Implements from approved plans, raises PRs
    watches: [approved, code-revising]
    transitions:
      success: code-review
      error: blocked
    tools: [Read, Grep, Glob, Bash, Write, Edit, Agent, Skill]
    worktree: true
    scalable: true
    instances: 2
    max_instances: 4
    model: opus

  tester:
    description: Runs tests, reports results
    watches: [testing]
    transitions:
      pass: ready-to-merge
      fail: code-revising
    tools: [Read, Grep, Glob, Bash]
    worktree: true
    model: sonnet
```

### Agent fields

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `description` | yes | — | One-line description |
| `watches` | yes | — | Stages this agent picks up work from (or `unlabeled`) |
| `transitions` | yes | — | Named transitions → target stage |
| `tools` | yes | — | Claude Code tools this agent can use |
| `model` | yes | — | `sonnet` or `opus` |
| `worktree` | no | `true` | Whether agent gets its own git worktree. `false` = runs from repo root |
| `scalable` | no | `false` | Whether multiple instances can be stamped (e.g., coder-1, coder-2) |
| `instances` | no | `1` | Default instance count (only for scalable agents) |
| `max_instances` | no | `4` | Upper bound. `init` errors if requested count exceeds this |

### Scalable agents

When `scalable: true`, `init` stamps N copies. Naming: `ns-<team>-<name>-<N>` (e.g., `ns-dev-coder-2`). Each instance gets its own worktree, branch (`_ns/<team>/<name>-<N>`), lock file, and status file.

Instance count: `--coders N` CLI flag (backward compat) or `instances` in team.yaml. CLI flag wins if both are present.

---

## Preset Structure

```
presets/
├── dev/
│   ├── team.yaml              ← stages + agents config
│   ├── agents/                ← behavior templates (instructions only)
│   │   ├── producer.md
│   │   ├── planner.md
│   │   ├── reviewer.md
│   │   ├── coder.md           ← stamped per instance
│   │   └── tester.md
│   └── defaults/              ← user-customizable extension files
│       ├── plan-template.md
│       ├── review-criteria.md
│       ├── pr-template.md
│       └── test-config.md
├── design/
│   ├── team.yaml
│   ├── agents/
│   └── defaults/
└── content/
    ├── team.yaml
    ├── agents/
    └── defaults/
```

Behavior templates use `{{mustache}}` variables (`{{agent_name}}`, `{{team_name}}`, `{{repo_name}}`, etc.) substituted at init time. Generated files contain only literal paths — nothing to resolve at runtime.

---

## Commands

```bash
npx nightshift init --team dev                        # init from built-in preset [BUILT]
npx nightshift init --team deploy --from ./my-team/   # init from custom definition [NEW]
npx nightshift reinit --team dev                      # regenerate agent files after config changes [NEW]
npx nightshift reinit --team dev --agent planner      # regenerate one agent [NEW]
npx nightshift start --team dev                       # launch in tmux [BUILT]
npx nightshift start --team dev --headless            # launch as background processes [BUILT]
npx nightshift stop --team dev                        # graceful shutdown [BUILT]
npx nightshift list                                   # show teams and agents [BUILT]
npx nightshift teardown --team dev                    # full cleanup [BUILT]
```

---

## How `init` Works

1. **Find team definition**: `--from` path → `.claude/nightshift/teams/<team>/` → `presets/<team>/`
2. **Validate** `team.yaml`: stages, agents, transitions all reference valid targets. `wip` meta stage must exist. Every agent has a matching behavior template.
3. **Generate agent files**: for each agent:
   - Read behavior template (check `.claude/nightshift/agents/` override first, then built-in)
   - Generate Team Protocol section from config (watches, transitions, lock commands, branch commands)
   - Generate frontmatter (name, tools, model)
   - If scalable, stamp N copies
   - Write to `~/.claude/agents/ns-<team>-<name>.md`
4. **Create GitHub labels** from stages (idempotent — skips existing)
5. **Create worktrees** for agents with `worktree: true` (skips existing)
6. **Copy extension files** from defaults (skips existing — preserves user edits)
7. **Update** CLAUDE.md (dynamic table from team.yaml) and .gitignore

### Idempotency

| Resource | First run | Re-run |
|----------|-----------|--------|
| GitHub labels | Creates | Skips existing |
| Worktrees | Creates | Skips existing |
| Agent files (`~/.claude/agents/`) | Writes | Overwrites (regenerated) |
| Extension files (`.claude/nightshift/`) | Copies defaults | Skips existing (preserves edits) |
| CLAUDE.md section | Appends | Replaces section for this team |

Scaling up (2 → 4 coders): new worktrees created, existing untouched. Scaling down: use `teardown` + re-init.

### `init` vs `reinit`

`reinit` is lightweight: regenerates agent files and labels only. Does NOT create worktrees, copy defaults, update CLAUDE.md, or install deps. Safe to run while agents are active (agents load their file once at invocation; new file takes effect next cycle).

---

## How `start` Works

`start` reads `team.yaml` to discover agents — no hardcoded role names.

1. Parse `team.yaml` for the agent list
2. Expand scalable agents to N instances
3. Determine each agent's `cwd` (worktree path or repo root)
4. Build runner commands with model flags

**Tmux layout**: left column = non-scalable agents (stacked), right column = scalable agent instances. Single column if no scalable agents.

**Headless**: same discovery, spawns background processes per agent.

**Stop (multi-team safe)**: `stop --team <name>` kills only that team's session/PIDs. Visualization server stays running if other teams are active.

---

## User Overrides

### Extension files

Copied to `.claude/nightshift/` during init. Agents read them at runtime (no reinit needed to pick up changes):

- `ns-<team>-plan-template.md` — plan structure
- `ns-<team>-review-criteria.md` — review thresholds
- `ns-<team>-pr-template.md` — PR format
- `ns-<team>-test-config.md` — test commands

### Behavior overrides

To change how an agent behaves, drop an override in `.claude/nightshift/agents/ns-<team>-<name>.md`. This is version controlled in the repo. `init`/`reinit` uses the override instead of the built-in behavior template.

`--reset` overwrites extension files back to defaults but never touches behavior overrides (those are deliberate user customization).

### Custom teams

Users can define entirely new teams:

```
.claude/nightshift/teams/deploy/
├── team.yaml
├── agents/
│   ├── deployer.md
│   └── validator.md
└── defaults/
```

```bash
npx nightshift init --team deploy --from .claude/nightshift/teams/deploy
```

Validation: team.yaml must parse, every agent must have a behavior template, transitions must target defined stages, `wip` meta stage must exist.

---

## Issue Routing (Multi-Team)

- **`dev` is the default team** — its producer watches **unlabeled** issues
- **Every other team** watches for its entry label (matching the team name)

```yaml
# dev:   watches: [unlabeled]       ← default, picks up untagged issues
# design: watches: [design]         ← picks up issues labeled "design"
# content: watches: [content]       ← picks up issues labeled "content"
```

Issues get entry labels via: GitHub issue templates (pre-tagged), manual labeling, or cross-team agents (`gh issue create --label "dev"`).

---

## Event Interface (→ Agentville)

Nightshift emits events that Agentville consumes. Agentville is an independent product — nightshift is one integration, but any CLI agent tool can connect.

| Event | Trigger | Data |
|-------|---------|------|
| `agent:heartbeat` | Every hook invocation | agent, status, source, current action |
| `work:completed` | PR merged, test passed, review approved | work type, agent, source, metadata |
| `agent:spawned` | Sub-agent created | parent, child, source |
| `agent:spawn-ended` | Sub-agent finished | parent, child, source |
| `agent:idle` | Agent enters idle/sleep | agent, source, duration |
| `agent:error` | Agent encounters an error | agent, source, error type |

Transport: Hook/adapter → HTTP POST to Agentville server (`localhost:4321/events`). **[BUILT for Claude Code]**

Agentville is entirely optional — Core works standalone. Agentville works standalone too — doesn't require nightshift.

---

## Tech Stack

| Layer | Technology | Status |
|-------|-----------|--------|
| Language | TypeScript 5.9 (ESM) | [BUILT] |
| Runtime | Node.js >= 18 | [BUILT] |
| CLI | chalk, prompts | [BUILT] |
| Build | tsc | [BUILT] |
| Tests | Node.js built-in test runner | [BUILT] |
| AI backbone | Claude Code + Codex | Claude Code [BUILT], Codex [PLANNED] |
| VCS | git + git worktrees | [BUILT] |
| Coordination | GitHub Issues + Labels (via gh CLI) | [BUILT] |
| Terminal | tmux (optional — headless available) | [BUILT] |

---

## Open Questions

1. **Adversarial Review trigger** — Always-on for all PRs, or opt-in via label?
2. **Codex integration** — What does the agent loop look like for Codex vs. Claude Code? Same `/loop` or different runner?

---

## Gap Analysis (Current State → Spec)

Verified against codebase on 2026-04-14.

### What's Built

- Dev team agents (producer, planner, reviewer, coder×N, tester) — full workflow
- tmux layout + headless mode
- GitHub labels (create/remove, idempotent)
- Git worktrees (create/remove, per-agent isolation)
- Per-agent model config (`ns-dev-agents.json` — will be absorbed into `team.yaml`)
- Multi-coder support (1-4 instances, stamped from template)
- Stale issue detection + repair (producer)
- Event hooks → miniverse visualization
- CLI: init, start, stop, list, teardown

### What Needs to Change

| Gap | Current | Spec |
|-----|---------|------|
| **No team.yaml** | Labels in `labels.json`, agents hardcoded in `init.ts` + `start.ts` | Single `team.yaml` defines stages, agents, transitions, tools, model, worktree, scalability |
| **Hardcoded agent list** | `init.ts:470-475` builds `[planner, reviewer, coder-N, tester]`; `start.ts:42-60` builds same list | Dynamic from `team.yaml` agents section |
| **Agent profiles = copied** | `copy.ts:60-97` copies preset `.md` files as-is | Init generates self-contained `.md` by merging behavior template + team.yaml config |
| **No mustache templating** | Agent profiles have hardcoded team/repo names | `{{agent_name}}`, `{{team_name}}`, `{{repo_name}}` substituted at init |
| **No Team Protocol section** | Watches, transitions, lock logic embedded in each agent profile manually | Generated Team Protocol section from team.yaml config |
| **Labels in JSON** | `presets/dev/labels.json` | Stages (with colors, meta flags) defined in `team.yaml` |
| **No reinit** | Must re-run full init | Lightweight: regenerate agent files + labels only |
| **No --from flag** | Only built-in presets | Load from custom directory |
| **No behavior overrides** | No override mechanism | `.claude/nightshift/agents/` overrides built-in templates |
| **Coder-only scaling** | Only "coder" can scale | Any agent with `scalable: true` |
| **CLAUDE.md hardcoded** | `buildTeamSubsection()` lists hardcoded agent names | Dynamic table from team.yaml |
| **Teardown hardcoded** | `teardown.ts:183-186` hardcodes `[producer, planner, reviewer, coder-N, tester]` | Dynamic from team.yaml |
| **`ns-dev-agents.json` redundant** | `agent-config.ts` reads separate JSON for model/thinkingBudget/reasoningEffort at start time | Model + runtime config moves to `team.yaml` agent fields; `start.ts` reads team.yaml directly. JSON file deleted. |
| **`hooks.ts` hardcodes producer** | `hooks.ts:72,125` uses `role === 'producer'` to decide repo root vs worktree | Should use `worktree: false` from team.yaml, not role name |
| **`discoverCoderCount` coder-only** | `worktrees.ts:131` scans for `coder-*` dirs only; used by `list`, `start`, `teardown` | Replace with generic `discoverAgentInstances()` or read from team.yaml |

---

## Implementation Phases & Tasks

### Dependency Graph

```
Phase 1 (team.yaml foundation)
    ↓
Phase 2 (agent file generation)
    ↓
Phase 3 (init refactor)
    ↓
Phase 4 (start/stop refactor) ←── can parallelize with Phase 5
    ↓
Phase 5 (reinit command)
    ↓
Phase 6 (overrides & custom teams)
    ↓
Phase 7 (cleanup & migration)
```

---

### Phase 1: team.yaml Foundation

#### Task 1.1 — Add YAML parser and define TeamConfig types

**Goal:** Create the type system and parser for team.yaml.

**Files to create:**
- `lib/team-config.ts` — parser, validator, types

**Files to modify:**
- `package.json` — add `yaml` dependency

**Types to define:**
```typescript
interface TeamConfig {
  name: string;
  description: string;
  stages: StageConfig[];
  agents: Record<string, AgentDefinition>;
}

interface StageConfig {
  name: string;
  color: string;
  meta?: boolean;  // default false
}

interface AgentDefinition {
  description: string;
  watches: string[];           // stage names or "unlabeled"
  transitions: Record<string, string>;  // transition-name → target stage
  tools: string[];
  model: string;               // "sonnet" | "opus"
  worktree?: boolean;          // default true
  scalable?: boolean;          // default false
  instances?: number;          // default 1
  max_instances?: number;      // default 4
  thinking_budget?: string;    // e.g., "high" — optional, passed as --thinking-budget flag
  reasoning_effort?: string;   // e.g., "high" — optional, passed as --reasoning-effort flag
}
```

**Functions to implement:**
- `parseTeamConfig(yamlPath: string): TeamConfig` — read and parse YAML
- `parseTeamConfigFromString(yaml: string): TeamConfig` — parse from string (for testing)
- `validateTeamConfig(config: TeamConfig): ValidationResult` — validate rules:
  - `wip` meta stage must exist
  - Every agent `watches` entry must be a defined stage name (or `"unlabeled"`)
  - Every agent `transitions` value must be a defined stage name
  - Every scalable agent has `instances <= max_instances`
  - No duplicate stage names
  - Team name matches `[a-z][a-z0-9-]*[a-z0-9]` pattern
- `getLabelsFromConfig(config: TeamConfig): Label[]` — extract label definitions from stages
- `getAgentRoles(config: TeamConfig): string[]` — ordered list of agent role names
- `getScalableAgents(config: TeamConfig): string[]` — agents with scalable: true
- `expandAgentInstances(config: TeamConfig, overrides?: Record<string, number>): ExpandedAgent[]` — expand scalable agents to N instances

**Tests to write** (`tests/team-config.test.ts`):
- Parses valid team.yaml
- Validates missing wip stage
- Validates transition to undefined stage
- Validates watches referencing undefined stage
- Validates scalable instances within max
- Extracts labels from stages
- Expands scalable agents correctly
- Rejects invalid team names

**Acceptance criteria:**
- `npm test` passes with all new tests
- `npm run typecheck` passes
- Zero runtime dependencies on existing code (pure additive)

---

#### Task 1.2 — Create dev team.yaml preset

**Goal:** Write the canonical dev team.yaml that captures all current config.

**Files to create:**
- `presets/dev/team.yaml`

**Content:** Must match the example in the spec's `team.yaml` section exactly (stages with colors, all 5 agents with their config). Cross-reference against:
- Current `presets/dev/labels.json` for stage names and colors
- Current agent profiles for tools, model, worktree usage
- Current `init.ts` for scaling behavior

**Note:** `ns-dev-citizens.json` (display names/colors for Agentville visualization) is NOT part of team.yaml — it stays as an independent extension file in `presets/dev/defaults/`. Do not move or delete it.

**Tests to write** (add to `tests/team-config.test.ts`):
- Parse `presets/dev/team.yaml` — verify it loads without validation errors
- Verify label extraction matches current `labels.json` content
- Verify agent count is 5 (producer, planner, reviewer, coder, tester)
- Verify coder has `scalable: true, instances: 2, max_instances: 4`
- Verify producer has `worktree: false`

**Acceptance criteria:**
- `parseTeamConfig('presets/dev/team.yaml')` returns valid config
- `validateTeamConfig()` passes with zero errors
- Stage names + colors match existing `labels.json` exactly

---

### Phase 2: Agent File Generation

#### Task 2.1 — Template engine (mustache substitution)

**Goal:** Simple `{{variable}}` replacement for agent behavior templates.

**Files to create:**
- `lib/template.ts`

**Functions to implement:**
- `renderTemplate(template: string, vars: Record<string, string>): string` — replace `{{key}}` with `vars[key]`
- `extractTemplateVars(template: string): string[]` — list all `{{var}}` references
- `validateTemplateVars(template: string, availableVars: string[]): string[]` — return undefined vars

**Standard variables** (available in all templates):
- `{{agent_name}}` — e.g., `ns-dev-producer`
- `{{agent_role}}` — e.g., `producer`
- `{{team_name}}` — e.g., `dev`
- `{{repo_name}}` — e.g., `nightshift`
- `{{main_branch}}` — e.g., `main`
- `{{team_dir}}` — e.g., `~/.nightshift/nightshift/dev`
- `{{instance_number}}` — e.g., `1` (for scalable agents)

**Undefined variable behavior:** Hard error. If a `{{var}}` in the template has no matching key in `vars`, `renderTemplate()` must throw with a descriptive message listing the undefined variable names. Silent pass-through of unresolved `{{vars}}` is a bug — generated agent files must be fully self-contained with no template syntax remaining.

**Tests to write** (`tests/template.test.ts`):
- Replaces single variable
- Replaces multiple variables
- Throws on undefined `{{var}}` with descriptive error message
- Extracts variable names from template
- Validates missing variables

**Acceptance criteria:**
- Pure string transformation, no side effects
- Unresolved `{{vars}}` throw, never pass through silently
- `npm test` passes

---

#### Task 2.2 — Agent file generator

**Goal:** Merge behavior template + team.yaml config → complete, self-contained agent `.md` file.

**Files to create:**
- `lib/generate-agent.ts`

**Functions to implement:**
- `generateAgentFile(options: GenerateOptions): string` — main entry point
  ```typescript
  interface GenerateOptions {
    teamConfig: TeamConfig;
    agentName: string;         // role name from team.yaml (e.g., "producer")
    behaviorTemplate: string;  // raw behavior markdown
    templateVars: Record<string, string>;
    instanceNumber?: number;   // for scalable agents
  }
  ```
- `generateFrontmatter(agent: AgentDefinition, fullName: string): string` — YAML frontmatter block
- `generateTeamProtocol(teamConfig: TeamConfig, agentName: string): string` — the generated protocol section

**Output structure** (the generated `.md` file):
```
# This file is managed by nightshift. Do not edit directly.
# To customize behavior, create an override at:
#   .claude/nightshift/agents/{{agent_name}}.md

---
name: {{agent_name}}
description: {{description}}
tools: {{tools}}
model: {{model}}
memory: project
---

<PIPELINE-AGENT>
[... standard pipeline agent marker ...]
</PIPELINE-AGENT>

[... rendered behavior template ...]

## Team Protocol (Generated)

### Finding Work
Watch for issues with labels: {{watches_labels}}

### Transitions
| Action | Command |
|--------|---------|
| {{name}} | gh issue edit $ISSUE --remove-label "{{team}}:{{from}}" --add-label "{{team}}:{{to}}" |

### Locking
[... lock/unlock commands using team dir ...]

### Branch Protocol
[... branch checkout/return commands ...]
```

**Tests to write** (`tests/generate-agent.test.ts`):
- Generates frontmatter with correct fields
- Generates Team Protocol with watches → gh commands
- Generates transition commands
- Generates lock commands with correct paths
- Handles scalable agent (instance number in name)
- Full round-trip: behavior + config → valid agent file

**Acceptance criteria:**
- Generated file is self-contained — no runtime YAML parsing needed
- Generated file for dev team agents is functionally equivalent to current profiles
- `npm test` passes

---

#### Task 2.3 — Convert dev preset agents to behavior-only templates

**Goal:** Restructure the 5 dev agent profiles into behavior-only templates that work with the generator.

**Files to modify:**
- `presets/dev/agents/ns-dev-producer.md` → `presets/dev/agents/producer.md`
- `presets/dev/agents/ns-dev-planner.md` → `presets/dev/agents/planner.md`
- `presets/dev/agents/ns-dev-reviewer.md` → `presets/dev/agents/reviewer.md`
- `presets/dev/agents/ns-dev-coder.md` → `presets/dev/agents/coder.md`
- `presets/dev/agents/ns-dev-tester.md` → `presets/dev/agents/tester.md`

**What to strip from each:**
- YAML frontmatter (now generated from team.yaml)
- `<PIPELINE-AGENT>` block (now generated)
- Team Protocol / Finding Work sections (now generated)
- Lock/unlock commands (now generated)
- Branch checkout/return commands (now generated)
- Hardcoded team/repo names → `{{mustache}}` variables

**What to keep:**
- Role description ("You are @{{agent_name}} — ...")
- Behavioral workflow steps
- Decision-making logic
- Domain-specific instructions (e.g., TDD approach for coder, review criteria for reviewer)
- References to extension files (using `{{team_name}}` variables)

**Critical constraint:** The generated output (behavior template + team.yaml → generated file) must be functionally equivalent to the current complete profiles. Diff and verify.

**Tests to write** (add to `tests/generate-agent.test.ts`):
- For each of the 5 agents: generate file from template + team.yaml, verify key sections are present
- Verify no `{{variables}}` remain unsubstituted in generated output

**Acceptance criteria:**
- Old agent profiles preserved in git history
- New templates use `{{mustache}}` variables throughout
- Files renamed from `ns-dev-<role>.md` to `<role>.md` (team prefix added at generation time)
- Round-trip test: template + config → output ≈ current profile

---

### Phase 3: Init Refactor

#### Task 3.1 — Refactor init to use team.yaml for label creation

**Goal:** Replace `labels.json` with `team.yaml` stages as the source of truth for GitHub labels.

**Files to modify:**
- `lib/labels.ts` — new `createLabelsFromConfig(team: string, config: TeamConfig): number`
- `lib/init.ts` — call new function instead of `createLabels(team, presetDir)`

**Changes:**
- `createLabelsFromConfig()` iterates `config.stages`, creates `<team>:<stage.name>` labels with `stage.color`
- Add description from stage name (auto-generate: "Issue is in {name} stage" or similar)
- Keep `createLabels()` temporarily for backward compat (call both, or migrate)
- Meta stages get labels too (they're used for signaling)

**Tests to modify** (`tests/labels.test.ts`):
- Test `createLabelsFromConfig()` with a TeamConfig object
- Verify label count matches stages count

**Acceptance criteria:**
- Labels created from team.yaml match current labels.json output exactly
- `npm test` passes

---

#### Task 3.2 — Refactor init for dynamic agent discovery and profile generation

**Goal:** Replace all hardcoded agent lists in `init.ts` with team.yaml-driven discovery, and replace `copyAgentProfiles()` with the new generation pipeline.

**Files to modify:**
- `lib/init.ts` — major refactor of `init()` function
- `lib/copy.ts` — deprecate `copyAgentProfiles()`

**Specific changes:**

1. **Team definition lookup** (new, `init.ts`):
   - Find team definition: `--from` path → `.claude/nightshift/teams/<team>/` → `presets/<team>/`
   - Check for `team.yaml` in the resolved directory
   - Parse and validate

2. **Replace hardcoded agent list** (`init.ts:470-475`):
   - Current: `['planner', 'reviewer', ...coders, 'tester']`
   - New: `expandAgentInstances(config)` to get full agent list
   - Filter to agents with `worktree: true` for worktree creation

3. **Replace hardcoded CLAUDE.md** (`init.ts:268-281`):
   - Current: `buildTeamSubsection()` hardcodes producer/planner/reviewer/coder/tester
   - New: iterate `config.agents`, dynamically build table rows

4. **Replace `copyAgentProfiles()` with generation pipeline**:
   - For each agent (expanded for scalable):
     a. Find behavior template (override: `.claude/nightshift/agents/<role>.md` → built-in: `presets/<team>/agents/<role>.md`)
     b. Build template variables (agent_name, team_name, repo_name, etc.)
     c. Render template with mustache substitution
     d. Generate complete agent file (frontmatter + rendered behavior + Team Protocol)
     e. Write to `~/.claude/agents/ns-<team>-<role>.md`
   - Log count of generated files

5. **Backward compat for `--coders` flag**:
   - If `--coders N` is passed and team.yaml has a scalable agent, override its `instances`

6. **Add `--from` flag**:
   - Parse `--from <path>` from CLI args
   - Validate the custom directory has `team.yaml` + matching behavior templates

**Tests to modify/create:**
- Init with team.yaml creates correct worktrees
- Init with --from loads custom team definition
- Init with --coders overrides scalable agent instances
- CLAUDE.md section matches team.yaml agents
- Generated files in `~/.claude/agents/` are functionally equivalent to current copied profiles
- Scalable agents produce correctly numbered instances

**Acceptance criteria:**
- `npx nightshift init --team dev` produces identical results to current
- `npx nightshift init --team dev --from ./custom/` works
- No hardcoded agent names remain in init.ts
- Generated agent files are self-contained (no unresolved `{{vars}}`)
- `npm test` passes

---

### Phase 4: Start/Stop Refactor

#### Task 4.1 — Refactor start, list, and hooks to discover agents from team.yaml

**Goal:** Replace `buildAgentList()` hardcoded list with team.yaml-driven agent discovery. Fix hooks.ts hardcoded role check. Update list command. Remove `ns-dev-agents.json` dependency.

**Files to modify:**
- `lib/start.ts` — refactor `buildAgentList()` and callers, read model/thinkingBudget/reasoningEffort from team.yaml instead of `ns-dev-agents.json`
- `lib/hooks.ts` — replace `role === 'producer'` with worktree flag from team.yaml
- `lib/worktrees.ts` — replace `discoverCoderCount()` with `discoverAgentWorktrees(repoName, team): string[]` that scans all worktree dirs (not just `coder-*`)
- `lib/agent-config.ts` — refactor to read from team.yaml instead of `ns-dev-agents.json`
- `bin/nightshift.ts` — update `list` command to show all agents from team.yaml, not just coder count

**Changes:**

1. **New `buildAgentListFromConfig()`**:
   - Read team.yaml (lookup same as init: `.claude/nightshift/teams/` → `presets/`)
   - Expand scalable agents to N instances
   - For each agent: determine `cwd` (worktree path if `worktree: true`, else repo root)
   - Return `AgentEntry[]` with worktree flag included

2. **Fix `hooks.ts` hardcoded producer check** (`hooks.ts:72,125`):
   - Current: `if (role === 'producer') { dir = repoRoot; }`
   - New: pass `worktreeMap: Record<string, boolean>` to `installHooks()`/`removeHooks()` — agents with `worktree: false` use repo root, others use worktree path
   - This is critical for custom teams where a non-producer agent might have `worktree: false`

3. **Dynamic tmux layout**:
   - Current: hardcoded 4-pane sidebar split (`start.ts:329-333`)
   - New: dynamically create N sidebar panes for N non-scalable agents, right column for scalable agents
   - If no scalable agents → single column layout

4. **Replace `discoverCoderCount()`**:
   - New: `discoverAgentWorktrees(repoName, team)` returns all worktree directory names (not just `coder-*`)
   - Update `list` command to show agent list from team.yaml instead of `(N coders)`

5. **Model/runner config from team.yaml**:
   - Current: `loadAgentConfig()` reads `ns-dev-agents.json` for model, thinkingBudget, reasoningEffort
   - New: read these from team.yaml's agent definition fields
   - `buildRunnerForAgent()` stays the same — just fed from different source

**Tests to modify** (`tests/start.test.ts`, `tests/hooks.test.ts`):
- `buildAgentListFromConfig()` with team.yaml returns correct agents
- Layout splits scalable vs non-scalable correctly, dynamic pane count
- Agent entries have correct cwd paths
- Hooks installed at repo root for `worktree: false` agents (not just producer)
- List command shows all agents from team.yaml

**Acceptance criteria:**
- `npx nightshift start --team dev` produces identical tmux layout
- No hardcoded agent names or role checks remain in start.ts, hooks.ts
- Tmux layout dynamically creates N sidebar panes for N non-scalable agents (not hardcoded 4)
- `hooks.ts` uses `worktree` field from team.yaml, not `role === 'producer'`
- `npx nightshift list` shows all agents per team, not just coder count
- `npm test` passes

---

#### Task 4.2 — Refactor teardown for dynamic agent discovery

**Goal:** Replace hardcoded role lists in teardown with team.yaml-driven discovery.

**Files to modify:**
- `lib/teardown.ts` — replace hardcoded `[producer, planner, reviewer, coder-N, tester]`

**Agent discovery strategy (filesystem-first):**
Teardown must work even when team.yaml has already been edited (e.g., user scaled down from 4→2 coders before teardown). The discovery order is:

1. **Scan filesystem first** — `discoverAgentWorktrees(repoName, team)` reads actual worktree directories in `~/.nightshift/<repo>/<team>/worktrees/`. Also scan `~/.claude/agents/ns-<team>-*.md` for agents without worktrees. This catches everything that actually exists on disk.
2. **Merge with team.yaml** — if team.yaml is available, merge its agent list (catches agents with `worktree: false` that have no worktree dir). team.yaml is supplementary, not primary.

This ensures teardown never leaves orphaned worktrees, agent files, or hooks behind.

**Changes:**
- Replace hardcoded role list with filesystem-first discovery
- Pass worktree flags through to `removeHooks()` (uses updated hooks.ts from Task 4.1)
- Expand scalable agents using filesystem scan, not team.yaml instance count

**Acceptance criteria:**
- `npx nightshift teardown --team dev` works identically to current
- Teardown correctly discovers and removes all existing worktrees by scanning the filesystem, regardless of current team.yaml instance count
- No hardcoded agent names remain in teardown.ts
- `npm test` passes

---

### Phase 5: Reinit Command

#### Task 5.1 — Implement reinit CLI command

**Goal:** Add `npx nightshift reinit` for lightweight agent file regeneration.

**Files to modify:**
- `bin/nightshift.ts` — add `reinit` command to dispatcher
- `lib/reinit.ts` — implement reinit logic (extract shared generation logic from `init.ts`)

**CLI interface:**
```bash
npx nightshift reinit --team dev                      # regenerate all agents + labels
npx nightshift reinit --team dev --agent planner       # regenerate one agent only
```

**Reinit does:**
- Parse team.yaml (same lookup chain as init)
- Regenerate agent files in `~/.claude/agents/` (overwrites)
- Recreate GitHub labels from stages (idempotent — skips existing)
- Respects behavior overrides in `.claude/nightshift/agents/`

**Reinit does NOT:**
- Create worktrees
- Install dependencies
- Copy extension files
- Update CLAUDE.md
- Update .gitignore

**`--agent` flag:**
- Only regenerate the specified agent's file
- Skip label creation
- Useful after editing a behavior template or team.yaml agent config

**Tests to write** (`tests/reinit.test.ts` or add to existing):
- Reinit regenerates agent files
- Reinit with --agent only touches one file
- Reinit skips worktree creation
- Reinit idempotent for labels

**Acceptance criteria:**
- `npx nightshift reinit --help` shows usage
- Safe to run while agents are active (files reloaded on next cycle)
- `npm test` passes

---

### Phase 6: Overrides & Custom Teams

#### Task 6.1 — Behavior override system

**Goal:** Allow users to override agent behavior templates per-repo.

**Files to modify:**
- `lib/generate-agent.ts` — template lookup with override
- `lib/init.ts` — update `--reset` logic (`init.ts:431-442`) to explicitly exclude `.claude/nightshift/agents/` directory from deletion. Currently `--reset` deletes `ns-<team>-*.md` files from `.claude/nightshift/` — this must NOT touch `.claude/nightshift/agents/` (behavior overrides are deliberate user customization).

**Override lookup order:**
1. `.claude/nightshift/agents/<role>.md` (repo-level override, version controlled)
2. `presets/<team>/agents/<role>.md` (built-in default)

**Rules:**
- `init` and `reinit` use the override if present
- `--reset` flag resets extension files but NEVER touches `.claude/nightshift/agents/` (behavior overrides)
- Overrides are behavior-only templates (same format as built-in templates with `{{mustache}}` variables)

**Tests to write:**
- Override file is used over built-in
- `--reset` does not delete files in `.claude/nightshift/agents/`
- Override with invalid template vars produces clear error

**Acceptance criteria:**
- Users can customize agent behavior without modifying presets
- Overrides survive `init --reset` and `reinit`
- `npm test` passes

---

#### Task 6.2 — Custom team definitions

**Goal:** Support fully user-defined teams beyond built-in presets.

**Files to modify:**
- `lib/init.ts` — team definition lookup chain

**Custom team structure:**
```
.claude/nightshift/teams/deploy/
├── team.yaml
├── agents/
│   ├── deployer.md
│   └── validator.md
└── defaults/
```

**Lookup chain for `--team deploy`:**
1. If `--from ./path/` provided → use that path
2. Check `.claude/nightshift/teams/deploy/` → use if exists
3. Check `presets/deploy/` → use if exists
4. Error: "Unknown team: deploy"

**Validation:**
- team.yaml must parse and validate
- Every agent in team.yaml must have a behavior template in `agents/`
- All transitions must target defined stages
- `wip` meta stage must exist

**Tests to write:**
- Custom team from `.claude/nightshift/teams/`
- Custom team from `--from` path
- Missing behavior template errors clearly
- Invalid team.yaml errors clearly

**Acceptance criteria:**
- Users can define new teams without modifying nightshift source
- Clear error messages for invalid team definitions
- `npm test` passes

---

### Phase 7: Cleanup & Migration

#### Task 7.1 — Remove legacy config files

**Goal:** Clean up files superseded by team.yaml.

**Files to delete:**
- `presets/dev/labels.json` — stages now in `team.yaml`
- `presets/dev/defaults/ns-dev-agents.json` — model/thinkingBudget/reasoningEffort now in `team.yaml` agent fields

**Files to modify:**
- `lib/labels.ts` — remove `loadLabels()` (replaced by `getLabelsFromConfig()`)
- `lib/copy.ts` — remove `copyAgentProfiles()` (replaced by generator)
- `lib/agent-config.ts` — remove `loadAgentConfig()` (replaced by team.yaml reads in start.ts)
- `lib/worktrees.ts` — remove `discoverCoderCount()` (replaced by `discoverAgentWorktrees()`)
- `lib/init.ts` — remove any remaining legacy code paths
- `lib/start.ts` — remove old `loadAgentConfig()` calls
- `lib/types.ts` — remove `AgentModelConfig` and `AgentConfigs` types (absorbed into `AgentDefinition`)

**Note:** `ns-dev-citizens.json` (Agentville visualization config) is NOT removed — it's independent of team.yaml and stays as an extension file.

**Acceptance criteria:**
- No code references `labels.json` or `ns-dev-agents.json`
- `copyAgentProfiles()` is removed
- `loadAgentConfig()` is removed
- `discoverCoderCount()` is removed
- All tests pass
- `npm run typecheck` passes

---

#### Task 7.2 — Update CLI help and documentation

**Goal:** Update all user-facing text to reflect team.yaml-driven workflow.

**Files to modify:**
- `bin/nightshift.ts` — add `reinit` to help text, add `--from` to init options
- `README.md` — update with team.yaml examples, reinit docs, custom team docs
- `docs/customization.md` — document behavior overrides, extension files, custom teams
- `docs/adding-agents.md` — rewrite for team.yaml approach

**Acceptance criteria:**
- `npx nightshift --help` shows all commands including reinit
- README shows team.yaml-first workflow
- Docs cover override and custom team systems

---

## Task Summary

| # | Task | Phase | Depends On | Complexity |
|---|------|-------|------------|------------|
| 1.1 | YAML parser + TeamConfig types | 1 | — | Medium |
| 1.2 | Create dev team.yaml preset | 1 | 1.1 | Small |
| 2.1 | Mustache template engine | 2 | — | Small |
| 2.2 | Agent file generator | 2 | 1.1, 2.1 | Large |
| 2.3 | Convert dev agents to behavior templates | 2 | 2.2 | Large |
| 3.1 | Init: team.yaml for labels | 3 | 1.1, 1.2 | Small |
| 3.2 | Init: dynamic agent discovery + profile generation | 3 | 1.1, 2.2, 2.3 | Large |
| 4.1 | Start/list/hooks: team.yaml agent discovery | 4 | 1.1, 3.2 | Large |
| 4.2 | Teardown: filesystem-first agent discovery | 4 | 4.1 | Medium |
| 5.1 | Reinit command | 5 | 3.2 | Medium |
| 6.1 | Behavior override system | 6 | 3.2 | Small |
| 6.2 | Custom team definitions | 6 | 3.2, 6.1 | Medium |
| 7.1 | Remove legacy config files | 7 | 3.1, 3.2, 4.1, 4.2 | Small |
| 7.2 | Update CLI help and docs | 7 | 5.1, 6.2 | Small |

**Total: 14 tasks across 7 phases.**

Critical path: 1.1 → 2.1 → 2.2 → 2.3 → 3.2 → 4.1 → 4.2 → 7.1

Parallelizable pairs:
- 1.1 + 2.1 (no dependency)
- 3.1 + 3.2 (both depend on 1.1 but independent of each other)
- 5.1 + 6.1 (both depend on 3.2 but independent of each other)
- 4.2 + 5.1 (4.2 depends on 4.1; 5.1 depends on 3.2 — no conflict)
