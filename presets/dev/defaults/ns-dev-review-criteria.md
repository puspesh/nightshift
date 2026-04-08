# Review Criteria

> This file is read by @ns-dev-reviewer and @ns-dev-coder.
> Customize it with your project's coding standards and conventions.

## CRITICAL (must fix before merge)

- **Security**: No hardcoded secrets, API keys, or credentials in code
- **Security**: No SQL injection, XSS, or other injection vulnerabilities
- **Correctness**: No logic bugs — edge cases handled, off-by-one errors checked
- **Auth**: Protected routes must check permissions before performing actions
- **Data loss**: No destructive operations without confirmation or safeguards

## WARNING (should fix)

- **Function length**: Functions over 50 lines should be broken up
- **Nesting depth**: More than 3 levels of nesting — extract or early-return
- **Console output**: No `console.log` left in production code
- **Commented-out code**: Delete it — version control has history
- **Test coverage**: New features need tests, bug fixes need regression tests
- **TDD compliance**: Tests must exist for new/changed behavior — not just happy path but edge cases and error cases. Bug fixes must include a regression test that would have caught the bug.
- **Test quality**: Tests should assert meaningful behavior, not implementation details. Avoid trivially passing tests.
- **Error handling**: Promises without error handling (`.catch` or try/catch)
- **Unused code**: Unused imports, variables, or dead code paths
- **Magic values**: Magic numbers or strings — use named constants

## SUGGESTION (consider improving)

- **Naming**: Variables, functions, and types should have clear, descriptive names
- **Duplication**: Duplicated logic across files — consider extracting to a shared utility
- **Documentation**: Complex logic should have comments explaining "why", not "what"
- **TODO/FIXME**: Should reference an issue number or plan

## Approval Thresholds

### Plan Reviews
- **Approve**: No CRITICAL findings
- **Revise**: Any CRITICAL finding, or 3+ WARNINGs in the same area

### Code Reviews
- **Approve**: No CRITICAL findings AND no unresolved WARNINGs
- **Revise**: Any CRITICAL finding, OR any unresolved WARNING
- A WARNING is "resolved" if the coder has addressed it in a revision (check git log for evidence)
- SUGGESTIONs do not block approval

## Design Review Criteria

When reviewing plans or architectural decisions:

1. **Does it fit the existing architecture?** Check CLAUDE.md for project structure
2. **Is the API surface minimal?** Don't add endpoints/fields that aren't needed yet
3. **Is the schema migration safe?** No destructive changes without a migration plan
4. **Are types flowing end-to-end?** Input validation -> business logic -> database -> response
5. **Is it testable?** The design should support test isolation
6. **Is it TDD-structured?** Each phase must include a "Tests First" subsection with specific test cases, test file locations, and assertions. Phases without test specs should be flagged as WARNING.
