# Live Query Fix Progress Notes

## Changes So Far

### 1. Changes to `src/react/use-live-query.ts`:

- Added a new internal shadow type `ArrayLikeQueryResult<T, K, R>` to improve type safety and array-like behavior
- Refactored result creation using `Object.assign()` to ensure proper array-like behavior where the result object is both an array and has additional properties
- Fixed issue with unsubscribing from database events:
  - Added proper cleanup function in useEffect that calls unsubscribe
  - Updated dependency array to include database to ensure correct subscription behavior
- Fixed issues in the refreshRows callback:
  - Added database to dependency array
  - Improved consistency in how docs are extracted from row results
  - Standardized the pattern for setting result state

### 2. Added New Test File `tests/react/use-fireproof-db-switch.test.tsx`:

- Created comprehensive test for database switching behavior
- Tests verify that:
  - Query results update correctly when switching between databases
  - Database references are updated properly
  - Subscriptions work correctly after database changes
  - New changes to databases are reflected in query results
- Includes proper test lifecycle (beforeEach/afterEach) with cleanup

## Summary

The fix addresses issues with live queries when switching databases and ensures proper subscription cleanup. The main focus appears to be on improving how the query result is structured as an array-like object and ensuring the query stays in sync with database changes when switching between different databases.

The test file provides verification for these fixes by specifically testing database switching scenarios.
