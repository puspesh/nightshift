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

Labels are derived from the `stages` section of `team.yaml` and created with
the team prefix during init. To customize labels, edit the stages in your
team's `team.yaml` file.

## Per-Agent Model and Reasoning Configuration

Model and reasoning settings are configured per-agent in `team.yaml`:

```yaml
agents:
  producer:
    model: sonnet
    reasoning_effort: medium
    # ...
  coder:
    model: opus
    # ...
```

### Available options

| Field | Values | Description |
|-------|--------|-------------|
| `model` | Any Claude model ID | Claude model to use |
| `reasoning_effort` | `low`, `medium`, `high` | Reasoning effort level |

### Resolution order

1. Agent-specific config in `team.yaml`
2. Global runner from `repo.md` (base command)

### When changes take effect

Changes to `team.yaml` take effect after running `nightshift reinit --team <team>`,
then restarting with `nightshift start`.

### Cost optimization

| Model | Best for | Cost |
|-------|---------|------|
| sonnet | Fast, simple tasks (triage, test execution) | Lower |
| opus | Complex reasoning (planning, reviewing, coding) | Higher |

## Customizing the Plan Template

Edit `.claude/nightshift/ns-<team>-plan-template.md` to add project-specific sections:

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
