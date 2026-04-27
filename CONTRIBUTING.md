# Contributing to nightshift

Thank you for your interest in contributing to nightshift! This guide covers
everything you need to get started.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/puspesh/nightshift.git
cd nightshift

# Install dependencies
npm install

# Build the project
npm run build

# Run the type checker
npm run typecheck

# Run the test suite
npm run test
```

### One-line verification

Before submitting any PR, run:

```bash
npm run typecheck && npm run test
```

Both must pass. This is the same check CI runs.

## Project Structure

```
nightshift/
  bin/           # CLI entry points
  lib/           # TypeScript source
  tests/         # Automated test suite (node:test)
  presets/       # Team presets (agent profiles, defaults, shared repo.md)
  docs/          # User-facing documentation
  examples/      # Example extension sets for different stacks
```

## Testing

nightshift uses the Node.js built-in test runner (`node:test`) with `node:assert/strict`.
The test suite lives in `tests/` and currently has 260+ automated tests across 19+ files.

```bash
# Run all tests
npm run test

# Run a specific test file
node --test dist/tests/<file>.test.js
```

### Test guidelines

- Write tests before implementation (TDD)
- Never hit real `~/.claude/agents/` directories in tests -- use temp directories
  (lesson from [#46](https://github.com/puspesh/nightshift/issues/46))
- Use `mkdtempSync` for isolated test fixtures
- Tests should be deterministic -- no network calls, no filesystem side effects outside temp dirs

## How to Contribute

### Reporting Issues

- Use [GitHub Issues](https://github.com/puspesh/nightshift/issues) to report bugs or request features
- Include steps to reproduce for bugs
- Include your nightshift version (`npx nightshift --version`), Node.js version, and OS

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b issue-N-short-description`
3. Make your changes following the conventions below
4. Write or update tests
5. Run `npm run typecheck && npm run test`
6. Commit with a clear message (see commit format below)
7. Push and create a PR

### Branch naming

```
issue-<number>-<short-slug>
```

Examples: `issue-42-fix-worktree-cleanup`, `issue-50-open-source-prep`

### Commit format

```
<type>(issue-<number>): <description>
```

Where `<type>` is `feat` for new features or `fix` for bug fixes.

Examples:
- `feat(issue-50): add CI workflow and package hygiene`
- `fix(issue-46): prevent tests from writing to real agent dirs`

### One idea per PR

Keep PRs focused on a single change. If you find something else that needs fixing,
open a separate issue.

## Code Style

- TypeScript with strict mode
- ESM modules (`import`/`export`)
- Minimal dependencies
- Clear, descriptive variable names
- Type annotations on all exported functions

## Agent Profile Guidelines

When modifying agent behavior templates (`presets/<team>/agents/<role>.md`):

- Keep them repo-agnostic -- no project-specific content
- Use `{{mustache}}` template variables (e.g., `{{repo_name}}`, `{{team_name}}`)
- Reference extension files for any project-specific behavior
- Do not include frontmatter, `<PIPELINE-AGENT>`, or Team Protocol -- those are generated
- Test: `npx nightshift reinit --team <team>` and verify generated output

## About the Agent Pipeline

This repository uses nightshift on itself. You may see automated comments from
agents like `@ns-dev-producer`, `@ns-dev-planner`, `@ns-dev-reviewer`,
`@ns-dev-coder`, and `@ns-dev-tester` on issues and PRs. These are part of the
development pipeline and work alongside human contributors.

## Release Process

Releases are managed by the maintainer:

1. Version bump in `package.json`
2. Update `CHANGELOG.md`
3. Tag the release: `git tag v0.2.1`
4. Push the tag: `git push origin v0.2.1`
5. CI publishes to npm automatically

## What We're Looking For

- Bug fixes
- New example extension sets (for different tech stacks)
- Documentation improvements
- CLI UX improvements
- New agent roles (see [docs/adding-agents.md](docs/adding-agents.md))
- [Good first issues](https://github.com/puspesh/nightshift/labels/good%20first%20issue)

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
