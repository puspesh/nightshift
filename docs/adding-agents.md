# Adding Agents

nightshift ships with 5 agents in the `dev` team, but you can add more for
specialized tasks.

## How to Add an Agent

### 1. Define the agent in team.yaml

Add the agent to your team's `team.yaml` (either in a built-in preset or a
custom team under `.claude/nightshift/teams/<team>/team.yaml`):

```yaml
agents:
  # ... existing agents ...
  docs:
    description: Writes documentation after code is merged
    watches: [ready-to-merge]
    transitions:
      document: docs-review
    tools: [Read, Grep, Glob, Bash, Write, Edit]
    model: sonnet
    worktree: true
```

### 2. Add any new stages

If the agent needs new pipeline stages, add them to the `stages` section:

```yaml
stages:
  # ... existing stages ...
  - name: docs-review
    color: "5319e7"
```

### 3. Create a behavior template

Create a `.md` template in your team's preset directory (e.g.,
`presets/<team>/agents/docs.md` or `.claude/nightshift/teams/<team>/agents/docs.md`):

```markdown
You are **@{{agent_name}}** -- the documentation agent for nightshift team **{{team_name}}**.

## Workflow

1. Find issues with `{{team_name}}:ready-to-merge`
2. Read the PR diff and plan file
3. Update relevant documentation (README, API docs, guides)
4. Commit docs changes to the feature branch
5. Post comment with what was documented
6. Transition the issue to `docs-review`
```

The template uses `{{mustache}}` variables that are filled in during generation.
Available variables: `agent_name`, `team_name`, `repo_name`, `main_branch`,
`team_dir`, `role`, `instance_number`.

### 4. Regenerate and start

```bash
# Regenerate agent profiles
npx nightshift reinit --team <team>

# Create worktrees for the new agent
npx nightshift init --team <team>

# Start all agents
npx nightshift start --team <team>
```

## Behavior Overrides

To customize an agent's behavior without forking the preset:

1. Create `.claude/nightshift/agents/<role>.md` (e.g., `coder.md`, `producer.md`)
2. This file replaces the built-in template for that agent
3. Run `npx nightshift reinit --team <team>` to regenerate

Overrides are preserved across `--reset` operations.

## Custom Teams

For teams with entirely different agent configurations:

```bash
# Create a custom team directory
mkdir -p .claude/nightshift/teams/ops

# Add team.yaml and agent templates
# team.yaml defines stages, agents, and their configs
# agents/ directory contains behavior templates

# Initialize with --from for the first setup
npx nightshift init --team ops --from .claude/nightshift/teams/ops
```

See `presets/dev/` for the reference team structure.

## Multi-Coder Setup

The coder agent is scalable by default. To run more coders:

```bash
# Start with 3 coders instead of the default 2
npx nightshift init --team dev --coders 3
npx nightshift start --team dev
```

The `max_instances` field in `team.yaml` controls the upper limit (default: 4).

## Example: Documentation Writer

A `docs` agent that writes documentation after code is merged:

```yaml
# In team.yaml
agents:
  docs:
    description: Writes documentation after code is merged
    watches: [ready-to-merge]
    transitions:
      document: docs-review
    tools: [Read, Grep, Glob, Bash, Write, Edit]
    model: sonnet
    worktree: true
```

## Example: Security Scanner

A `security` agent that runs in parallel with the reviewer:

```yaml
agents:
  security:
    description: Runs security scans on code under review
    watches: [code-review]
    transitions: {}
    tools: [Read, Grep, Glob, Bash]
    model: sonnet
    worktree: true
```

This agent watches the same label as the reviewer but posts findings as
comments rather than transitioning labels.
