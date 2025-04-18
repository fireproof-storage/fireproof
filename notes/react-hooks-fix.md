# Fireproof React Hooks Implementation Fix

This document outlines a practical approach to fix the React Hooks rule violations in Fireproof while maintaining the exact same public API that users currently rely on.

## Current API (To Preserve)

```js
function MyComponent() {
  // Get hooks for a specific database
  const { useDocument, useLiveQuery, database } = useFireproof("my-ledger");

  // Use the hooks
  const { doc, merge, submit } = useDocument({ text: "" });
  const { docs } = useLiveQuery("_id", { limit: 10, descending: true });

  // Rest of component...
}
```

## Issue Summary

The current Fireproof implementation likely defines hooks inside other hooks, which violates React's Rules of Hooks. This leads to warnings and errors in testing and can cause unpredictable behavior in production. We need to refactor the implementation while keeping the same API surface.

## Solution: Function Factory Pattern with Proper Hook Memoization

This pattern separates the hook definition (which must be at module level) from the hook API (which preserves backward compatibility).

```typescript
// src/react/hooks.ts

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { fireproof } from "../fireproof";
import type { Database, DocTypes, Doc, LiveQueryResult, IndexRow, MapFn } from "../types";
import type { ConfigOpts } from "../ledger";

// Module-level hook functions
function useFireproofDatabase(name: string, config: ConfigOpts = {}) {
  return useMemo(() => {
    return typeof name === "string" ? fireproof(name, config) : name;
  }, [name, config]);
}

// Document hook implementation
function useFireproofDocument<T extends DocTypes>(database: Database, initialDoc: Partial<T>) {
  const [doc, setDoc] = useState<T & { _id?: string }>({ ...initialDoc } as T);

  // Update function
  const merge = useCallback((newData: Partial<T>) => {
    setDoc((currentDoc) => ({ ...currentDoc, ...newData }));
  }, []);

  // Save function
  const submit = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const result = await database.put(doc);
      setDoc((currentDoc) => ({ ...currentDoc, _id: result.id }));
      return result;
    },
    [doc, database],
  );

  return { doc, merge, submit };
}

// Live query hook implementation
function useFireproofQuery<T extends DocTypes>(
  database: Database,
  mapFn: MapFn | string,
  query = {},
  initialRows: IndexRow<T>[] = [],
): LiveQueryResult<T> {
  const [result, setResult] = useState({
    rows: initialRows,
    docs: initialRows.map((r) => r.doc as Doc<T>),
  });

  // Implementation of live query with useEffect
  useEffect(() => {
    // Query subscription logic
    const unsubscribe = database.liveQuery(mapFn, query, (newResult) => {
      setResult(newResult);
    });

    return () => {
      unsubscribe();
    };
  }, [database, mapFn, JSON.stringify(query)]);

  return result;
}

// This is NOT a hook - it's a factory function that returns hook functions
// Not governed by React's hook rules since it's just a regular function
function createFireproofHooks(database: Database, name: string) {
  return {
    // These are bound hook functions - they close over the database but
    // call the real hook implementations at the module level
    useDocument: <T extends DocTypes>(initialDoc: Partial<T>) => {
      return useFireproofDocument<T>(database, initialDoc);
    },

    useLiveQuery: <T extends DocTypes>(mapFn: MapFn | string, query = {}, initialRows: IndexRow<T>[] = []) => {
      return useFireproofQuery<T>(database, mapFn, query, initialRows);
    },

    // Add any other hooks here...
  };
}

// Primary public API hook
export function useFireproof(name: string | Database = "useFireproof", config: ConfigOpts = {}) {
  // Get the database instance
  const database = useFireproofDatabase(name, config);

  // Create and memoize the hooks object to maintain stable identity across renders
  const hooksObject = useMemo(() => {
    return {
      database,
      ...createFireproofHooks(database, typeof name === "string" ? name : name.name),
    };
  }, [database, name]);

  // Return the same structure as the current API
  return hooksObject;
}

// Also export the underlying hooks for advanced use cases
export { useFireproofDatabase, useFireproofDocument, useFireproofQuery };
```

## Implementation Notes

1. **Core approach**: Define all actual hook implementations at the module level, following React's rules
2. **API compatibility**: Use a factory function and proper memoization to preserve the exact same API
3. **Performance**: Memoize appropriately to avoid unnecessary rerenders
4. **Flexibility**: Still allow passing a database instance or name string to `useFireproof`

## Migration Steps

1. Start by extracting the current hook implementations into separate module-level functions
2. Implement the factory function pattern as shown above
3. Update the main `useFireproof` hook to use the new pattern
4. Run tests to verify the implementation works and resolves the hook violations
5. Update documentation to explain the under-the-hood changes

## Testing Recommendations

When testing, use both patterns:

1. Test the underlying hooks directly for unit tests
2. Test the public API for integration tests

```js
// Unit test for a specific hook
test("useFireproofQuery should return live results", () => {
  const db = fireproof("test-db");
  const { result } = renderHook(() => useFireproofQuery(db, "_id", { limit: 5 }));
  // Test assertions...
});

// Integration test for the public API
test("useFireproof should provide working hooks", () => {
  const { result } = renderHook(() => {
    const { useDocument, useLiveQuery } = useFireproof("test-db");
    return {
      document: useDocument({ text: "test" }),
      query: useLiveQuery("_id"),
    };
  });
  // Test assertions...
});
```

## Benefits of This Approach

1. **Zero API changes**: Existing code continues to work without modification
2. **Fixed Rules of Hooks violations**: All actual hook implementations are at module level
3. **Better testability**: Each hook can be tested independently
4. **Improved performance**: Proper memoization avoids unnecessary rerenders
5. **Type safety**: Maintains strong TypeScript typing

## Alternatives Considered

1. **Context-based approach**: Would require API changes and wrapping components in providers
2. **Complete refactor**: Would break backward compatibility
3. **Hook composition**: Would change the API surface

The function factory pattern provides the best balance of fixing the underlying issues while maintaining backward compatibility.
