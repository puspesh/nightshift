# Contributing to nightshift

Thank you for your interest in contributing to nightshift!

## How to Contribute

### Reporting Issues

- Use GitHub Issues to report bugs or request features
- Include steps to reproduce for bugs
- Include your Node.js version and OS

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b my-feature`
3. Make your changes
4. Test your changes manually (see below)
5. Commit with a clear message
6. Push and create a PR

### Testing

nightshift is a CLI tool with markdown agent profiles. Testing is primarily manual:

1. Run `bunx nightshift init` in a test repository
2. Verify all files are created correctly
3. Run `bunx nightshift teardown` to verify cleanup
4. Check agent profiles for correctness (no hardcoded repo references)

### Code Style

- TypeScript with strict mode -- build with `bun run build`
- ESM modules (`import`/`export`)
- Minimal dependencies
- Clear, descriptive variable names
- Type annotations on all exported functions

### Agent Profile Guidelines

When modifying agent profiles (`agents/nightshift-*.md`):

- Keep them repo-agnostic -- no project-specific content
- Use dynamic paths: `~/.nightshift/<repo>/` not hardcoded paths
- Reference extension files for any project-specific behavior
- Preserve the `<PIPELINE-AGENT>` directive
- Test the smoke check: grep for project-specific terms

### What We're Looking For

- Bug fixes
- New example extension sets (for different tech stacks)
- Documentation improvements
- CLI UX improvements
- New agent roles (see `docs/adding-agents.md`)

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
