# React Hooks Rules Violations in Fireproof

## Summary of Issue

While testing the Fireproof React hooks implementation, we encountered persistent React Hooks rule violations that cause tests to fail and would lead to unpredictable behavior in production applications. This document outlines our findings, the root causes, and proposed solutions.

## Background

React's Hooks system operates under [strict rules](https://reactjs.org/docs/hooks-rules.html):

1. **Only call Hooks at the top level** - Don't call hooks inside loops, conditions, or nested functions
2. **Only call Hooks from React function components** - Don't call hooks from regular JavaScript functions
3. **Hooks must be called in the same order on every render** - This is how React preserves hook state correctly

Fireproof's current implementation appears to violate these rules in several ways, leading to errors like:

```
Warning: Do not call Hooks inside useEffect(...), useMemo(...), or other built-in Hooks.
Warning: React has detected a change in the order of Hooks called by %s. This will lead to bugs and errors if not fixed.
Error: Should have a queue. This is likely a bug in React. Please file an issue.
```

## Reproduction with Toy Implementation

We created a simplified "toy" implementation that reproduces the same pattern and errors, focusing on three critical issues:

1. **Nested hook definitions** - Defining hooks inside other hooks (e.g., useToyQuery inside useToyHook)
2. **Conditional hook calls** - Calling hooks conditionally based on props or state
3. **Dynamic hook dependencies** - Using dependencies that change the call order of hooks

### Problematic Code Patterns

```typescript
// Pattern 1: Conditional hook calls
const database = useMemo(() => {
  if (didNameChange) {
    // This useState is conditional, which violates Rules of Hooks
    const [count] = useState(0);
  }
  return toyDatabase(name);
}, [name, didNameChange]);

// Pattern 2: Defining hooks inside other hooks
const useToyQuery = useMemo(() => {
  // This returns a hook from inside useMemo - violation
  return function useToyQueryInner<T>(fieldName: string) {
    // Hook implementation
  };
}, [database]);

// Pattern 3: Hooks with changing dependency orders
useEffect(() => {
  // Hooks depending on dynamic values can cause order changes
}, [dynamicDep1, dynamicDep2]);
```

## Root Causes in Fireproof

Based on our investigation, Fireproof's hook implementation likely:

1. **Returns hooks from hooks** - The `useFireproof` hook returns other hooks like `useLiveQuery` and `useDocument`
2. **Defines hooks inside hook closures** - Hook functions are defined inside the main hook rather than at the module level
3. **Uses conditional logic that affects hook execution** - Database switching or state changes may conditionally execute hooks
4. **Has complex dependency chains** - Database name changes propagate through multiple hooks

## Specific Files and Components to Change

The primary files that need modification are:

1. **`src/react/hooks.ts`** or equivalent - The main hooks implementation file
2. **`src/react/useFireproof.ts`** - The main entry point hook that creates nested hooks
3. **`src/react/useDocument.ts`** and **`src/react/useLiveQuery.ts`** - Nested hook implementations

## Suggested Solution: Hooks Refactoring

### 1. Separate Hook Definitions

```typescript
// ❌ CURRENT PATTERN (problematic)
function useFireproof(name) {
  // Implementation...
  
  function useLiveQuery(mapFn, query, initialRows) {
    // Implementation using closure variables from useFireproof
  }
  
  return { database, useLiveQuery };
}

// ✅ BETTER PATTERN
// Base hook that provides context
function useFireproof(name) {
  // Implementation...
  return { database, databaseRef };
}

// Separate standalone hook that takes dependencies as parameters
function useLiveQuery(database, mapFn, query, initialRows) {
  // Implementation using passed parameters instead of closure
}
```

### 2. Use Context or Custom Provider

For more complex state sharing:

```typescript
// Create a context
const FireproofContext = createContext(null);

// Provider component
function FireproofProvider({ name, children }) {
  const db = useMemo(() => fireproof(name), [name]);
  
  return (
    <FireproofContext.Provider value={db}>
      {children}
    </FireproofContext.Provider>
  );
}

// Individual hooks use the context
function useFireproofDatabase() {
  return useContext(FireproofContext);
}

function useLiveQuery(mapFn, query, initialRows) {
  const db = useContext(FireproofContext);
  // Implementation with db
}
```

### 3. Parameter-Based Hook Composition

```typescript
// Base hook
function useFireproofDatabase(name) {
  return useMemo(() => fireproof(name), [name]);
}

// Composable hooks
function useLiveQuery(mapFn, query, initialRows, database) {
  const db = database || useFireproofDatabase();
  // Implementation
}

function useDocument(initialDoc, database) {
  const db = database || useFireproofDatabase();
  // Implementation
}
```

## Implementation Checklist

1. [ ] Identify all hook definitions inside `useFireproof`
2. [ ] Move each nested hook to the module level
3. [ ] Add proper parameters to pass dependencies instead of using closures
4. [ ] Update tests to use the new pattern
5. [ ] Ensure backward compatibility or provide migration guide
6. [ ] Document the new pattern for API users

## Testing Strategy

1. Start with minimal tests that verify each hook independently
2. Progress to testing hook combinations
3. Test edge cases like database switching
4. Verify no React Hooks rule violations occur

## Notes on Backward Compatibility

If maintaining the current API shape is important, consider a compatibility layer:

```typescript
// Compatibility wrapper (deprecated)
function useFireproofLegacy(name) {
  const db = useFireproofDatabase(name);
  
  // This is just a function returning hooks, not actual hook definitions
  return {
    database: db,
    useLiveQuery: (mapFn, query, initialRows) => 
      useLiveQuery(mapFn, query, initialRows, db),
    useDocument: (initialDoc) => 
      useDocument(initialDoc, db)
  };
}
```

## Conclusion

The current hook implementation in Fireproof violates React's Rules of Hooks, leading to errors and unstable behavior. By refactoring the hooks to follow React's guidelines, we can maintain the same functionality while ensuring correct and predictable behavior.

This change will require significant refactoring of the hook implementation but will result in a more robust and maintainable API that follows React best practices.
