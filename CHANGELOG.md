# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-03-22

### Added

- `start` command: launch all agents in a tmux session with split-pane layout
- `stop` command: kill a running tmux session
- Tmux layout: left sidebar (producer, planner, reviewer, tester) + right column (coders)
- Color-coded pane border labels with role name and `/loop` command
- Live agent status indicators (working/idle with countdown timer)
- Runner command configurable via `## Runner` section in `repo.md`
- `.gitignore` updates during `init` for Claude Code runtime artifacts
- Pixel-art agent visualization at `http://localhost:4321` (gear-supply themed office world)
- Vendored miniverse server + core (no external npm dependency)
- Claude Code hooks for real-time agent state tracking (working/thinking/idle)
- Auto-opens visualization in browser on `start`
- ASCII art banner on CLI output

## [0.1.0] - 2026-03-20

### Added

- Initial release
- CLI with `init` and `teardown` commands
- 5 generic agent profiles: producer, planner, reviewer, coder, tester
- 5 default extension files: config, review-criteria, plan-template, pr-template, testing
- 3 example extension sets: TypeScript monorepo, Python FastAPI, Go service
- Documentation: README, customization guide, architecture, adding agents, troubleshooting
- Auto-detection of repo root, main branch, and package manager
- Idempotent GitHub label creation
- Git worktree management for agent isolation
- Agent profile installation to ~/.claude/agents/
- CLAUDE.md pipeline section management
