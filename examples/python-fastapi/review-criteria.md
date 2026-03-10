# Review Criteria — Python FastAPI

## CRITICAL (must fix before merge)

- **Security**: No hardcoded secrets or credentials
- **Security**: No SQL injection (use parameterized queries / ORM)
- **Security**: No unvalidated user input in file paths, shell commands, or templates
- **Correctness**: No logic bugs, edge cases handled
- **Auth**: Protected endpoints check permissions via dependency injection
- **Type safety**: All function signatures have type hints

## WARNING (should fix)

- **Type hints**: Missing return types or parameter types
- **Pydantic models**: Use Pydantic for request/response schemas, not raw dicts
- **Async/await**: Don't use sync I/O in async routes (blocks the event loop)
- **Dependency injection**: Use FastAPI `Depends()` for shared logic (auth, DB sessions)
- **Function length**: Functions over 50 lines should be broken up
- **Console output**: No `print()` in production code — use `logging`
- **Test coverage**: New features need tests, bug fixes need regression tests
- **Error handling**: Bare `except:` clauses — always catch specific exceptions
- **Unused imports**: Clean up unused imports

## SUGGESTION (consider improving)

- **Naming**: Follow PEP 8 (snake_case for functions/variables, PascalCase for classes)
- **Docstrings**: Public functions should have docstrings
- **Magic values**: Use constants or enums
- **Duplication**: Extract shared logic to utility modules

## Database Conventions

- SQLAlchemy 2.0 style (mapped_column, DeclarativeBase)
- Alembic for all schema changes — no manual DDL
- Foreign keys must have indexes
- Use async sessions for all database operations

## API Conventions

- One router per domain in `app/routers/`
- Request/response models defined in `app/schemas/`
- Dependency injection for auth, DB session, pagination
- Use HTTPException with appropriate status codes

## Testing Conventions

- pytest with httpx AsyncClient for API testing
- Use database fixtures with transaction rollback
- Test files: `tests/test_<domain>.py`

## Approval Thresholds

- **Approve**: No CRITICAL findings
- **Revise**: Any CRITICAL, or 3+ WARNINGs in same area
