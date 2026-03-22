# Testing Configuration

> This file is read by @ns-dev-tester.
> Fill in the TODOs with your project's test setup.

## Unit / Integration Tests

| Setting | Value |
|---------|-------|
| Framework | `TODO` (e.g., Vitest, Jest, pytest, go test) |
| Command | `TODO` (e.g., `npm test`, `pytest`, `go test ./...`) |
| File pattern | `TODO` (e.g., `src/__tests__/*.test.ts`, `*_test.go`) |

## E2E Tests

| Setting | Value |
|---------|-------|
| Framework | `TODO` (e.g., Playwright, Cypress, none) |
| Directory | `TODO` (e.g., `e2e/`, `tests/e2e/`) |
| Run command | `TODO` (e.g., `npx playwright test`, `npm run e2e`) |

## Server Detection

Before running E2E tests, check if required services are running:

```bash
# Check if a port is in use
lsof -iTCP:<port> -sTCP:LISTEN -t
```

## Port Configuration

| Service | Default Port |
|---------|-------------|
| API server | `TODO` |
| Frontend dev server | `TODO` |

## Diagnostic Procedures

When tests fail:

1. **Read the error output** -- most test frameworks provide descriptive error messages
2. **Check if services are running** -- many failures are "connection refused"
3. **Check if the code changed** -- assertions may reference outdated values
4. **Check test configuration** -- credentials, endpoints, or config may have changed
5. **Run a single failing test** in isolation to confirm it's not a test-ordering issue
