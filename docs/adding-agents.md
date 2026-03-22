# Adding Agents

nightshift ships with 5 agents, but you can add more for specialized tasks.

## How to Add a 6th Agent

### 1. Create the agent profile

Create `~/.claude/agents/ns-<team>-<name>.md` with this structure:

```markdown
# This file is managed by nightshift. Customize via .claude/nightshift/*.md

---
name: ns-<team>-<name>
description: >
  What this agent does. Run via /loop 15m @ns-dev-<name>.
tools: Read, Grep, Glob, Bash, Write, Edit
model: sonnet
memory: project
---

<PIPELINE-AGENT>
STOP. Do NOT check for skills, brainstorm, or explore. You are a pipeline agent.

Your FIRST action must be this bash command:
\```bash
REPO_NAME=$(basename $(git rev-parse --show-toplevel))
cat ~/.nightshift/${REPO_NAME}/locks/ns-<team>-<name>.lock 2>/dev/null
\```

Then follow the Workflow section step by step.
</PIPELINE-AGENT>

You are **@ns-dev-<name>** — <role description>.

## Pipeline Role

| Watch for | Action | Set label to |
|-----------|--------|--------------|
| `status:<input>` | <what it does> | `status:<output>` |

## Worktree & Branch Protocol
...

## Workflow
...

## Guard Rails
...
```

### 2. Add new pipeline states (if needed)

If your agent needs new labels:

1. Add them to `.claude/nightshift/config.md`
2. Create them on GitHub: `gh label create "<team>:<name>" --color "<hex>"`
3. Update upstream agents to transition to your new state
4. Update downstream agents to watch for your output state

### 3. Create a worktree

```bash
REPO_NAME=$(basename $(git rev-parse --show-toplevel))
MAIN_BRANCH=main  # or master

git branch _ns/dev/<name> origin/${MAIN_BRANCH}
git worktree add ~/.nightshift/${REPO_NAME}/worktrees/<name> _ns/dev/<name>
```

### 4. Start the agent

```bash
/loop 15m @ns-dev-<name>
```

## Example: Documentation Writer

A `ns-<team>-docs` agent that writes documentation after code is merged:

```markdown
## Pipeline Role

| Watch for | Action | Set label to |
|-----------|--------|--------------|
| `dev:ready-to-merge` | Write/update docs for the changes | `status:docs-review` |

## Workflow

1. Check lock, find issues with `dev:ready-to-merge`
2. Read the PR diff and plan file
3. Update relevant documentation (README, API docs, guides)
4. Commit docs changes to the feature branch
5. Post comment with what was documented
6. Set label to `status:docs-review`
```

## Example: Security Scanner

A `nightshift-security` agent that runs security checks:

```markdown
## Pipeline Role

| Watch for | Action | Set label to |
|-----------|--------|--------------|
| `dev:code-review` | Run security scans | _(posts findings as comment)_ |
```

This agent runs in parallel with the reviewer, posting security findings
as a separate comment on the issue.

## How to Fork an Existing Agent

If you need to deeply customize an agent's behavior:

1. Copy the agent profile: `cp ~/.claude/agents/ns-dev-coder.md ~/.claude/agents/ns-dev-coder-custom.md`
2. Update the frontmatter `name` field
3. Make your changes to the workflow
4. Use the new name: `/loop 15m @ns-dev-coder-custom`

## Multi-Coder Setup

For larger teams, run multiple coders:

1. Copy the coder profile:
   ```bash
   cp ~/.claude/agents/ns-dev-coder.md ~/.claude/agents/ns-dev-coder-1.md
   cp ~/.claude/agents/ns-dev-coder.md ~/.claude/agents/ns-dev-coder-2.md
   ```

2. Update the `name` field in each copy

3. Create worktrees for each:
   ```bash
   git branch _ns/dev/coder-1 origin/main
   git branch _ns/dev/coder-2 origin/main
   git worktree add ~/.nightshift/${REPO_NAME}/worktrees/coder-1 _ns/dev/coder-1
   git worktree add ~/.nightshift/${REPO_NAME}/worktrees/coder-2 _ns/dev/coder-2
   ```

4. Start both:
   ```bash
   /loop 15m @ns-dev-coder-1
   /loop 15m @ns-dev-coder-2
   ```

They'll pick up different issues (the `wip` label prevents conflicts).
