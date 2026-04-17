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

## Screenshot Guidelines (UI / E2E)

When running browser-based tests (Playwright, Cypress, etc.), always capture screenshots for visual validation.

**Playwright**:
```bash
# Take a screenshot in a test or ad-hoc script
npx playwright screenshot --browser chromium <url> /tmp/ns-screenshots-<issue>/page.png

# In test code, use page.screenshot():
#   await page.screenshot({ path: '/tmp/ns-screenshots-<issue>/step-name.png', fullPage: true });
```

**Cypress**:
```bash
# Cypress saves screenshots on failure by default to cypress/screenshots/
# For explicit captures in test code:
#   cy.screenshot('step-name')

# Copy to the standard location after the run:
cp cypress/screenshots/**/*.png /tmp/ns-screenshots-<issue>/
```

**What to capture**:
- The main happy-path flow (1-3 screenshots covering the feature)
- Any error/edge-case states the tests exercise
- For bug fixes: the corrected behavior
- Full-page screenshots preferred (`fullPage: true`) so the user can see the complete layout

All screenshots go to `/tmp/ns-screenshots-<issue>/` and are uploaded to the GitHub issue in step 5 of the tester pipeline.

## Diagnostic Procedures

When tests fail:

1. **Read the error output** -- most test frameworks provide descriptive error messages
2. **Check if services are running** -- many failures are "connection refused"
3. **Check if the code changed** -- assertions may reference outdated values
4. **Check test configuration** -- credentials, endpoints, or config may have changed
5. **Run a single failing test** in isolation to confirm it's not a test-ordering issue
