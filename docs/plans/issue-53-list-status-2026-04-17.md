# Plan: Show running/stopped status in nightshift list output

> Issue: #53
> Date: 2026-04-17
> Status: draft

## Overview

Add running/stopped status indicators to `nightshift list` output. The list command currently shows teams and their agents but gives no indication of whether a team is actively running. We'll add a status detection function that checks both tmux sessions and headless PID files, then display the result inline with each team's header.

## Requirements

- Show `— running` or `— stopped` after the agent count for each team in `nightshift list` output
- Detect running state via tmux session check (`tmux has-session -t nightshift-<repo>-<team>`)
- Detect running state via headless PID files (`~/.nightshift/<repo>/<team>/pids/*.pid` with live process check)
- If either tmux or headless mode is active, the team is "running"
- Color the status indicator (green for running, dim for stopped) using existing `chalk` dependency

## Architecture Changes

- **`lib/start.ts`** — export a new `isTeamRunning(repoName: string, team: string): boolean` function
- **`bin/nightshift.ts`** — import `isTeamRunning` and update the list command output format (lines 103-113)
- **`tests/start.test.ts`** — add tests for `isTeamRunning`

No new files, no new dependencies. The function lives in `start.ts` because that module already owns session naming (`getSessionName`), PID management (`getHeadlessPidDir`, `writeAgentPid`, `stopHeadlessAgents`), and tmux interaction.

## Implementation Steps

### Phase 1: Status detection and display (single phase — small feature)

#### Tests First

- **Test file**: `tests/start.test.ts`
- **Test cases**:
  - `isTeamRunning returns false when no tmux and no PID dir`: create a temp home with no pids directory, mock tmux to fail — assert returns `false`
  - `isTeamRunning returns true when headless PIDs exist with live processes`: write a PID file containing the current test process PID (known alive) — assert returns `true`
  - `isTeamRunning returns false when headless PIDs exist but processes are dead`: write a PID file with a guaranteed-dead PID (e.g., 999999999) — assert returns `false`
  - `isTeamRunning returns false when PID dir exists but is empty`: create empty pids dir — assert returns `false`

**Testing note on tmux**: The tmux session check uses `execSync` which is hard to unit test without mocking. The approach is:
1. Unit test the headless PID path thoroughly (real file I/O, real `process.kill(pid, 0)`)
2. The tmux path is a single `execSync` call wrapped in try/catch — integration-level coverage via manual testing
3. This matches the existing test patterns in the codebase (e.g., `stopHeadlessAgents` tests PID logic but not tmux)

#### Implementation Steps

1. **Add `isTeamRunning` function** (`lib/start.ts`)
   - Action: Add a new exported function after the `stopHeadlessAgents` function (after line 268)
   - Logic:
     ```
     function isTeamRunning(repoName: string, team: string): boolean
       1. Check tmux: try execSync(`tmux has-session -t "${getSessionName(repoName, team)}"`)
          - If succeeds (exit 0) → return true
          - If throws → tmux not running for this team
       2. Check headless PIDs: read getHeadlessPidDir(repoName, team)
          - If dir doesn't exist → return false
          - For each .pid file, read PID and try process.kill(pid, 0)
          - If ANY PID is alive → return true
       3. return false
     ```
   - Why: Centralizes running-state detection next to existing session/PID management code
   - Dependencies: uses existing `getSessionName`, `getHeadlessPidDir` from same module

2. **Update list command output** (`bin/nightshift.ts`)
   - Action: Import `isTeamRunning` alongside existing imports from `../lib/start.js` (line 87). Modify the team header line (line 107) to append status.
   - Change line 107 from:
     ```typescript
     console.log(`  ${team} (${agents.length} agents)`);
     ```
     to:
     ```typescript
     const running = isTeamRunning(repoName, team);
     const status = running
       ? chalk.green('running')
       : chalk.dim('stopped');
     console.log(`  ${team} (${agents.length} agents) — ${status}`);
     ```
   - Also add `chalk` import at the top of the list function (chalk is already a project dependency, used extensively in start.ts)
   - Why: Matches the exact output format specified in the issue
   - Dependencies: requires step 1

3. **Handle no-config teams** (`bin/nightshift.ts`)
   - Action: Also show status for the else branch (line 112) where no `team.yaml` is found
   - Change:
     ```typescript
     console.log(`  ${team} (no team.yaml found)`);
     ```
     to include status as well, since a team could theoretically be running without a local config
   - Why: Consistent UX — every team line shows status
   - Dependencies: requires step 1

4. **Add tests** (`tests/start.test.ts`)
   - Action: Add a new `describe('isTeamRunning', ...)` block at the end of the file
   - Import `isTeamRunning` in the existing import statement (line 6)
   - Use `Date.now()` suffix for temp directory names (matches existing pattern)
   - Create temp directories under `tmpdir()` mimicking `~/.nightshift/<repo>/<team>/pids/` structure
   - The function reads from `homedir()/.nightshift/...` so tests need to write PID files to the actual nightshift directory under unique repo names (existing pattern — see `writeAgentPid` tests)
   - Cleanup in `afterEach`
   - Why: Validates the core detection logic
   - Dependencies: none (can be written before implementation as TDD)

## Testing Strategy

- **Approach**: Test-Driven Development (TDD) — tests written BEFORE implementation
- **Unit tests**: `tests/start.test.ts` — test `isTeamRunning` with headless PID scenarios
- **Integration tests**: Manual — run `nightshift start --team dev`, then `nightshift list`, then `nightshift stop --team dev`, then `nightshift list` again to verify visual output
- **Test infrastructure**: Reuse existing patterns from `start.test.ts` — temp directories, `Date.now()` suffixed names, `afterEach` cleanup with `rmSync`

## Assumptions

- `chalk` is importable in `bin/nightshift.ts` — it's already a dependency used in `lib/start.ts`, so this is safe
- `discoverTeams` may return non-team directories (e.g., `miniverse`) — `isTeamRunning` will simply return `false` for those, which is correct behavior (they'll show as "stopped")
- The em-dash `—` separator in the output matches the issue's expected format, not parentheses — the issue body uses `— running` format in the example but mentions `(running)` in implementation notes; we follow the example output since it's more explicit
- `execSync` for tmux check is acceptable (synchronous, fast, matches existing tmux usage patterns throughout `start.ts`)

## Risks & Mitigations

- **Risk**: tmux not installed on some systems — `execSync('tmux has-session ...')` throws
  - Mitigation: Already wrapped in try/catch, so it gracefully falls through to headless PID check and returns false if neither is running. No crash.
- **Risk**: Stale PID files left after unclean shutdown — team shows as "running" when it's not
  - Mitigation: `process.kill(pid, 0)` verifies the process is actually alive before reporting running. Dead PIDs are ignored. This matches the existing `stopHeadlessAgents` pattern.
