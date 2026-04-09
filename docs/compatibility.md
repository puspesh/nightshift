# Compatibility

## Supported Versions

| Dependency | Minimum | Tested | Notes |
|------------|---------|--------|-------|
| Node.js | 18.0.0 | 18, 20, 22 | Set in `engines.node` in package.json |
| macOS | 12+ | 15 (Sequoia) | Primary development platform |
| Linux | Ubuntu 22.04+ | Ubuntu 24.04 | CI-tested |
| Windows | -- | -- | Not supported; WSL untested |
| Claude Code | Latest | -- | Requires agent system support (`/loop`, agents) |
| GitHub CLI (gh) | 2.0+ | 2.72+ | For label and issue management |
| tmux | 3.0+ | 3.5+ | Required for `start` command; not needed for `--headless` |
| git | 2.20+ | 2.39+ | For worktree support |

## Node.js

nightshift requires Node.js 18 or later. The `engines` field in `package.json`
enforces this. CI tests against Node 18, 20, and 22 on every PR.

## Operating Systems

**macOS** is the primary development platform. All features are tested on macOS.

**Linux** (Ubuntu) is tested in CI. The `start` command works with tmux on Linux.
Headless mode (`--headless`) also works on Linux.

**Windows** is not supported. The `start` command depends on tmux, which is not
available on Windows natively. Headless mode may work under WSL (Windows Subsystem
for Linux), but this has not been tested and is not officially supported.

## Claude Code

nightshift requires a working Claude Code installation with support for:
- Agent profiles (`~/.claude/agents/`)
- The `/loop` command for recurring agent cycles
- Tool use (file read/write, bash, git)

Always use the latest version of Claude Code for best compatibility.

## Package Managers

nightshift is published to npm and installed via `npx`. It is compatible with:
- npm (tested)
- pnpm (should work, not regularly tested)
- yarn (should work, not regularly tested)

The project itself uses npm for development.
