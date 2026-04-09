# Troubleshooting

## Missing prerequisites

**Symptom**: `Missing prerequisites. Install them and try again.`

**Cause**: One or more required tools are not installed or not in your PATH.

**Fix**: Install all prerequisites:

```bash
# Check each one
node --version      # Need 18+
gh --version        # Need 2.0+
git --version       # Need 2.20+
tmux -V             # Need 3.0+ (only for start command)
claude --version    # Need latest
```

Install any that are missing. See [compatibility.md](compatibility.md) for version details.

## team.yaml not found

**Symptom**: `No team.yaml found` or team configuration errors.

**Cause**: The team has not been initialized, or team.yaml is missing/corrupted.

**Fix**:

```bash
# Initialize the team (creates team.yaml and all config)
npx nightshift init --team dev

# Or check if team.yaml exists
cat .claude/nightshift/team.yaml
```

The `team.yaml` file defines the team's agents, roles, and loop intervals.
It is created during `init` and should not be edited manually unless you
understand the schema.

## tmux is required

**Symptom**: `tmux is required` or `tmux: command not found`

**Cause**: tmux is not installed. The `start` command needs tmux to create
the multi-pane agent layout.

**Fix**:

```bash
# macOS
brew install tmux

# Ubuntu/Debian
sudo apt install tmux

# Verify
tmux -V
```

**Alternative**: Use headless mode if you don't want tmux:

```bash
npx nightshift start --team dev --headless
```

## Failed to create labels

**Symptom**: Label creation fails during `init`.

**Cause**: The GitHub CLI (`gh`) doesn't have sufficient permissions.

**Fix**:

```bash
# Re-authenticate with appropriate scopes
gh auth login

# For private repos, ensure you have the 'repo' scope
gh auth status
```

## Failed to create worktrees

**Symptom**: Worktree creation fails during `init` or at runtime.

**Cause**: Branch conflicts (branch already checked out in another worktree)
or insufficient disk space.

**Fix**:

```bash
# List existing worktrees
git worktree list

# Remove stale worktrees
git worktree prune

# If a branch is stuck, force remove the worktree
git worktree remove --force <path>
```

## Agent stuck on stale lock

**Symptom**: Agent outputs "skipping -- lock file exists" every cycle.

**Cause**: A previous agent cycle crashed without cleaning up its lock file.

**Fix**:
```bash
REPO_NAME=$(basename "$(git rev-parse --path-format=absolute --git-common-dir | sed 's|/\.git$||')")

# Check the lock file
cat ~/.nightshift/${REPO_NAME}/<team>/locks/ns-<team>-<role>.lock

# If it's more than 60 minutes old, remove it
rm ~/.nightshift/${REPO_NAME}/<team>/locks/ns-<team>-<role>.lock

# Also remove the wip label from the issue if it's stuck
gh issue edit <number> --remove-label "dev:wip"
```

**Prevention**: Agents automatically detect stale locks (>60 minutes) and remove
them. This usually only happens if the entire Claude Code session crashed.

## Worktree checkout conflicts

**Symptom**: `error: 'issue-42-feature' is already checked out at '...'`

**Cause**: Another agent's worktree still has the feature branch checked out.

**Fix**:
```bash
REPO_NAME=$(basename "$(git rev-parse --path-format=absolute --git-common-dir | sed 's|/\.git$||')")

# Find which worktree has the branch
git worktree list

# Force the stuck worktree back to its home branch
cd ~/.nightshift/${REPO_NAME}/<team>/worktrees/<agent>
git checkout _ns/dev/<agent>
```

**Prevention**: Agents always return to their home branch (`_ns/dev/<agent>`)
at the end of every cycle. If an agent crashes mid-cycle, the branch stays
checked out until manually freed.

## Label transition out of order

**Symptom**: Issue has wrong label (e.g., `dev:testing` but no PR exists).

**Cause**: An agent set labels but didn't complete its work, or labels were
manually edited.

**Fix**:
```bash
# Reset to the correct state
gh issue edit <number> --remove-label "dev:testing" --add-label "dev:approved"

# Remove wip if stuck
gh issue edit <number> --remove-label "dev:wip"
```

**Prevention**: Always let agents manage labels. Manual label changes can
confuse the pipeline.

## Two agents claiming the same issue

**Symptom**: Two agents post comments on the same issue simultaneously.

**Cause**: Race condition -- both agents queried for work before either
added the `wip` label.

**Fix**: This is rare because agents add `wip` immediately after finding work.
If it happens:

1. Check which agent is further along
2. Let that agent finish
3. Remove the lock file for the other agent
4. The duplicate work will be harmless (same branch, same changes)

**Prevention**: The `wip` label + lock file combination makes this very unlikely.
It can only happen if two agents query GitHub in the same sub-second window.

## Agent context filling up

**Symptom**: Agent responses become confused, repeat themselves, or miss
steps near the end of a long implementation.

**Cause**: Claude Code's context window is filling up from reading many files.

**Fix**: Agents have built-in "context checkpoints" -- they re-read the plan
and check `git log` progress after each phase. This helps them stay oriented
even when context is compressed.

For very large tasks (4+ phases), the coder agent will automatically end
the cycle early after 3 phases and pick up the remaining work in the next
cycle.

**Prevention**: Keep implementation plans phased, with each phase containing
3-5 steps. Smaller phases = less context per cycle.

## Build or install failures in worktrees

**Symptom**: `pnpm install` or `npm install` fails in a worktree.

**Cause**: Worktrees share the git repo but have separate working directories.
Dependencies may not be installed, or the worktree may be on a different
branch with different dependencies.

**Fix**:
```bash
REPO_NAME=$(basename "$(git rev-parse --path-format=absolute --git-common-dir | sed 's|/\.git$||')")
cd ~/.nightshift/${REPO_NAME}/<team>/worktrees/<agent>
git checkout main && git pull
<package-manager> install
```

## GitHub CLI authentication

**Symptom**: `gh` commands fail with "not authenticated".

**Fix**:
```bash
gh auth login
gh auth status  # Verify
```

## Teardown issues

**Symptom**: `npx nightshift teardown` fails partway through.

**Fix**: Run teardown with `--force` to skip confirmation, then manually
clean up any remaining artifacts:

```bash
# Force teardown
npx nightshift teardown --force --remove-labels

# Manual cleanup if needed
REPO_NAME=$(basename "$(git rev-parse --path-format=absolute --git-common-dir | sed 's|/\.git$||')")
rm -rf ~/.nightshift/${REPO_NAME}
rm -f ~/.claude/agents/ns-*.md
rm -rf .claude/nightshift/
```
