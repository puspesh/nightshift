# Architecture

## State Machine

The pipeline is driven by GitHub issue labels. Each label represents a state,
and agents watch for specific labels to know when to act.

```
                    +-----------------+
                    |   New Issue     |
                    | (no status:*)   |
                    +--------+--------+
                             |
                    @producer triages
                             |
                    +--------v--------+
                    | dev:planning  |
                    +--------+--------+
                             |
                    @planner writes plan
                             |
                    +--------v---------+
               +--->| dev:plan-review|
               |    +--------+---------+
               |             |
               |    @reviewer reviews plan
               |             |
               |    +--------v-----------+
               |    |  CRITICAL found?   |
               |    +----+----------+----+
               |         |          |
               |        yes         no
               |         |          |
               |  +------v------+  +v-----------+
               +--| plan-revising|  | approved   |
                  +-------------+  +-----+------+
                                         |
                                @coder implements
                                         |
                                +--------v---------+
                           +--->| dev:code-review|
                           |    +--------+---------+
                           |             |
                           |    @reviewer reviews code
                           |             |
                           |    +--------v-----------+
                           |    |  CRITICAL found?   |
                           |    +----+----------+----+
                           |         |          |
                           |        yes         no
                           |         |          |
                           |  +------v------+  +v-----------+
                           +--| code-revising|  | testing    |
                              +-------------+  +-----+------+
                                                      |
                                             @tester runs tests
                                                      |
                                             +--------v-----------+
                                             |  Tests pass?       |
                                             +----+----------+----+
                                                  |          |
                                                 no         yes
                                                  |          |
                                           +------v------+  +v--------------+
                                           | code-revising|  | ready-to-merge|
                                           +-------------+  +------+--------+
                                                                    |
                                                           human merges PR
```

## Concurrency Model

### One agent per issue at a time

The `wip` label acts as a mutex. When an agent claims an issue:

1. It adds the `wip` label
2. It writes a lock file with a timestamp
3. Other agents skip issues with `wip`

When the agent finishes:

1. It removes the lock file
2. It returns to its home branch
3. It removes `wip` and transitions the status label

### Lock files

Lock files live at `~/.nightshift/<repo>/<team>/locks/ns-<team>-<role>.lock`
and contain JSON:

```json
{
  "issue": 42,
  "agent": "ns-dev-coder",
  "started": "2026-03-20T10:30:00Z"
}
```

If a lock file is older than 60 minutes, it's considered stale and removed.
This prevents deadlocks from crashed agents.

### Why both labels and lock files?

- **Labels** are the coordination mechanism between agents (visible on GitHub)
- **Lock files** prevent the same agent from starting a second cycle while
  the first is still running (Claude Code `/loop` can invoke an agent while
  the previous invocation hasn't fully exited)

## Worktree Pattern

Each agent (except producer) runs in its own git worktree:

```
~/.nightshift/<repo>/<team>/
  worktrees/
    planner/      # _ns/dev/planner branch
    reviewer/     # _ns/dev/reviewer branch
    coder-1/      # _ns/dev/coder-1 branch
    coder-2/      # _ns/dev/coder-2 branch
    tester/       # _ns/dev/tester branch
  locks/
    ns-dev-planner.lock
    ns-dev-reviewer.lock
    ns-dev-coder-1.lock
    ns-dev-coder-2.lock
    ns-dev-tester.lock
```

### Why worktrees?

1. **Isolation**: Each agent can checkout a feature branch without affecting others
2. **No conflicts**: Agents never fight over the working directory
3. **Independent state**: Each worktree has its own `node_modules/`, build cache, etc.

### Branch protocol

All agents share a single feature branch per issue (created by producer):

```
issue-<number>-<slug>
```

When an agent needs to work on an issue:
1. `git checkout issue-<number>-<slug>` (from its worktree)
2. Do the work
3. `git checkout _ns/dev/<agent>` (return to home branch)

Returning to the home branch is mandatory -- it frees the feature branch
for the next agent in the pipeline.

## Communication Protocol

Agents communicate through three channels:

### 1. GitHub Labels (state machine)

Labels drive the pipeline. Each status transition signals the next agent.

### 2. GitHub Comments (structured messages)

Each agent posts a comment when it completes work:

```markdown
### @ns-dev-<agent> -- <action>
**Status**: <done | blocked | failed>
**Summary**: <what was done>
**Next**: <what should happen next>
```

### 3. Plan files (persistent context)

Implementation plans live in `docs/plans/` on the feature branch. This
gives all downstream agents (coder, reviewer, tester) access to the
original requirements and design decisions.

## Three-Layer Architecture

```
+-------------------------------------------+
|  Agent Profiles (~/.claude/agents/)       |  <- Generated by nightshift
|  Pipeline machinery, state machine,       |     from team.yaml + templates
|  guard rails, workflow steps              |
+-------------------------------------------+
|  Pipeline Extensions (.claude/nightshift/)  |  <- Customized by you
|  Commands, review criteria, test config,  |     Committed to your repo
|  plan template, PR template              |
+-------------------------------------------+
|  Project Context (CLAUDE.md, codebase)    |  <- Your project
|  Structure, conventions, documentation    |     Already exists
+-------------------------------------------+
```

This separation means:
- Upgrading nightshift (new agent profiles) doesn't lose your customizations
- Your customizations don't require forking agent profiles
- Project context is always up-to-date (it's your actual codebase)
