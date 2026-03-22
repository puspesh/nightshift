# Testing Configuration — TypeScript Monorepo

## Unit / Integration Tests

| Setting | Value |
|---------|-------|
| Framework | Vitest |
| Command | `pnpm test` |
| File pattern | `src/__tests__/*.test.ts` |

## E2E Tests

| Setting | Value |
|---------|-------|
| Framework | Playwright |
| Directory | `apps/web/e2e/` or `e2e/` |
| Run command | `cd ~/.claude/skills/playwright-skill && node run.js <path-to-test>` |

## Server Detection

```bash
lsof -iTCP:3000 -sTCP:LISTEN -t  # API server
lsof -iTCP:8081 -sTCP:LISTEN -t  # Frontend dev server
```

## Port Configuration

| Service | Default Port |
|---------|-------------|
| API server | 3000 |
| Frontend dev server | 8081 |

Set env vars for non-default ports:
```bash
API_URL=http://localhost:3001 APP_URL=http://localhost:8082 \
  cd ~/.claude/skills/playwright-skill && node run.js <test-file>
```

## Diagnostic Procedures

1. **Read the error output** — Vitest and Playwright provide descriptive errors
2. **Check if servers are running** — most E2E failures are "connection refused"
3. **Check for changed UI** — if a Playwright locator fails, read the component source
4. **Check test helpers** — login credentials or API endpoints may have changed
5. **Run single test** — isolate ordering issues: `pnpm test -- <test-file>`
