# Plan: Add a headless mode

> Issue: #25
> Date: 2026-03-26
> Status: draft

## Overview

Add a `--headless` flag to `nightshift start` that launches agents as background processes instead of in a tmux session. Each agent runs in a shell loop that periodically invokes Claude Code in non-interactive mode (`claude --print`) with the agent prompt. This removes the tmux dependency for users who prefer running agents in CI/CD, on remote servers, or alongside their existing terminal setup.

## Requirements

- R1: `nightshift start --team dev --headless` launches all agents without tmux
- R2: Each agent runs as an independent background process, looping on its configured interval
- R3: `nightshift stop --team dev` cleanly stops headless agents (same stop command as tmux mode)
- R4: Status files continue to work (existing `~/.nightshift/<repo>/<team>/status/<role>` mechanism)
- R5: Visualization server still starts if available (headless agents, not headless viz)
- R6: Documented clearly in README and docs

## Architecture Changes

### Modified files

| File | Change |
|------|--------|
| `bin/nightshift.ts` | Parse `--headless` flag and pass to `startSession()` |
| `lib/start.ts` | Add `startHeadlessSession()` function; update `startSession()` to dispatch based on `headless` option; update `stopSession()` to handle headless PID cleanup |
| `lib/types.ts` | Add `StartOptions` type for the options object |
| `README.md` | Document headless mode in Quick Start and Commands sections |
| `tests/visualize.test.ts` | Add tests for headless PID file helpers |

### New files

| File | Purpose |
|------|---------|
| `bin/ns-agent-loop.sh` | Shell script that runs a single agent in a loop: invokes Claude Code, sleeps, repeats. Manages status file updates. |

## Current State Analysis

### Tmux-dependent code in `start.ts`
- Lines 104-109: `which tmux` check — exits if tmux not found
- Lines 192-213: All tmux pane creation and splitting
- Lines 217-230: Pane border formatting and status display
- Lines 232-235: `send-keys` to inject runner command
- Line 268: `tmux attach-session` (blocks until detach)

### Tmux-independent code (already works headless)
- `buildAgentList()` — pure function, no tmux dependency
- `parseRunner()` — reads config file, no tmux dependency
- Visualization server startup (lines 126-181) — uses detached Node process
- Hook installation — writes to settings files
- Status file system — file-based, read by `ns-status.sh` or any polling

### How Claude Code supports non-interactive use
- `claude --print -p "<prompt>"` — runs a single prompt, prints output, exits
- `claude --print` reads from stdin if no `-p` flag
- The agent profiles in `~/.claude/agents/` are available via `@agent-name` syntax
- A single invocation of `claude --print -p "@ns-dev-producer"` runs one agent cycle

## Implementation Steps

### Phase 1: Agent loop script

1. **Create `bin/ns-agent-loop.sh`** (new file)
   - Action: Write a shell script that runs one agent in a repeating loop:
     ```bash
     #!/usr/bin/env bash
     # ns-agent-loop.sh <agent-name> <cwd> <interval-seconds> <runner-base> <status-file>
     # Runs the agent in a loop using Claude Code's non-interactive mode.

     AGENT="$1"
     CWD="$2"
     INTERVAL="$3"
     RUNNER_BASE="$4"
     STATUS_FILE="$5"

     cd "$CWD" || exit 1

     while true; do
       echo "working|$(date +%s)|" > "$STATUS_FILE"
       $RUNNER_BASE --print -p "@${AGENT}" 2>&1 | tail -20
       echo "idle|$(date +%s)|" > "$STATUS_FILE"
       sleep "$INTERVAL"
     done
     ```
   - The script wraps each cycle with status file updates so the existing monitoring works.
   - `$RUNNER_BASE` is the runner command from `repo.md` (e.g., `claude --dangerously-skip-permissions`), with `--print -p` appended to make it non-interactive.
   - `tail -20` limits output noise — in headless mode, stdout goes to a log file.
   - Why: A dedicated script keeps the loop logic simple and testable, separate from the Node.js orchestrator. Shell scripts are also easy to inspect and modify.
   - Dependencies: none

### Phase 2: Headless session management

2. **Add `StartOptions` type** (`lib/types.ts`)
   - Action: Add a type for the options passed to `startSession()`:
     ```typescript
     export interface StartOptions {
       port?: number;
       headless?: boolean;
     }
     ```
   - Update `startSession()` signature from `options?: { port?: number }` to `options?: StartOptions`.
   - Why: Clean typing as the options object grows.
   - Dependencies: none

3. **Add headless PID management** (`lib/start.ts`)
   - Action: Add helper functions for managing headless agent PIDs:
     ```typescript
     function getHeadlessPidDir(repoName: string, team: string): string {
       return join(getTeamDir(repoName, team), 'pids');
     }

     function writeAgentPid(repoName: string, team: string, role: string, pid: number): void {
       const dir = getHeadlessPidDir(repoName, team);
       mkdirSync(dir, { recursive: true });
       writeFileSync(join(dir, `${role}.pid`), String(pid));
     }

     function stopHeadlessAgents(repoName: string, team: string): number {
       const dir = getHeadlessPidDir(repoName, team);
       if (!existsSync(dir)) return 0;
       let stopped = 0;
       for (const file of readdirSync(dir)) {
         if (!file.endsWith('.pid')) continue;
         const pid = parseInt(readFileSync(join(dir, file), 'utf-8').trim(), 10);
         try { process.kill(pid); stopped++; } catch { /* already dead */ }
         unlinkSync(join(dir, file));
       }
       return stopped;
     }
     ```
   - PID files stored at `~/.nightshift/<repo>/<team>/pids/<role>.pid` — one per agent.
   - Why: Each headless agent is an independent process. PID files let `stop` kill them cleanly.
   - Dependencies: none

4. **Implement `startHeadlessSession()`** (`lib/start.ts`)
   - Action: Add a new function that launches agents without tmux:
     ```typescript
     export async function startHeadlessSession(team: string, options?: StartOptions): Promise<void> {
       const repoRoot = detectRepoRoot();
       const repoName = detectRepoName();
       const coderCount = discoverCoderCount(repoName, team);
       // ... same setup as startSession() for viz server, hooks, etc. ...

       const agents = buildAgentList(team, coderCount, repoRoot, repoName);
       const runner = parseRunner(repoRoot);
       const loopScript = join(__dirname, '..', 'bin', 'ns-agent-loop.sh');
       const statusDir = join(getTeamDir(repoName, team), 'status');
       const logDir = join(getTeamDir(repoName, team), 'logs');
       mkdirSync(logDir, { recursive: true });

       // Stop any existing headless agents
       stopHeadlessAgents(repoName, team);

       for (const agent of agents) {
         const statusFile = join(statusDir, agent.role);
         const logFile = join(logDir, `${agent.role}.log`);
         const logFd = openSync(logFile, 'a');

         const child = spawn('bash', [
           loopScript, agent.agent, agent.cwd,
           String(LOOP_INTERVAL), runner, statusFile
         ], {
           detached: true,
           stdio: ['ignore', logFd, logFd],
         });

         if (child.pid) {
           child.unref();
           writeAgentPid(repoName, team, agent.role, child.pid);
         }
       }

       // Print summary (no tmux attach — returns immediately)
       console.log(`Started ${agents.length} agents in headless mode.`);
       console.log(`Logs: ${logDir}/`);
       console.log(`Stop: npx nightshift stop --team ${team}`);
     }
     ```
   - Key differences from tmux mode:
     - No `which tmux` check
     - Each agent spawned via `ns-agent-loop.sh` as a detached process
     - Output goes to per-agent log files in `~/.nightshift/<repo>/<team>/logs/`
     - Function returns immediately (no `tmux attach-session` blocking)
   - Visualization server, hook installation, and world config generation are identical to tmux mode — extract the shared setup into a helper function to avoid duplication.
   - Why: Headless mode is fundamentally the same pipeline with a different process management layer.
   - Dependencies: steps 1, 2, 3

5. **Update `startSession()` to dispatch** (`lib/start.ts`)
   - Action: Add a check at the top of `startSession()`:
     ```typescript
     export async function startSession(team: string, options?: StartOptions): Promise<void> {
       if (options?.headless) {
         return startHeadlessSession(team, options);
       }
       // ... existing tmux code ...
     }
     ```
   - Why: Single entry point, clean dispatch.
   - Dependencies: step 4

6. **Update `stopSession()` for headless** (`lib/start.ts`)
   - Action: Add headless agent cleanup to the existing `stopSession()`:
     ```typescript
     export function stopSession(team: string): void {
       const repoName = detectRepoName();

       // Stop headless agents (if any)
       const headlessStopped = stopHeadlessAgents(repoName, team);

       // Stop miniverse server (existing logic, unchanged)
       // ...

       // Stop tmux session (existing logic, unchanged)
       // ...

       if (headlessStopped > 0) {
         console.log(chalk.green(`Stopped ${headlessStopped} headless agent(s).`));
       }
     }
     ```
   - `stop` cleans up both tmux and headless agents — safe to call regardless of which mode was used.
   - Why: Users shouldn't need to remember which mode they started with.
   - Dependencies: step 3

7. **Parse `--headless` flag in CLI** (`bin/nightshift.ts`)
   - Action: Update the `start` command handler:
     ```typescript
     case 'start': {
       const team = parseFlag(commandArgs, '--team');
       if (!team) { /* ... */ }
       const portStr = parseFlag(commandArgs, '--port');
       const port = portStr ? parseInt(portStr, 10) : undefined;
       const headless = commandArgs.includes('--headless');
       const { startSession } = await import('../lib/start.js');
       await startSession(team, { port, headless });
       break;
     }
     ```
   - Update `printHelp()` to document the flag:
     ```
     Options (start/stop):
       --team <name>     Team to start or stop (required)
       --port <number>   Port for visualization server (default: 4321)
       --headless        Run agents as background processes (no tmux)
     ```
   - Why: CLI is the user-facing entry point.
   - Dependencies: step 5

### Phase 3: Extract shared setup

8. **Extract shared visualization setup** (`lib/start.ts`)
   - Action: Move the visualization server startup, hook installation, and world config generation from `startSession()` into a shared helper:
     ```typescript
     async function setupVisualization(
       team: string, agents: AgentEntry[], repoRoot: string,
       repoName: string, citizenOverrides: CitizenOverrides, vizPort: number
     ): Promise<string | null> {
       // ... existing viz setup code from startSession() lines 126-181 ...
     }
     ```
   - Both `startSession()` and `startHeadlessSession()` call this helper.
   - Why: Avoids duplicating ~55 lines of setup code. Both modes need the same viz server.
   - Dependencies: step 4

### Phase 4: Documentation

9. **Update README.md** (`README.md`)
   - Action: Add a "Headless Mode" subsection after the Quick Start section:
     ```markdown
     ### Headless Mode

     Run agents without tmux — each agent runs as a background process:

     ```bash
     npx nightshift start --team dev --headless
     ```

     Agents loop every 15 minutes, same as in tmux mode. Logs are written to
     `~/.nightshift/<repo>/<team>/logs/<role>.log`.

     Check agent status:
     ```bash
     cat ~/.nightshift/<repo>/<team>/status/*
     ```

     Stop all agents:
     ```bash
     npx nightshift stop --team dev
     ```
     ```
   - Also update the Options table for `start` to include `--headless`.
   - Why: Issue requirement R2 — "capture this in documentation clearly."
   - Dependencies: step 7

10. **Add headless documentation page** (`docs/headless.md`)
    - Action: Create a documentation page covering:
      - When to use headless mode (CI/CD, remote servers, SSH sessions, already using terminal multiplexer)
      - How it works (shell loop per agent, PID management, log files)
      - How to monitor agents (status files, log tailing, visualization server)
      - Comparison table: tmux mode vs headless mode
      - Troubleshooting (agent not running, stale PIDs, log rotation)
    - Why: Detailed documentation for power users beyond the README quickstart.
    - Dependencies: step 9

### Phase 5: Testing

11. **Add headless PID management tests** (`tests/visualize.test.ts`)
    - Action: Add tests for the new PID helpers:
      - `writeAgentPid` writes a PID file to the correct path
      - `stopHeadlessAgents` reads PIDs and attempts to kill processes
      - `stopHeadlessAgents` returns 0 when no PID directory exists
      - `stopHeadlessAgents` cleans up PID files after stopping
      - `getHeadlessPidDir` returns the expected path
    - Why: PID management is the critical path for clean shutdown.
    - Dependencies: step 3

12. **Add `ns-agent-loop.sh` test** (`tests/start.test.ts` or manual)
    - Action: Verify the loop script handles:
      - Missing `$CWD` directory (should exit 1)
      - Status file is written at start and end of each cycle
      - Script is executable (`chmod +x`)
    - These can be simple shell-based tests or manual verification.
    - Why: The loop script is the heartbeat of headless mode.
    - Dependencies: step 1

## Testing Strategy

- **Unit tests** (`tests/visualize.test.ts`): PID file write/read/cleanup, headless PID directory helpers
- **Integration test** (manual):
  1. `npx nightshift init --team dev --yes`
  2. `npx nightshift start --team dev --headless`
  3. Verify: command returns immediately (no tmux attach)
  4. Verify: `ls ~/.nightshift/<repo>/dev/pids/` shows PID files for each role
  5. Verify: `ps aux | grep ns-agent-loop` shows running processes
  6. Verify: `cat ~/.nightshift/<repo>/dev/status/*` shows working/idle states
  7. Verify: `tail -f ~/.nightshift/<repo>/dev/logs/producer.log` shows agent output
  8. Verify: `npx nightshift stop --team dev` kills all agents
  9. Verify: PID files are cleaned up after stop
- **Regression**: `npm run test` passes (no changes to existing behavior)
- **Tmux mode unchanged**: `npx nightshift start --team dev` (without `--headless`) still works identically

## Assumptions

- **Claude Code supports `--print -p "@agent"`**: The `--print` flag runs Claude Code in non-interactive mode, and `-p` passes a prompt. The `@agent` syntax loads the agent profile. I'm assuming this combination works to run a single agent cycle. If `--print` doesn't support `@agent` syntax, the alternative is piping the prompt via stdin: `echo "@ns-dev-producer" | claude --print`.

- **Shell loop is sufficient for orchestration**: A simple `while true; do ... sleep N; done` shell loop is adequate. No need for process supervisors (pm2, systemd) since `nightshift stop` handles cleanup. If the machine reboots, agents need to be manually restarted — same as tmux mode.

- **Log files don't need rotation**: For the initial implementation, logs append indefinitely. Log rotation can be added later if needed (most agents produce modest output per cycle).

- **`LOOP_INTERVAL` is shared**: All agents use the same 15-minute interval (900 seconds), matching the tmux mode. Per-agent intervals could be a future enhancement.

- **The `--headless` flag only affects the start command**: Initialization (`init`), teardown, and stop work the same regardless of mode. The `stop` command detects and cleans up whichever mode was used.

## Risks & Mitigations

- **Risk**: `claude --print -p "@agent"` may not work with agent profiles or may behave differently than interactive mode
  - Mitigation: Test this command manually before implementing. If `--print` doesn't support agents, fall back to: `echo "/loop 1 @ns-dev-producer" | claude --dangerously-skip-permissions --print` (runs exactly one loop cycle). Worst case, use a heredoc or temp file for the prompt.

- **Risk**: Orphaned processes if `nightshift stop` is not called (e.g., machine crash)
  - Mitigation: PID files allow recovery — `nightshift stop` checks PIDs and kills any survivors. The loop script also writes its own PID for easy `kill`. Add a note in docs about orphan cleanup.

- **Risk**: Claude Code instances may consume significant memory/CPU when N agents run simultaneously
  - Mitigation: In headless mode, agents are sequential within each process (one prompt at a time) and staggered by startup time. The `--print` flag exits after each cycle, releasing memory. Document resource considerations in headless docs.

- **Risk**: Status file updates in `ns-agent-loop.sh` may conflict with status updates inside the agent profile itself
  - Mitigation: The shell script sets "working" before the cycle and "idle" after. The agent profile also writes to the same file during its run. Since the agent's internal writes happen between the shell script's writes, the last writer wins — which is correct (agent's "idle" at end-of-cycle matches the shell's "idle" written immediately after).
