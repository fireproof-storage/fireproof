# React Hooks Implementation: Minimal Fix Strategy

This document outlines a minimal approach to fix the current React Hooks implementation in Fireproof while maintaining the existing public API.

## Current Issues

The React Hooks implementation in Fireproof is violating the Rules of Hooks, specifically:

1. Hooks are not being called at the top level of React functions
2. Hook calls occur in nested functions or inside other hooks
3. Hook identity may change between renders

## Minimal Fix Strategy

Our approach will focus on:

1. Implementing a function-factory pattern that preserves the public API
2. Fixing the existing implementation without adding new test cases
3. Ensuring existing tests pass without React Hooks violations

## Implementation Plan

### 1. Core Hook Factory Pattern

The key architectural change is to implement the function-factory pattern:

```typescript
// Module-level hook implementation - NOT inside another hook
function useFireproofDocument<T>(database: Database, initialDoc: T) {
  // Hook implementation with useState, useEffect, useCallback, etc.
  // ...
  return { ... }; // Return doc, methods, etc.
}

// Factory function that creates hooks - NOT a hook itself
function createFireproofHooks(database: Database) {
  return {
    useDocument: <T>(initialDoc: T) => useFireproofDocument<T>(database, initialDoc),
    useLiveQuery: (mapFn, query, initialRows) => useFireproofQuery(database, mapFn, query, initialRows),
    // Other hooks...
  };
}

// Main public API hook
export function useFireproof(name = "default", config = {}) {
  // Get or create database
  const database = useFireproofDatabase(name, config);
  
  // Create hook functions bound to this database
  const hooks = useMemo(() => createFireproofHooks(database), [database]);
  
  // Return the same API shape as before
  return { database, ...hooks };
}
```

### 2. Implementation Details

1. **Hook Definitions**: All actual hook implementations will be defined at the module level
2. **Stable Dependencies**: Use proper dependency arrays for all hooks
3. **Hook Factory**: The `createFireproofHooks` function will return hook functions bound to a specific database
4. **Memoization**: Use `useMemo` to ensure stable hook identity across renders

### 3. Test Strategy

1. Fix tests to use the updated implementation correctly
2. Don't create new test cases, but ensure existing tests pass
3. Make minimal changes to the test files as needed to avoid invalid hook calls

## Verification

1. Run existing tests to verify they pass without React Hooks violations
2. Ensure the public API behaves identically to the previous implementation
3. No new test cases needed - focus only on fixing existing code

## Benefits

This approach:
1. Preserves the existing public API that users rely on
2. Complies with React's Rules of Hooks
3. Makes minimal changes to the codebase
4. Doesn't require extensive new test coverage
