# Pipeline Configuration — Python FastAPI

> Example for a Python FastAPI project with uv, pytest, and mypy.

## Commands

| Action | Command |
|--------|---------|
| Install dependencies | `uv sync` |
| Build | _(not applicable — Python is interpreted)_ |
| Typecheck | `mypy .` |
| Test | `pytest` |
| Lint | `ruff check .` |

## Verification Command

```bash
mypy . && pytest
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

- Python 3.12+
- uv for dependency management (fallback: pip + venv)
- FastAPI with async routes
- Pydantic v2 for data validation
- SQLAlchemy 2.0 with async sessions
- Alembic for migrations
