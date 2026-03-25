# Plan: Cost and Token tracking for each task done

> Issue: #27
> Date: 2026-03-26
> Status: draft

## Overview

Add cost and token tracking to the nightshift pipeline so that every agent reports verifiable usage data when it completes work on an issue, and the producer aggregates a final cost summary when the issue reaches `dev:ready-to-merge`. The critical constraint is that numbers must never be hallucinated -- all reported values must come from real, machine-generated data (timestamps, Claude Code session output, subagent `<usage>` tags), not from agent estimates.

## Requirements

- R1: Every agent reports its cost/token usage in its completion comment on the issue
- R2: The producer posts a final cost summary when an issue reaches `dev:ready-to-merge`
- R3: Numbers must be correct and verifiable -- not hallucinated or estimated
- R4: Subagent token usage must be tracked and included
- R5: Tracking should be clear and unambiguous

## Current State Analysis

### What agents report today
Each agent posts a structured comment on completion with Status, Summary, Branch, and Next. None include cost or token data.

### Available data sources for cost/token tracking

| Source | Data | Reliability | How to access |
|--------|------|-------------|---------------|
| Wall-clock duration | Start/end timestamps | Exact (bash `date`) | Agent runs `date +%s` at start and end of work |
| Subagent `<usage>` tags | `total_tokens`, `tool_uses`, `duration_ms` | Exact (API data) | Returned in Agent tool results, visible to the calling agent |
| Claude Code session stats | Total tokens, cost | Exact | Displayed at session end; NOT programmatically accessible mid-session |
| Claude Code hooks | Event name, tool name | No cost data | Hooks don't include token counts or cost |
| Model pricing | $/token per model | Known constants | Can be looked up but applying them requires token counts |

### The hallucination problem
Claude Code does not expose session-level token usage or cost as a programmatic value during a session. An agent cannot run a command to get "how many tokens have I used so far." This means:
- Agents **cannot** report their own session token usage accurately
- Any token count an agent "reports" from its own session would be a guess/hallucination
- The only reliable token data comes from **subagent `<usage>` tags** and **external measurement**

### Reliable approach
The only non-hallucinated data each agent can capture:
1. **Wall-clock duration** -- measured via `date +%s` at start and end
2. **Subagent token usage** -- from `<usage>` tags in Agent tool results
3. **Tool invocation count** -- agent can count its own tool calls
4. **Model used** -- from config/frontmatter

## Architecture Changes

### Modified files

| File | Change |
|------|--------|
| `presets/dev/agents/ns-dev-planner.md` | Add cost reporting to completion comment template |
| `presets/dev/agents/ns-dev-reviewer.md` | Add cost reporting to completion comment template |
| `presets/dev/agents/ns-dev-coder.md` | Add cost reporting to completion comment template |
| `presets/dev/agents/ns-dev-tester.md` | Add cost reporting to completion comment template |
| `presets/dev/agents/ns-dev-producer.md` | Add cost aggregation at `dev:ready-to-merge` step |

### No new code files
This feature is implemented entirely through agent profile changes (markdown instructions). No new TypeScript modules or scripts are needed. The agents already have the tools (bash, gh) to capture timestamps and post comments.

## Implementation Steps

### Phase 1: Agent self-reporting

Each agent profile gets two additions: (a) capture a start timestamp at the beginning of work, and (b) include a `**Cost**` section in their completion comment.

1. **Update planner profile** (`presets/dev/agents/ns-dev-planner.md`)
   - Action: Add timestamp capture at the start of work (after claiming the issue in step 1):
     ```bash
     WORK_START=$(date +%s)
     ```
   - Update the completion comment template (step 5) to include:
     ```markdown
     ### @ns-dev-planner -- Plan ready
     **Status**: done
     **Plan**: `docs/plans/issue-<number>-<slug>-<YYYY-MM-DD>.md`
     **Branch**: `issue-<number>-<slug>`
     **Summary**: <2-3 sentence overview>
     **Cost**:
     - Duration: <seconds>s
     - Model: opus
     - Subagents: <N> launched, <total_tokens> tokens
     **Next**: Ready for @ns-dev-reviewer review (label: `dev:plan-review`)
     ```
   - The agent calculates duration as `$(( $(date +%s) - WORK_START ))`.
   - For subagent tokens: the planner launches 2-3 explorer subagents. Each returns `<usage>total_tokens: XXXXX</usage>`. The planner must sum these and report the total. Instruct the agent to track subagent usage by noting the `total_tokens` from each Agent tool result.
   - Why: Planner uses subagents extensively; tracking their tokens is the most meaningful cost metric.
   - Dependencies: none

2. **Update reviewer profile** (`presets/dev/agents/ns-dev-reviewer.md`)
   - Action: Same pattern -- capture `WORK_START`, report duration and model in the completion comment:
     ```markdown
     **Cost**:
     - Duration: <seconds>s
     - Model: opus
     - Subagents: none
     ```
   - The reviewer typically doesn't use subagents, so subagent tokens will be 0 or "none."
   - Why: Reviewer work is mostly reading + analysis, so duration is the primary cost indicator.
   - Dependencies: none

3. **Update coder profile** (`presets/dev/agents/ns-dev-coder.md`)
   - Action: Same pattern. The coder may use subagents for parallel implementation:
     ```markdown
     **Cost**:
     - Duration: <seconds>s
     - Model: opus
     - Subagents: <N> launched, <total_tokens> tokens
     ```
   - Why: Coder is typically the most expensive agent (longest duration, most tool use).
   - Dependencies: none

4. **Update tester profile** (`presets/dev/agents/ns-dev-tester.md`)
   - Action: Same pattern:
     ```markdown
     **Cost**:
     - Duration: <seconds>s
     - Model: sonnet
     - Subagents: none
     ```
   - Why: Tester is typically the cheapest (sonnet model, short cycles).
   - Dependencies: none

5. **Add instructions for tracking subagent usage** (all agent profiles)
   - Action: Add a section to each agent profile's guidelines explaining how to track subagent tokens:
     ```markdown
     ## Cost Tracking

     You MUST track and report cost data accurately. Do NOT estimate or hallucinate numbers.

     **Duration**: Run `WORK_START=$(date +%s)` immediately after claiming an issue.
     At completion, calculate: `DURATION=$(( $(date +%s) - WORK_START ))`.

     **Subagent tokens**: When you use the Agent tool, the result includes
     `<usage>total_tokens: XXXXX</usage>`. Sum ALL subagent total_tokens values
     and report the total. If you launched no subagents, report "none".

     **Model**: Report the model from your profile frontmatter (e.g., opus, sonnet).

     Include these in your completion comment under a `**Cost**:` section.
     Numbers must be exact — from bash timestamps and usage tags, never estimated.
     ```
   - Why: Clear instructions prevent agents from guessing. The "never estimated" constraint is critical.
   - Dependencies: none

### Phase 2: Producer cost aggregation

6. **Update producer's ready-to-merge handler** (`presets/dev/agents/ns-dev-producer.md`)
   - Action: Modify step 5 ("Handle ready-to-merge") to parse agent comments and aggregate cost data:
     ```markdown
     ### 5. Handle ready-to-merge

     For issues labeled `dev:ready-to-merge`:
     - Find the linked PR: `gh pr list --search "issue:<number>" --json number,url`
     - Parse ALL agent comments on the issue to extract cost data:
       ```bash
       gh issue view <number> --json comments --jq '.comments[].body'
       ```
     - For each comment that contains a `**Cost**:` section, extract:
       - Duration (in seconds)
       - Model used
       - Subagent token count
     - Calculate total duration across all agents
     - Post a final summary comment:
     ```

     Updated comment format:
     ```markdown
     ### @ns-dev-producer -- Issue Complete
     **Status**: ready-to-merge
     **PR**: #<pr-number>

     **Pipeline Cost Summary**:
     | Agent | Duration | Model | Subagent Tokens |
     |-------|----------|-------|-----------------|
     | planner | 245s | opus | 76,744 |
     | reviewer (plan) | 89s | opus | 0 |
     | coder | 412s | opus | 40,866 |
     | reviewer (code) | 102s | opus | 0 |
     | tester | 67s | sonnet | 0 |
     | **Total** | **915s (15m 15s)** | | **117,610** |

     **Next**: Awaiting human merge
     ```
   - The producer extracts cost data by parsing the `**Cost**:` lines from each agent's comment. This is string parsing of structured text -- reliable because the format is controlled by our own agent profiles.
   - Why: Centralized summary gives a clear view of total pipeline cost per issue.
   - Dependencies: steps 1-5

7. **Add cost parsing instructions to producer** (`presets/dev/agents/ns-dev-producer.md`)
   - Action: Add detailed parsing instructions:
     ```markdown
     ## Parsing Agent Cost Data

     To extract cost data from issue comments:
     ```bash
     # Get all comments
     gh issue view <number> --json comments --jq '.comments[] | select(.body | contains("**Cost**")) | .body'
     ```

     Parse each matching comment for:
     - Agent name: from the `### @ns-dev-<role>` header
     - Duration: the number after "Duration:" (in seconds)
     - Model: the value after "Model:"
     - Subagent tokens: the number after "tokens" in the Subagents line (0 if "none")

     Sum durations and subagent tokens across all agents.
     Report exact numbers only. If a comment is missing cost data or is malformed, note "N/A" for that agent — do NOT guess.
     ```
   - Why: Explicit parsing instructions prevent the producer from hallucinating totals.
   - Dependencies: step 6

### Phase 3: Verification guardrails

8. **Add verification step to producer aggregation** (`presets/dev/agents/ns-dev-producer.md`)
   - Action: After parsing all agent comments, the producer must verify its math:
     ```markdown
     **Verification**: Before posting the summary, verify your totals:
     1. List each agent's duration explicitly: `planner=245, reviewer=89, ...`
     2. Sum them with bash: `echo $(( 245 + 89 + 412 + 102 + 67 ))`
     3. List each agent's subagent tokens: `planner=76744, coder=40866, ...`
     4. Sum them with bash: `echo $(( 76744 + 40866 ))`
     5. Use the bash-computed values in your summary comment, NOT mental arithmetic
     ```
   - Why: Forces the producer to use bash for arithmetic instead of trying to sum numbers mentally (which LLMs are unreliable at). This directly addresses the "ensure sum is always correct" requirement.
   - Dependencies: step 7

## Testing Strategy

- **Manual verification** (per agent):
  1. Trigger the planner on a test issue
  2. Verify: completion comment includes `**Cost**:` section with Duration, Model, and Subagents
  3. Verify: duration value is reasonable (not 0, not negative, not unrealistically large)
  4. Verify: subagent tokens match the `<usage>` tags from the agent's subagent calls
  5. Repeat for reviewer, coder, tester

- **Manual verification** (producer aggregation):
  1. Move a test issue through the full pipeline to `dev:ready-to-merge`
  2. Verify: producer posts a summary table with per-agent cost breakdown
  3. Verify: totals match the sum of individual agents (cross-check with bash)
  4. Verify: if an agent's comment is missing cost data, the summary shows "N/A"

- **Regression**: No TypeScript code changes, so no unit test changes needed. `npm run test` should pass unchanged.

## Assumptions

- **Wall-clock duration is a useful cost proxy**: While not a direct dollar amount, duration correlates with token usage (longer sessions use more tokens). Combined with the model name, users can estimate cost. This is the only metric we can guarantee is not hallucinated.

- **Subagent `<usage>` tags are reliable**: The `total_tokens` value in `<usage>` tags comes from the Claude API response, not from the agent's reasoning. This is machine-generated data that agents can reliably extract and report.

- **Agents will follow the reporting format**: Since agent profiles are prescriptive (they tell the agent exactly what to include in comments), the structured `**Cost**:` section should be consistently generated. If an agent deviates, the producer's parser will skip it with "N/A".

- **Session-level token counts are not available**: Claude Code does not expose total session token usage via a programmatic interface during the session. If this changes in the future (e.g., a `/usage` command or environment variable), the agent profiles can be updated to include it.

- **No code changes needed**: This is implemented purely through agent profile instructions (markdown). No TypeScript modules, scripts, or hooks changes are required. This keeps the change set minimal and reviewable.

## Risks & Mitigations

- **Risk**: Agents may still hallucinate numbers despite instructions not to
  - Mitigation: The instructions explicitly state to use bash for timestamps and arithmetic. The structured format (`WORK_START=$(date +%s)` → `DURATION=$(( $(date +%s) - WORK_START ))`) is a mechanical process that doesn't require reasoning. For subagent tokens, the agent copies a number from the tool result, not computing it.

- **Risk**: Some agent cycles may not have subagent `<usage>` tags (e.g., no subagents used)
  - Mitigation: Instructions say to report "none" for subagent tokens when no subagents were launched. The producer handles missing data gracefully with "N/A".

- **Risk**: Producer may fail to parse cost data from comments if format varies
  - Mitigation: All agent profiles use identical `**Cost**:` format. The producer parses with `gh issue view` + `jq` + `grep`, not with LLM reasoning about free-text. If parsing fails, report "N/A" rather than guess.

- **Risk**: Duration tracking doesn't capture actual API cost (different models have different $/token rates)
  - Mitigation: The summary includes the model name per agent, letting users apply their own pricing. A future enhancement could add model-specific cost estimates based on known pricing tiers, but this should be clearly labeled as an estimate separate from the verified duration data.

- **Risk**: Multiple reviewer cycles (plan review + code review) may overwrite each other
  - Mitigation: The reviewer posts separate comments for each review cycle. The producer aggregates ALL comments with `**Cost**:` sections, so both plan-review and code-review costs are captured independently.
