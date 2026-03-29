# Plan Template

> This file defines the structure for implementation plans.
> @ns-dev-planner uses this when writing plans.
> Customize it for your project's planning needs.

## Template

```markdown
# Plan: <Issue Title>

> Issue: #<number>
> Date: YYYY-MM-DD
> Status: draft | revised

## Overview
2-3 sentence summary of what we're building and why.

## Requirements
- [Requirement 1 -- derived from issue]
- [Requirement 2]

## Architecture Changes
- [Change 1: file path and description]
- [Change 2: file path and description]

## Implementation Steps

### Phase 1: <Phase Name>

#### Tests First
- **Test file**: `path/to/test/file`
- **Test cases**:
  - `test case 1`: expected behavior — assert [condition]
  - `test case 2`: edge case — assert [condition]
  - `test case 3`: error case — assert [condition]

#### Implementation Steps
1. **<Step Name>** (`path/to/file`)
   - Action: specific action to take
   - Why: reason for this step
   - Dependencies: none / requires step X

2. **<Step Name>** (`path/to/file`)
   ...

### Phase 2: <Phase Name>

#### Tests First
- **Test file**: `path/to/test/file`
- **Test cases**:
  - ...

#### Implementation Steps
...

## Testing Strategy
- **Approach**: Test-Driven Development (TDD) — tests are written BEFORE implementation in each phase
- Unit tests: [files to test, test file locations]
- Integration tests: [flows to test]
- E2E tests: [user journeys to verify]
- **Test infrastructure**: [existing test helpers, fixtures, or patterns to reuse]

## Assumptions
- [Assumption 1 -- decision made autonomously, reviewer should validate]
- [Assumption 2]

## Risks & Mitigations
- **Risk**: [description]
  - Mitigation: [how to address]
```

## Sizing Guidelines

Break large features into independently deliverable phases:

- **Phase 1**: Minimum viable -- smallest slice that provides value
- **Phase 2**: Core experience -- complete happy path
- **Phase 3**: Edge cases -- error handling, polish

Each phase should be mergeable independently. Avoid plans that require all phases before anything works.

## Revision Notes

When revising a plan, add a `## Revision Notes` section at the bottom documenting:
- What feedback was received
- What changed
- What was kept and why
