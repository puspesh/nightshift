# Headless Mode

Run nightshift agents as background processes without tmux.

## When to Use

- **Remote servers / SSH sessions** — no need to install or configure tmux
- **CI/CD pipelines** — run agents as part of automated workflows
- **Existing terminal setup** — keep your own multiplexer (screen, zellij, etc.)
- **Scripted deployments** — start/stop agents programmatically

## Quick Start

```bash
npx nightshift start --team dev --headless
```

The command spawns each agent as a detached background process and returns
immediately. Agents loop every 15 minutes, same as tmux mode.

```bash
# Stop all agents
npx nightshift stop --team dev
```

The `stop` command works the same regardless of which mode was used to start.

## How It Works

Each agent runs in an independent shell loop (`bin/ns-agent-loop.sh`) that:

1. Writes `working` to the agent's status file
2. Invokes `claude --print -p "@<agent>"` for one cycle
3. Writes `idle` to the status file
4. Sleeps for the loop interval (15 minutes)
5. Repeats

### Process Management

- Each agent runs as a **detached process group** (`detached: true`)
- PID files are stored at `~/.nightshift/<repo>/<team>/pids/<role>.pid`
- `nightshift stop` reads PID files and sends SIGTERM to each process group
- PID files are cleaned up after stop

### Logging

Agent output is written to per-role log files:

```
~/.nightshift/<repo>/<team>/logs/
├── producer.log
├── planner.log
├── reviewer.log
├── coder-1.log
└── tester.log
```

```bash
# Follow a specific agent's output
tail -f ~/.nightshift/<repo>/<team>/logs/producer.log

# Check all agent logs
tail ~/.nightshift/<repo>/<team>/logs/*.log
```

### Status Monitoring

The existing status file system works identically in headless mode:

```bash
# Check agent status
cat ~/.nightshift/<repo>/<team>/status/*
```

The visualization server also starts in headless mode (agents are headless,
not the viz). Open the URL printed at startup to see the dashboard.

## Tmux Mode vs Headless Mode

| | Tmux Mode | Headless Mode |
|---|---|---|
| **Requires tmux** | Yes | No |
| **Interactive** | Yes (attach/detach) | No (background processes) |
| **Output** | Visible in tmux panes | Written to log files |
| **Start behavior** | Blocks (attaches to session) | Returns immediately |
| **Stop command** | Same | Same |
| **Status files** | Same | Same |
| **Visualization** | Same | Same |

## Troubleshooting

### Agent not running after start

Check if the process is alive:

```bash
cat ~/.nightshift/<repo>/<team>/pids/<role>.pid
ps -p <pid>
```

If the PID file exists but the process is dead, run `nightshift stop` to
clean up stale PIDs, then start again.

### Stale PID files

If `nightshift stop` reports stopping agents but they were already dead, the
PIDs were stale. This can happen if the machine was rebooted or the processes
were killed externally. The stop command cleans up PID files regardless.

### Log files growing large

Logs append indefinitely. To rotate manually:

```bash
# Truncate a log file (agent will continue appending)
: > ~/.nightshift/<repo>/<team>/logs/producer.log
```

For automated rotation, use your system's `logrotate` or equivalent.

### Switching between modes

Starting in one mode automatically cleans up the other:
- `--headless` kills any existing tmux session for the team
- Starting without `--headless` kills any existing headless agents
