# Plan: Auto-detect and rebase PRs behind main

## Problem

When multiple coders work in parallel, merged PRs cause other in-flight branches to fall behind main. Currently nobody notices until merge time, leading to last-minute conflicts and stale reviews.

## Design

### New label

- `dev:rebase-needed` — an **interrupt label**, not a stage label. Layers on top of the current stage (e.g. an issue can be `dev:code-review` + `dev:rebase-needed` simultaneously).

### Producer: idle-cycle housekeeping

The producer already runs on a 15-minute loop. At the **end of each cycle**, after all primary duties (triage unlabeled, verify ready-to-merge, health checks), if there was nothing to triage:

1. List all open PRs:
   ```bash
   gh pr list --state open --json number,headRefName,baseRefName,labels
   ```

2. For each PR, check if behind main:
   ```bash
   git fetch origin main
   git rev-list --count HEAD..origin/main  # from the PR branch
   ```
   Or use the GitHub API:
   ```bash
   gh api repos/{owner}/{repo}/compare/main...{branch} --jq '.behind_by'
   ```

3. If `behind_by > 0` and issue does NOT already have `dev:rebase-needed`:
   - Add `dev:rebase-needed` label to the issue
   - Post a comment: "Branch is N commits behind main. Flagging for rebase."

4. Skip issues that have `on-hold` or `dev:blocked` labels.

### Coder: rebase-needed watch

Add `dev:rebase-needed` to both coders' watch list, but as **lower priority** than `dev:approved` and `dev:code-revising`.

Coder's updated priority order:
1. `dev:approved` (new implementation work)
2. `dev:code-revising` (address review feedback)
3. `dev:rebase-needed` (housekeeping)

When a coder picks up a `dev:rebase-needed` issue:

1. Claim with `dev:wip`
2. Rebase branch onto main:
   ```bash
   git checkout <branch>
   git rebase origin/main
   ```
3. Resolve conflicts if any
4. Force-push the rebased branch
5. Assess conflict severity:

   **Trivial conflicts** (lockfiles, import reordering, whitespace):
   - Remove `dev:rebase-needed` + `dev:wip`
   - Issue stays at its current stage (e.g. `dev:code-review`, `dev:testing`)
   - Comment: "Rebased onto main. Trivial conflicts resolved."

   **Major conflicts** (logic changes, merged hunks in same function, new code written):
   - Remove `dev:rebase-needed` + `dev:wip`
   - Move issue to `dev:code-review` (regardless of previous stage)
   - Comment: "Rebased onto main. Major conflicts resolved — flagging for re-review." with a summary of what changed.

### Either coder can pick it up

The `dev:wip` mutex is per-agent, so whichever coder is free in their cycle grabs the oldest `dev:rebase-needed` issue. No special assignment logic needed.

## Changes required

1. **`presets/dev/team.yaml`** — add `rebase-needed` as a meta stage (like `wip`, `blocked`)
2. **`presets/dev/agents/producer.md`** — add idle-cycle rebase detection logic
3. **`presets/dev/agents/coder.md`** — add `dev:rebase-needed` to watch list (priority 3), add rebase + conflict-assessment instructions
4. **`lib/labels.ts`** — ensure `dev:rebase-needed` label gets created on init

## Not in scope

- Auto-rebase without creating a label (too risky without coder judgment)
- Priority escalation (rebase stays lowest priority)
- Rebase for draft PRs (skip them)
