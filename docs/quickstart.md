# Quickstart

A complete walkthrough from zero to your first agent-generated PR.

## 1. Install prerequisites

You need four tools installed:

```bash
# Node.js 18+ (check with: node --version)
# Install via https://nodejs.org or your package manager

# Claude Code
# Install via https://docs.anthropic.com/claude-code

# GitHub CLI
brew install gh        # macOS
# or: https://cli.github.com/

# tmux (for the start command)
brew install tmux      # macOS
sudo apt install tmux  # Ubuntu/Debian
```

## 2. Authenticate

```bash
# GitHub CLI -- needed for label and issue management
gh auth login

# Claude Code -- needed for AI agent sessions
claude login
```

Verify both are working:

```bash
gh auth status
claude --version
```

## 3. Initialize nightshift in your repository

```bash
cd your-project
npx nightshift init --team dev
```

This creates:
- Agent profiles in `~/.claude/agents/` (one per role)
- Pipeline extensions in `.claude/nightshift/` (your repo)
- Git worktrees for agent isolation
- GitHub labels for the pipeline state machine

## 4. Configure for your stack

Edit the pipeline extensions to match your project:

```bash
# Set your build, test, and typecheck commands
vi .claude/nightshift/repo.md

# Customize what the reviewer looks for
vi .claude/nightshift/ns-dev-review-criteria.md

# Configure test expectations
vi .claude/nightshift/ns-dev-test-config.md
```

The `repo.md` file is the most important -- it tells agents how to build and test
your project. At minimum, set the verification command:

```markdown
## Verification command
npm run typecheck && npm run test
```

## 5. Create a test issue

Create a simple issue to test the pipeline:

```bash
gh issue create --title "Add hello world endpoint" \
  --body "Add a GET /hello endpoint that returns { message: 'hello world' }. Include a test."
```

## 6. Start the agents

```bash
npx nightshift start --team dev
```

This opens a tmux session with all agents. Each pane shows:
- The agent's role and color-coded label
- The `/loop` command to start that agent
- A live status indicator

Type the `/loop` command shown in each pane to activate the agent.

## 7. Watch the pipeline

The producer agent picks up new issues first. Watch the labels change on your issue:

```bash
# In another terminal, watch the issue progress
gh issue view <number> --json labels --jq '.labels[].name'
```

The pipeline flow:
1. **@producer** triages the issue, creates a branch, sets `dev:planning`
2. **@planner** reads the codebase, writes an implementation plan, sets `dev:plan-review`
3. **@reviewer** reviews the plan, approves or requests changes
4. **@coder** implements the plan phase by phase, creates a PR
5. **@tester** runs tests against the PR, reports results

## 8. Review and merge

Once the pipeline completes, you'll have a PR ready for review:

```bash
gh pr list
gh pr view <number>
```

Review the changes, run any additional checks, and merge when satisfied.
Agents create PRs but never merge -- that's always a human decision.

## Next steps

- [Customization Guide](customization.md) -- tune the pipeline for your stack
- [Architecture](architecture.md) -- understand the state machine and concurrency model
- [Adding Agents](adding-agents.md) -- create custom agent roles
- [Troubleshooting](troubleshooting.md) -- common issues and fixes
- [FAQ](faq.md) -- answers to common questions
