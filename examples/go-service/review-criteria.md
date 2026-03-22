# Review Criteria — Go Service

## CRITICAL (must fix before merge)

- **Security**: No hardcoded secrets or credentials
- **Security**: No SQL injection (use parameterized queries)
- **Security**: No unvalidated user input in file paths or shell commands
- **Correctness**: No logic bugs, edge cases handled
- **Error handling**: All errors must be checked — no ignored error returns
- **Goroutine lifecycle**: Goroutines must have a clean shutdown path (context cancellation)
- **Race conditions**: Shared state must be protected (mutex, channel, or atomic)

## WARNING (should fix)

- **Context propagation**: All I/O functions should accept `context.Context` as first param
- **Error wrapping**: Use `fmt.Errorf("...: %w", err)` for error chains
- **Interface design**: Accept interfaces, return structs — keep interfaces small
- **Function length**: Functions over 50 lines should be broken up
- **Logging**: Use structured logging (slog), not `fmt.Println` or `log.Println`
- **Test coverage**: New features need tests, bug fixes need regression tests
- **Resource cleanup**: Use `defer` for cleanup (file handles, locks, connections)
- **Unused code**: Unused imports or variables (Go compiler catches this, but unused exported symbols)

## SUGGESTION (consider improving)

- **Naming**: Follow Go conventions (short names, MixedCaps, package-level docs)
- **Table-driven tests**: Prefer table-driven tests for multiple cases
- **Comments**: Exported functions should have godoc comments
- **Magic values**: Use named constants
- **Duplication**: Extract shared logic to internal packages

## Database Conventions

- Use `database/sql` or `sqlx` with parameterized queries
- Migrations via goose or golang-migrate
- Connection pooling via `sql.DB` (don't create connections per request)
- Use transactions for multi-statement operations

## API Conventions

- HTTP: standard `net/http` or chi router
- gRPC: protobuf definitions in `proto/`
- Middleware for auth, logging, recovery
- Request validation before business logic

## Testing Conventions

- Table-driven tests with `t.Run` subtests
- Testcontainers for database integration tests
- Mocks only for external services, not for your own packages
- Test files: `*_test.go` in the same package

## Approval Thresholds

- **Approve**: No CRITICAL findings
- **Revise**: Any CRITICAL, or 3+ WARNINGs in same area
