# Review Criteria — TypeScript Monorepo

## CRITICAL (must fix before merge)

- **Security**: No hardcoded secrets, API keys, or credentials
- **Security**: No SQL injection, XSS, or injection vulnerabilities
- **Correctness**: No logic bugs, edge cases handled
- **Auth**: Protected routes check permissions before mutations
- **Types**: No `any` types — use `unknown` and narrow with type guards

## WARNING (should fix)

- **ESM imports**: Import paths MUST include `.js` extension
- **Type imports**: Use `import type { Foo }` for type-only imports
- **Function length**: Functions over 50 lines should be broken up
- **Nesting depth**: More than 3 levels — extract or early-return
- **Console output**: No `console.log` in production code
- **Commented-out code**: Delete it — git has history
- **Test coverage**: New features need tests, bug fixes need regression tests
- **Error handling**: Promises without `.catch` or try/catch
- **Unused code**: Unused imports or variables
- **Zod schemas**: Define in shared package, not inline in routers
- **Non-null assertions**: No `!` without a comment explaining safety

## SUGGESTION (consider improving)

- **Naming**: Follow conventions (files: kebab-case, functions: camelCase, types: PascalCase, constants: SCREAMING_SNAKE_CASE, DB columns: snake_case)
- **Magic values**: Use named constants from the shared package
- **Duplication**: Extract shared logic to utilities
- **Barrel exports**: Consumers should import from package index, not internal modules

## Database Conventions

- Foreign keys use `.references(() => parentTable.id)`
- Every new table needs index strategy — review FK columns
- IDs: nanoid (TEXT), Timestamps: INTEGER (unix ms)
- Column names: snake_case in DB, camelCase in TypeScript (Drizzle auto-maps)

## API Conventions

- One router file per domain
- Input validation via Zod schemas from shared package
- Error handling: throw framework-appropriate errors with status codes
- Pagination: cursor-based using timestamps

## Testing Conventions

- Use in-memory database for test isolation
- Test edge cases: empty inputs, boundary values, unauthorized access
- Test files: `src/__tests__/[domain].test.ts`

## Approval Thresholds

- **Approve**: No CRITICAL findings
- **Revise**: Any CRITICAL, or 3+ WARNINGs in same area
