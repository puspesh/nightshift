# Customization Guide

nightshift separates pipeline machinery from project-specific behavior. You
customize the pipeline by editing the extension files in `.claude/nightshift/`.

## Extension Files

| File | Purpose | Who reads it |
|------|---------|-------------|
| `repo.md` | Commands, branch patterns, tracker (shared) | All agents |
| `ns-<team>-review-criteria.md` | Code review checklist | Reviewer, Coder |
| `ns-<team>-plan-template.md` | Implementation plan format | Planner |
| `ns-<team>-pr-template.md` | PR body format | Coder |
| `ns-<team>-test-config.md` | Test runner configuration | Tester |
| `ns-<team>-agents.json` | Per-agent model/effort/thinking config | Start command |
| `ns-<team>-citizens.json` | Per-agent display name and color | Visualization |

## Writing Review Criteria for Your Stack

The `ns-<team>-review-criteria.md` file is the most impactful extension to customize. It
determines what the reviewer flags and what the coder self-checks.

### Structure

Organize criteria by severity:

- **CRITICAL**: Must fix before merge (security, correctness, auth)
- **WARNING**: Should fix (code quality, test coverage, error handling)
- **SUGGESTION**: Consider improving (naming, documentation, style)

### Tips

1. **Be specific**: "No `any` types" is better than "use proper types"
2. **Include the why**: "Use parameterized queries -- raw string SQL enables injection"
3. **Reference conventions**: "Follow PEP 8 naming" rather than listing every rule
4. **Set thresholds**: Define when to approve vs. request changes
5. **Start from an example**: Copy from `examples/` and adapt

## Configuring Your Test Runner

Edit `.claude/nightshift/ns-<team>-test-config.md` with:

1. **Framework and command**: What test runner, how to invoke it
2. **File patterns**: Where test files live
3. **Server detection**: Commands to check if dev servers are running
4. **Port configuration**: Which ports your services use
5. **Diagnostic procedures**: How to debug common test failures

## Changing Label Names

Labels are defined in the preset's `labels.json` and created with the team prefix during init.
Note: Changing label names requires updating the agent profiles too, which
is not recommended unless you fork the profiles.

## Per-Agent Model and Reasoning Configuration

Edit `.claude/nightshift/ns-<team>-agents.json` to configure each agent's
model, thinking budget, and reasoning effort independently:

```json
{
  "producer": { "model": "sonnet" },
  "planner": { "model": "opus", "thinkingBudget": "high" },
  "reviewer": { "model": "opus", "reasoningEffort": "high" },
  "coder": { "model": "opus", "thinkingBudget": "10000" },
  "tester": { "model": "sonnet", "reasoningEffort": "low" }
}
```

### Available options

| Field | Values | Description |
|-------|--------|-------------|
| `model` | `sonnet`, `opus`, `haiku` | Claude model to use |
| `thinkingBudget` | `low`, `medium`, `high`, or a number | Thinking token budget |
| `reasoningEffort` | `low`, `medium`, `high` | Reasoning effort level |

### Resolution order

1. Exact role match (e.g., `"coder-1"` overrides `"coder"`)
2. Base role wildcard (`"coder"` applies to all coder-N agents)
3. Global runner from `repo.md` (base command)

### When changes take effect

Changes to this file take effect the next time you run `nightshift start`.
You do not need to re-run `nightshift init`.

### Cost optimization

| Model | Best for | Cost |
|-------|---------|------|
| sonnet | Fast, simple tasks (triage, test execution) | Lower |
| opus | Complex reasoning (planning, reviewing, coding) | Higher |

## Customizing the Plan Template

Edit `.claude/nightshift/plan-template.md` to add project-specific sections:

- **Data model section**: For projects with complex domain models
- **Migration section**: For database-heavy projects
- **UX section**: For frontend-heavy projects
- **Performance section**: For latency-sensitive systems

## Adding Project-Specific Sections

You can add new extension files beyond the defaults. Reference them in your
agent profiles by adding "Read `.claude/nightshift/your-file.md`" instructions.

For example, you might add:
- `security-checklist.md` -- for compliance-heavy projects
- `deployment.md` -- for deployment procedures
- `data-model.md` -- for complex domain models
