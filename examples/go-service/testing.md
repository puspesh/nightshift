# Testing Configuration — Go Service

## Unit / Integration Tests

| Setting | Value |
|---------|-------|
| Framework | go test (stdlib) |
| Command | `go test ./...` |
| File pattern | `*_test.go` |

## E2E Tests

| Setting | Value |
|---------|-------|
| Framework | go test + httptest or testcontainers |
| Directory | `e2e/` or `tests/` |
| Run command | `go test ./e2e/ -v -count=1` |

## Server Detection

```bash
lsof -iTCP:8080 -sTCP:LISTEN -t  # HTTP server
lsof -iTCP:50051 -sTCP:LISTEN -t # gRPC server
```

## Port Configuration

| Service | Default Port |
|---------|-------------|
| HTTP server | 8080 |
| gRPC server | 50051 |

## Test Database

Use testcontainers for database tests:
```go
container, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
    ContainerRequest: testcontainers.ContainerRequest{
        Image:        "postgres:16",
        ExposedPorts: []string{"5432/tcp"},
        WaitingFor:   wait.ForListeningPort("5432/tcp"),
    },
    Started: true,
})
```

Or use an in-memory SQLite for simpler cases.

## Diagnostic Procedures

1. **Read the error output** — `go test -v` shows test names and failures
2. **Check if services are running** — for E2E tests
3. **Check migrations** — ensure database schema is up to date
4. **Run single test** — `go test ./pkg/users/ -run TestCreateUser -v`
5. **Race detection** — run `go test -race ./...` to detect data races
