<div align="center">
<pre>
███╗   ██╗██╗ ██████╗ ██╗  ██╗████████╗███████╗██╗  ██╗██╗███████╗████████╗
████╗  ██║██║██╔════╝ ██║  ██║╚══██╔══╝██╔════╝██║  ██║██║██╔════╝╚══██╔══╝
██╔██╗ ██║██║██║  ███╗███████║   ██║   ███████╗███████║██║█████╗     ██║   
██║╚██╗██║██║██║   ██║██╔══██║   ██║   ╚════██║██╔══██║██║██╔══╝     ██║   
██║ ╚████║██║╚██████╔╝██║  ██║   ██║   ███████║██║  ██║██║██║        ██║   
╚═╝  ╚═══╝╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝╚═╝        ╚═╝   
</pre>
<p>Coordinating AI agents for your development pipeline.</p>
<p>
  <a href="https://www.npmjs.com/package/nightshift"><img src="https://img.shields.io/npm/v/nightshift" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node.js >= 18">
  <img src="https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Claude_Code-compatible-blueviolet" alt="Claude Code">
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"></a>
</p>
</div>

Set up a team of agents in any repository that autonomously triage issues,
write plans, review code, implement features, and run tests -- all
orchestrated through GitHub labels.

## Quick Start

```bash
# In your repository
npx nightshift init --team dev
```

This sets up everything: agent profiles, pipeline extensions, git worktrees,
and GitHub labels for the `dev` team. Then customize and start the agents:

```bash
# Edit your config files
vi .claude/nightshift/repo.md                  # commands, branch patterns (shared)
vi .claude/nightshift/ns-dev-review-criteria.md  # code review checklist
vi .claude/nightshift/ns-dev-test-config.md      # test configuration

# Start all agents in a tmux session
npx nightshift start --team dev
```

This opens a tmux session with a split-pane layout:

```
┌──────────┬─────────────────┐
│ producer │                 │
├──────────┤    coder-1      │
│ planner  │                 │
├──────────┼─────────────────┤
│ reviewer │    coder-2      │
├──────────┤                 │
│ tester   │                 │
└──────────┴─────────────────┘
```

Each pane has a color-coded label showing its role, the `/loop` command to type,
and a live status indicator (working/idle with countdown timer). Navigate panes
with `Ctrl+b, arrow`. Detach with `Ctrl+b, d` (agents keep running).

A visualization server also launches at `http://localhost:4321` showing a pixel-art
office world with agents as animated citizens, plus a real-time status panel.

You can also start agents individually in separate terminals:

```bash
/loop 15m @ns-dev-producer
/loop 15m @ns-dev-planner
/loop 15m @ns-dev-reviewer
/loop 15m @ns-dev-coder-1
/loop 15m @ns-dev-tester
```

### Headless Mode

Run agents without tmux — each agent runs as a background process:

```bash
npx nightshift start --team dev --headless
```

Agents loop every 15 minutes, same as in tmux mode. Logs are written to
`~/.nightshift/<repo>/<team>/logs/<role>.log`.

```bash
# Check agent logs
tail -f ~/.nightshift/<repo>/<team>/logs/producer.log

# Stop all agents (same command as tmux mode)
npx nightshift stop --team dev
```

### Multiple Coders

Use the `--coders` flag to add multiple coder agents:

```bash
npx nightshift init --team dev --coders 2

# This creates two coder agents:
/loop 15m @ns-dev-coder-1
/loop 15m @ns-dev-coder-2
```

## How It Works

### Teams

Nightshift organizes agents into **teams**. Each team is an independent pipeline
with its own set of agents, worktrees, and label namespace. You can run multiple
teams in parallel (e.g., `dev` and `infra`) without interference.

### State Machine

Issues flow through the pipeline via GitHub labels:

```
[new issue]
     |
     v
@producer: triage
     |
     v
dev:planning -----> @planner: write plan
     |
     v
dev:plan-review --> @reviewer: review plan
     |                      |
     v                      v
dev:approved        dev:plan-revising (back to planner)
     |
     v
@coder: implement
     |
     v
dev:code-review --> @reviewer: review code
     |                      |
     v                      v
dev:testing         dev:code-revising (back to coder)
     |
     v
@tester: run tests
     |
     v
dev:ready-to-merge --> human merges
```

### Agent Roles

| Agent | Role |
|-------|------|
| **@ns-dev-producer** | Triages new issues, creates branches, monitors health |
| **@ns-dev-planner** | Explores codebase, writes implementation plans |
| **@ns-dev-reviewer** | Reviews plans and code for quality |
| **@ns-dev-coder** | Implements from approved plans, raises PRs |
| **@ns-dev-tester** | Runs tests against PRs, reports results |

### Three-Layer Architecture

1. **Pipeline machinery** (agent profiles in `~/.claude/agents/`) -- the generic
   workflow, state machine, and guard rails. Managed by nightshift.

2. **Pipeline extensions** (`.claude/nightshift/*.md` in your repo) -- project-specific
   commands, review criteria, test configuration. Customized by you.

3. **Project context** (`CLAUDE.md`) -- your project's structure, conventions,
   and documentation. Already in your repo.

## Commands

```bash
# Initialize a team
npx nightshift init --team dev

# Launch all agents in a tmux session
npx nightshift start --team dev

# Stop a running tmux session
npx nightshift stop --team dev

# List all installed teams and their agents
npx nightshift list

# Teardown a team (interactive confirmation)
npx nightshift teardown --team dev

# Skip confirmation
npx nightshift teardown --team dev --force

# Also remove GitHub labels
npx nightshift teardown --team dev --force --remove-labels
```

### Runner Configuration

The `start` command reads the runner command from `.claude/nightshift/repo.md`.
Default:

```
claude --dangerously-skip-permissions
```

Customize it to change flags, model, or permissions for all agents.

## Prerequisites

- [Claude Code](https://docs.anthropic.com/claude-code) -- the AI coding assistant
- [GitHub CLI (gh)](https://cli.github.com/) -- for label and issue management
- [git](https://git-scm.com/) -- for worktree isolation
- [tmux](https://github.com/tmux/tmux) -- for the `start` command (`brew install tmux`)

## Documentation

- [Customization Guide](docs/customization.md) -- how to configure for your stack
- [Architecture](docs/architecture.md) -- deep dive on the state machine and concurrency
- [Adding Agents](docs/adding-agents.md) -- how to extend the pipeline
- [Troubleshooting](docs/troubleshooting.md) -- common issues and fixes

## Examples

See the `examples/` directory for ready-to-use extension sets:

- **TypeScript monorepo** (pnpm, Turborepo, Vitest, Playwright)
- **Python FastAPI** (uv, pytest, mypy, SQLAlchemy)
- **Go service** (go test, golangci-lint, testcontainers)

Copy any example's files into your `.claude/nightshift/` directory as a starting point.

## Contributing

Contributions are welcome! Please read the [Contributing Guide](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md) before submitting pull requests.

## License

MIT
