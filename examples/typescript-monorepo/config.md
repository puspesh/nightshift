# Pipeline Configuration — TypeScript Monorepo

> Example for a pnpm + Turborepo monorepo with ESM modules.

## Commands

| Action | Command |
|--------|---------|
| Install dependencies | `pnpm install` |
| Build | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Test | `pnpm test` |
| Lint | `pnpm lint` |

## Verification Command

```bash
pnpm typecheck && pnpm test
```

## Agent Models

| Agent | Model |
|-------|-------|
| producer | sonnet |
| planner | opus |
| reviewer | opus |
| coder | opus |
| tester | sonnet |

## Branch Naming

Pattern: `issue-{number}-{slug}`

## Commit Messages

Pattern: `{type}(issue-{number}): {description}`

## Project Conventions

- All packages use ESM (`"type": "module"`)
- Turborepo for build orchestration
- Per-package commands: `pnpm --filter @myorg/<pkg> <cmd>`
- TypeScript strict mode across all packages
