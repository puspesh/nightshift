# Pipeline Configuration — Go Service

> Example for a Go service with standard tooling.

## Commands

| Action | Command |
|--------|---------|
| Install dependencies | `go mod download` |
| Build | `go build ./...` |
| Typecheck | `go vet ./...` |
| Test | `go test ./...` |
| Lint | `golangci-lint run` |

## Verification Command

```bash
go vet ./... && go test ./...
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

- Go 1.22+
- Standard library preferred over external dependencies
- Context propagation through all function chains
- Structured logging (slog)
- Error wrapping with `fmt.Errorf("...: %w", err)`
