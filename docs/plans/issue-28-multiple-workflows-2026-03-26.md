# Plan: Allow for multiple workflows for any issue development

> Issue: #28
> Date: 2026-03-26
> Status: draft

## Overview

Two changes to the pipeline workflow: (1) Tighten the code review gate so the reviewer does not approve code with unresolved warnings -- currently only CRITICAL findings block approval, but warnings should also block when they represent maintenance debt. (2) Add a fast-track path for bugs and small fixes where the producer routes directly to `dev:approved` (skipping plan review), since straightforward bugs don't need a formal plan.

## Requirements

- R1: Reviewer must not pass code review if warnings or maintenance comments are unresolved
- R2: Producer should ensure a clean green flag before setting `dev:ready-to-merge`
- R3: For bugs and smaller issues (identified by `bug` label or title keywords), skip plan review
- R4: Producer decides the workflow path at triage time
- R5: No new labels needed -- reuse existing labels with different transitions

## Current State Analysis

### Current approval threshold (from `ns-dev-review-criteria.md`)
```
- Approve: No CRITICAL findings
- Revise: Any CRITICAL finding, or 3+ WARNINGs in the same area
```
Warnings are noted but a single warning does NOT block approval. This means code with "should fix" issues (console.log, unused code, missing tests, magic values) can pass review.

### Current triage path (producer)
All actionable issues → `dev:planning` → planner writes plan → `dev:plan-review` → reviewer reviews plan → `dev:approved` → coder implements.

No differentiation between bugs and features. A one-line typo fix follows the same path as a multi-phase feature.

### Issue type detection (already exists)
The planner and coder already detect issue type for commit messages:
- `bug` label → `fix` type
- Title contains: bug, fix, broken, crash, error, fail, wrong, incorrect → `fix` type
- Otherwise → `feat` type

This same detection logic can be reused by the producer.

## Architecture Changes

### Modified files

| File | Change |
|------|--------|
| `presets/dev/agents/ns-dev-producer.md` | Add workflow routing logic: bugs/small fixes → `dev:approved` (skip planning), normal issues → `dev:planning` |
| `presets/dev/agents/ns-dev-reviewer.md` | Tighten code review approval: all warnings must be resolved before approval |
| `.claude/nightshift/ns-dev-review-criteria.md` | Update approval thresholds to require clean warnings |

### No new files
This is implemented entirely through agent profile and review criteria changes. No new TypeScript modules, labels, or scripts.

## Implementation Steps

### Phase 1: Stricter code review (the "clean green flag")

1. **Update approval thresholds** (`.claude/nightshift/ns-dev-review-criteria.md`)
   - Action: Change the approval thresholds section:
     ```markdown
     ## Approval Thresholds

     ### Plan Reviews
     - **Approve**: No CRITICAL findings
     - **Revise**: Any CRITICAL finding, or 3+ WARNINGs in the same area

     ### Code Reviews
     - **Approve**: No CRITICAL findings AND no unresolved WARNINGs
     - **Revise**: Any CRITICAL finding, OR any unresolved WARNING
     - A WARNING is "resolved" if the coder has addressed it in a revision
       (check git log for evidence of the fix)
     - SUGGESTIONs do not block approval
     ```
   - Plan reviews keep the current threshold (CRITICALs only block) because plans are high-level and warnings at the planning stage are advisory.
   - Code reviews become stricter: ALL warnings must be fixed before the reviewer approves.
   - Why: The issue explicitly says "reviewer should not pass the final code review if any warning or maintenance related comment is left unsolved." This makes the code review gate the quality bar it should be.
   - Dependencies: none

2. **Update reviewer profile for stricter code reviews** (`presets/dev/agents/ns-dev-reviewer.md`)
   - Action: Add explicit instructions in the code review section reinforcing the new threshold:
     ```markdown
     ## Code Review Strictness

     For code reviews (`dev:code-review`), you MUST NOT approve if ANY WARNING-level
     findings remain unresolved. This includes:
     - Functions over 50 lines
     - Deep nesting (>3 levels)
     - Console.log in production code
     - Commented-out code
     - Missing test coverage for new features or bug fixes
     - Unhandled promises
     - Unused imports/variables/dead code
     - Magic numbers or strings

     If the coder has already been through a revision cycle (`dev:code-revising`),
     check if the previously flagged warnings have been addressed by reading the
     git log since the last review. If they have, those warnings are resolved.

     New warnings found in the current review still block approval.

     SUGGESTIONs (naming, duplication, documentation) do NOT block approval.
     ```
   - Why: Reinforces the new threshold directly in the reviewer's workflow instructions.
   - Dependencies: step 1

3. **Add producer verification at ready-to-merge** (`presets/dev/agents/ns-dev-producer.md`)
   - Action: Update the "Handle ready-to-merge" step (step 5) to verify clean status:
     ```markdown
     ### 5. Handle ready-to-merge

     For issues labeled `dev:ready-to-merge`:
     - Find the linked PR: `gh pr list --search "issue:<number>" --json number,url`
     - **Verify clean green flag**: Read the reviewer's LAST code review comment.
       Confirm the verdict is "APPROVE" with no outstanding CRITICAL or WARNING findings.
       If the last reviewer comment shows unresolved findings, remove `dev:ready-to-merge`
       and add `dev:code-revising`:
       ```bash
       gh issue edit <number> --remove-label "dev:ready-to-merge" --add-label "dev:code-revising"
       gh issue comment <number> --body "### @ns-dev-producer -- Sent back
       **Status**: quality gate failed
       **Reason**: Reviewer's last code review has unresolved warnings. Sending back for fixes.
       **Next**: @ns-dev-coder to address warnings (label: \`dev:code-revising\`)"
       ```
     - If clean: post summary comment with PR link and test status
     ```
   - Why: The producer acts as a final quality gate, catching any case where the pipeline moved forward despite unresolved issues.
   - Dependencies: none

### Phase 2: Fast-track workflow for bugs

4. **Add workflow routing to producer triage** (`presets/dev/agents/ns-dev-producer.md`)
   - Action: Update step 2 ("Triage new issues") to classify and route:
     ```markdown
     ### 2. Triage new issues (no `dev:*` label)

     For each unlabeled issue (skip issues with `on-hold` label):
     - Read the issue body: `gh issue view <number> --json title,body,labels`
     - **Not actionable** (empty body, too vague, is a question):
       - Add label: `dev:needs-info`, post clarification comment

     - **Actionable** — determine the workflow path:

       **Bug / small fix detection**:
       - Issue has `bug` label, OR
       - Title contains: bug, fix, broken, crash, error, fail, wrong, incorrect, typo, hotfix

       **If BUG or SMALL FIX** (fast-track):
       - Create feature branch
       - Add label: `dev:approved` (skip planning and plan review)
       - Post triage comment:
         ```markdown
         ### @ns-dev-producer -- Triaged (fast-track)
         **Status**: fast-tracked to implementation
         **Branch**: `issue-<number>-<slug>`
         **Workflow**: bug/fix — skipping plan review
         **Summary**: <one-line description>
         **Next**: Assigned to @ns-dev-coder (label: `dev:approved`)
         ```

       **If NORMAL FEATURE/IMPROVEMENT** (standard path):
       - Create feature branch
       - Add label: `dev:planning`
       - Post standard triage comment (existing format)
     ```
   - Why: Straightforward bugs don't need a formal plan. A one-line fix shouldn't require a planner to explore the codebase and write a plan document. The coder can read the issue directly and fix it.
   - Dependencies: none

5. **Update coder to handle planless issues** (`presets/dev/agents/ns-dev-coder.md`)
   - Action: Update the coder's workflow to handle issues that arrive at `dev:approved` without a plan:
     ```markdown
     ### 2. Read the issue and find the plan

     ```bash
     gh issue view <number> --json title,body,comments
     ```

     Check the producer's triage comment:
     - If **Workflow: bug/fix — skipping plan review**: There is no plan file.
       Read the issue body directly as your requirements. Implement the fix
       based on the issue description.
     - If **standard workflow**: Find the plan file from the planner's comment
       and read it as before.
     ```
   - The coder should also adjust its commit type based on the workflow:
     - Fast-tracked issues use `fix(issue-N):` commits
     - Standard issues use `feat(issue-N):` or `fix(issue-N):` based on issue type detection
   - Why: The coder needs to know whether to look for a plan file or work directly from the issue.
   - Dependencies: step 4

6. **Update coder for simpler PR on bug fixes** (`presets/dev/agents/ns-dev-coder.md`)
   - Action: For fast-tracked bug fixes, the PR body should be simpler:
     ```markdown
     For fast-tracked bugs (no plan file):
     - PR title: `fix: <concise description> (issue #N)`
     - PR body: Reference the issue, describe the fix, note what was tested.
       No plan link needed.
     ```
   - Why: A single-paragraph PR body is appropriate for a bug fix. The full plan-reference PR template doesn't apply.
   - Dependencies: step 5

## Updated State Machine

```
[new issue]
     |
     v
@producer: triage + classify
     |
     ├── BUG/SMALL FIX (fast-track)
     │   └── dev:approved ---------> @coder: implement from issue
     │                                    |
     │                                    v
     │                              dev:code-review --> @reviewer: review code (strict)
     │                                    |                    |
     │                                    v                    v
     │                              dev:testing         dev:code-revising
     │                                    |
     │                                    v
     │                              @tester: run tests
     │                                    |
     │                                    v
     │                              dev:ready-to-merge --> @producer: verify clean + notify
     │
     └── NORMAL FEATURE (standard path)
         └── dev:planning ---------> @planner: write plan
                                          |
                                          v
                                    dev:plan-review --> @reviewer: review plan
                                          |                    |
                                          v                    v
                                    dev:approved         dev:plan-revising
                                          |
                                          v
                                    @coder: implement from plan
                                          |
                                          v
                                    dev:code-review --> @reviewer: review code (strict)
                                          |                    |
                                          v                    v
                                    dev:testing         dev:code-revising
                                          |
                                          v
                                    @tester: run tests
                                          |
                                          v
                                    dev:ready-to-merge --> @producer: verify clean + notify
```

The fast-track path skips 3 steps: planning, plan review, and potential plan revision. The remaining pipeline (code review, testing, ready-to-merge) is identical.

## Testing Strategy

- **Manual verification (fast-track path)**:
  1. Create a GitHub issue titled "Fix typo in README" with `bug` label
  2. Trigger the producer
  3. Verify: producer sets `dev:approved` directly (not `dev:planning`)
  4. Verify: producer comment shows "fast-tracked to implementation"
  5. Trigger the coder
  6. Verify: coder reads issue body directly (no plan file lookup)
  7. Verify: coder creates PR with `fix:` prefix

- **Manual verification (strict code review)**:
  1. Create a PR with an intentional WARNING-level issue (e.g., a `console.log`)
  2. Trigger the reviewer for code review
  3. Verify: reviewer sets `dev:code-revising` (not `dev:testing`)
  4. Fix the warning, push, trigger reviewer again
  5. Verify: reviewer approves (no remaining warnings)

- **Manual verification (producer quality gate)**:
  1. Manually set `dev:ready-to-merge` on an issue where the last reviewer comment has warnings
  2. Trigger the producer
  3. Verify: producer removes `dev:ready-to-merge` and adds `dev:code-revising`

- **Regression**: Normal feature issues should still go through `dev:planning` → full pipeline

## Assumptions

- **Bug detection heuristics are sufficient**: The title keyword list (bug, fix, broken, crash, error, fail, wrong, incorrect, typo, hotfix) plus the `bug` label covers most cases. Edge cases where a complex bug is misclassified as simple can still be caught during code review -- the reviewer will request changes if the fix is inadequate.

- **Fast-tracked issues still go through code review and testing**: Skipping plan review does NOT mean skipping quality checks. The code review gate (now stricter) and testing gate remain mandatory for all issues.

- **No new labels needed**: The fast-track path reuses `dev:approved` -- the coder already watches for this label. No changes to `labels.json` or `nightshift init`.

- **Planner is unaffected**: The planner only watches `dev:planning` and `dev:plan-revising`. Fast-tracked issues never enter these states, so the planner's workflow is unchanged.

- **Review criteria file is shared**: Changes to `ns-dev-review-criteria.md` affect all teams using the `dev` preset. This is intentional -- the stricter review threshold should be the default.

## Risks & Mitigations

- **Risk**: Complex bugs get fast-tracked when they actually need a plan
  - Mitigation: The code reviewer catches inadequate fixes. If a "bug fix" is actually a redesign, the reviewer requests changes with feedback that a plan is needed. The coder can then request the producer re-route the issue. Additionally, the title heuristic is conservative -- ambiguous issues default to the standard path.

- **Risk**: Stricter code review creates too many revision cycles, slowing the pipeline
  - Mitigation: The review criteria already define a clear list of WARNING types. Coders should self-check against these criteria before submitting. Over time, coders learn the bar and submit cleaner code. The list of WARNINGs is finite and well-defined -- it's not subjective.

- **Risk**: Producer's quality gate at ready-to-merge could create a loop if it keeps sending back
  - Mitigation: The producer only checks the LAST reviewer comment. If the reviewer approved (no warnings), the producer passes. The loop only happens if the reviewer somehow approved with warnings -- which step 2 prevents.
