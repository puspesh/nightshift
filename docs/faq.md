# Frequently Asked Questions

## Does this work with models other than Claude?

No. nightshift requires Claude Code's agent system -- specifically the `/loop` command,
agent profiles (`~/.claude/agents/`), and Claude Code's tool-use capabilities. It is not
compatible with other AI coding assistants.

## How do I run this without GitHub?

You can't. GitHub labels are the state machine that drives the entire pipeline.
Issues, labels, branches, and PRs are all GitHub primitives that agents depend on.
GitLab or Bitbucket support is not currently planned.

## What happens if two agents pick up the same issue?

Each agent adds a `dev:wip` label immediately after finding work. This acts as a mutex --
other agents skip issues that already have `dev:wip`. In the extremely rare case where
two agents query GitHub in the same sub-second window, the duplicate work is harmless
because they work on the same branch. See [architecture.md](architecture.md) for details.

## Can I use this on a private repo?

Yes. nightshift works on both public and private repositories. You need `gh` authenticated
with appropriate scopes (typically `repo` for private repos). Run `gh auth login` and
select the scopes you need.

## Does data leave my machine?

Only via the GitHub API (issues, labels, PRs, comments) and the Claude API (same as
using Claude Code directly). nightshift itself does not phone home, collect telemetry,
or send data to any third-party service. All agent work happens locally in your
git worktrees.

## What's the cost and token impact?

Each agent is an independent Claude Code session running on a `/loop` interval
(default: 15 minutes). Cost depends on:
- How many agents you run (the `dev` team has 5-6 agents)
- How often they find work (idle cycles are cheap)
- How complex the issues are (larger plans = more tokens)

A typical overnight run processing 3-5 issues uses roughly the same tokens as
an afternoon of interactive Claude Code usage.

## Can I add custom agent roles?

Yes. See [adding-agents.md](adding-agents.md) for a guide on creating new roles.
You define the agent's profile, add it to your team's preset, and configure which
labels it watches for. Custom roles plug into the same label-driven state machine.

## What happens if an agent crashes or gets stuck?

Lock files expire after 60 minutes. If an agent crashes mid-cycle:
- Its lock file becomes stale and other agents ignore the issue
- On the next cycle, any agent (or the crashed agent after restart) detects the
  stale lock and removes it
- The `dev:wip` label may need manual removal

See [troubleshooting.md](troubleshooting.md) for detailed recovery steps.

## How do I customize review criteria?

Edit `.claude/nightshift/ns-dev-review-criteria.md` in your repository. This file
is injected into the reviewer agent's context and controls what it looks for during
code review. See [customization.md](customization.md) for details.

## Does this work on Windows?

Not yet. nightshift depends on tmux for the `start` command, which is not available
on Windows natively. Headless mode (`--headless`) may work under WSL (Windows Subsystem
for Linux), but this is untested and not officially supported.

## Can I run multiple teams in the same repo?

Yes. Teams are fully independent -- each has its own agents, worktrees, labels, and
loop intervals. You can run `dev` and `infra` teams simultaneously without interference:

```bash
npx nightshift init --team dev
npx nightshift init --team infra
npx nightshift start --team dev
npx nightshift start --team infra
```
