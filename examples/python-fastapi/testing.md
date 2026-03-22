# Testing Configuration — Python FastAPI

## Unit / Integration Tests

| Setting | Value |
|---------|-------|
| Framework | pytest |
| Command | `pytest` |
| File pattern | `tests/test_*.py` |

## E2E Tests

| Setting | Value |
|---------|-------|
| Framework | pytest + httpx |
| Directory | `tests/e2e/` |
| Run command | `pytest tests/e2e/ -v` |

## Server Detection

```bash
lsof -iTCP:8000 -sTCP:LISTEN -t  # FastAPI (uvicorn)
```

## Port Configuration

| Service | Default Port |
|---------|-------------|
| API server (uvicorn) | 8000 |

## Test Database

Use a separate test database to avoid data corruption:
```bash
DATABASE_URL=sqlite+aiosqlite:///./test.db pytest
```

Or use transaction rollback fixtures for test isolation.

## Diagnostic Procedures

1. **Read the error output** — pytest provides clear tracebacks
2. **Check if the server is running** — for E2E tests
3. **Check migrations** — run `alembic upgrade head` before tests
4. **Check fixtures** — database fixtures may need updating after schema changes
5. **Run single test** — `pytest tests/test_users.py::test_create_user -v`
