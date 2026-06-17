# PostgreSQL Provider Tests

This directory contains tests for the PostgreSQL provider package.

## Test Files

- `ProviderPostgres.test.ts` - Unit tests for the main ProviderPostgres class
- `integration.test.ts` - Integration tests and edge case scenarios
- `run-tests.ts` - Test runner that executes all tests

## Running Tests

```bash
npm test
```

This will:
1. Build the tests using TypeScript
2. Execute all test files using the test runner

## Test Structure

The tests use mocking to avoid requiring an actual PostgreSQL database connection during testing. This allows the tests to run in any environment and focus on the provider's logic and error handling.

### Unit Tests
- Constructor validation
- Error classes
- Connection initialization
- Query execution
- Health checks
- Connection shutdown
- Parameter handling
- Error scenarios

### Integration Tests
- Configuration validation
- Complex parameter scenarios
- Lifecycle management
- Data type handling
- PostgreSQL-specific features

## Mocking Strategy

The tests mock the `pg` library to simulate database interactions without requiring a real database. This provides:
- Fast test execution
- Reliable test results
- Easy error scenario simulation
- No external dependencies for testing
