# Plan: Coder and reviewer agents should comment on issues during work

> Issue: #17
> Date: 2026-03-23
> Status: draft

## Overview

The producer and planner agents post status comments on GitHub issues, but the coder and reviewer don't comment at the start of their work. Both profiles already have "completion" comments (coder: step 6 "Implementation complete", reviewer: review verdict comment) and blocker comments (error handling sections). The gap is a "starting work" comment posted immediately after claiming the issue so progress is visible from GitHub. This is a profile-only change — two `gh issue comment` calls added to the workflow steps.

## Requirements

- Coder posts a comment when starting implementation
- Reviewer posts a comment when starting a review
- Comment format is consistent with existing agent comment patterns (`### @agent -- Status`)

## Architecture Changes

- **Modified**: `presets/dev/agents/ns-dev-coder.md` — add starting comment at step 2
- **Modified**: `presets/dev/agents/ns-dev-reviewer.md` — add starting comment at step 2

## Implementation Steps

### Phase 1: Add starting comments

1. **Add "starting implementation" comment to coder profile** (`presets/dev/agents/ns-dev-coder.md`)
   - Action: In step 2 ("Checkout branch and read the plan"), add a `gh issue comment` call immediately after checking out the branch and before reading the plan. Insert after the `git pull` command (line 104):
     ```bash
     gh issue comment <number> --body "### @ns-dev-coder -- Implementation started
     **Status**: in-progress
     **Branch**: \`issue-<number>-<slug>\`
     **Plan**: \`<plan file path from planner's comment>\`
     **Next**: Implementing phase by phase"
     ```
   - Why: Without this, there's no GitHub-visible signal between the producer's triage comment and the coder's final "Implementation complete" comment. For long implementations this gap can be hours, leaving observers with no indication that work is in progress.
   - Dependencies: none

2. **Add "starting review" comment to reviewer profile** (`presets/dev/agents/ns-dev-reviewer.md`)
   - Action: In step 2 ("Checkout the feature branch"), add a `gh issue comment` call after the `git pull` command (line 97). The comment should indicate whether this is a plan review or code review:
     ```bash
     # Determine review type from the label that was matched in step 1
     gh issue comment <number> --body "### @ns-dev-reviewer -- Review started
     **Status**: in-progress
     **Type**: <Plan Review | Code Review>
     **Branch**: \`issue-<number>-<slug>\`
     **Next**: Reviewing..."
     ```
   - Why: Same visibility gap as the coder. For plan reviews, there's no signal between the planner's "Plan ready" comment and the reviewer's verdict. The "starting review" comment closes this gap.
   - Dependencies: none

### Phase 2: Verify existing comments are sufficient

3. **Audit coder completion comment** (`presets/dev/agents/ns-dev-coder.md`)
   - Action: Verify step 6 (line 166-178) covers the "creating a PR" requirement. The current comment includes `**PR**: #<pr-number>`, `**Branch**`, and `**Summary**`. This satisfies the issue's requirement for PR creation comments. No changes needed.
   - Why: The issue specifically asks that the coder comments when creating a PR. This is already covered.
   - Dependencies: none

4. **Audit coder blocker comment** (`presets/dev/agents/ns-dev-coder.md`)
   - Action: Verify the Error Handling section (line 237-243) covers the "hitting blockers" requirement. The current comment includes `### @ns-dev-coder -- Blocked`, `**Error**`, and label transition. This satisfies the requirement. No changes needed.
   - Why: The issue specifically asks that the coder comments when hitting blockers. This is already covered.
   - Dependencies: none

5. **Audit reviewer verdict and completion comments** (`presets/dev/agents/ns-dev-reviewer.md`)
   - Action: Verify the Comment Format (line 161-176) and pipeline workflow steps 3-4 cover the "posting review results" and "completing review cycle" requirements. The current format includes verdict (`APPROVE`/`REVISE`), severity counts, and next steps. This satisfies both requirements. No changes needed.
   - Why: The issue asks that the reviewer comments with review results and on completion. Both are already covered by the review verdict comment.
   - Dependencies: none

## Testing Strategy

- Profile validation: Run `bun run test` to verify `tests/profiles.test.ts` still passes (it validates naming conventions and required patterns in agent profiles)
- Manual verification: Start the pipeline, create a test issue, and verify comments appear at each workflow step on the GitHub issue timeline

## Assumptions

- **Comment format consistency**: The "starting" comments follow the same `### @agent -- <Title>` header pattern used by all other agents. The `**Status**: in-progress` field is new but consistent with the existing `done`/`blocked` values.
- **Review type detection**: The reviewer can determine whether it's a plan review or code review from the label matched in step 1 (`dev:plan-review` vs `dev:code-review`). This is already tracked implicitly in the workflow — the comment template just needs to reference it.

## Risks & Mitigations

- **Risk**: Additional GitHub API calls slow down the agent cycle
  - Mitigation: One extra `gh issue comment` per cycle is negligible — the agents already make multiple `gh` calls for label edits, issue reads, and PR creation.
