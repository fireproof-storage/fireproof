# React Hooks Implementation Testing Plan

This document outlines a plan to create minimal test cases that identify and demonstrate the React Hooks rule violations in the current implementation.

## Objective

Create isolated, minimal test cases that demonstrate the Rules of Hooks violations occurring in the Fireproof React hooks, specifically focusing on:

1. Identifying exactly where/how the violations occur
2. Creating reproducible test cases for debugging
3. Validating the fixed implementation

## Test Case Design

We'll create two minimal test files:

1. `hook-violation.test.tsx` - A minimal test that deliberately triggers the Rules of Hooks violation
2. `hook-fixed.test.tsx` - The same test structure but using the fixed implementation

### Step 1: Create Minimal Hook Violation Test

Create a new test file at `tests/react/minimal/hook-violation.test.tsx` with:

```tsx
import { renderHook } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { fireproof, useFireproof } from "use-fireproof";
import type { Database, UseDocumentResult } from "use-fireproof";

const TEST_DB = "hook-violation-test-db";

describe("Hook Violation Test", () => {
  let db: Database;
  let docResult: UseDocumentResult<{ input: string }>;
  let useDocument: ReturnType<typeof useFireproof>["useDocument"];

  beforeEach(() => {
    // Setup database
    db = fireproof(TEST_DB);

    // First renderHook call - this is fine
    renderHook(() => {
      const result = useFireproof(TEST_DB);
      useDocument = result.useDocument;
      docResult = useDocument<{ input: string }>({ input: "" });
    });
  });

  it("demonstrates hook violation when using multiple renderHook calls", async () => {
    // First, verify initial state
    expect(docResult.doc.input).toBe("");

    // Second renderHook call in the same test - THIS TRIGGERS THE VIOLATION
    // The issue is that we're rendering a new component instance with hooks
    // while the first one is still active
    renderHook(() => {
      docResult.merge({ input: "new value" });
    });

    // Verify the mutation happened
    expect(docResult.doc.input).toBe("new value");
  });

  it("demonstrates hook violation across consecutive tests", async () => {
    // This second test inherits hook state from the previous test
    // and can trigger violations due to shared state
    expect(docResult.doc.input).toBe("new value");
  });
});
```

This test exhibits the issue because:

1. It makes multiple `renderHook` calls within the same test
2. The hooks returned from `useFireproof` are called in different component instances
3. The React hooks system cannot properly track these calls across component instances

### Step 2: Create Fixed Implementation Test

Create a parallel test at `tests/react/minimal/hook-fixed.test.tsx` that uses the fixed implementation from `fixed-hooks.ts` to demonstrate the proper pattern.

### Step 3: Run Tests and Observe Errors

Run the tests with:

```
pnpm run test:indexeddb tests/react/minimal/hook-violation.test.tsx
```

And observe the Rules of Hooks violations in the console output. The key error will be:

```
Warning: Do not call Hooks inside useEffect(...), useMemo(...), or other built-in Hooks.
```

### Step 4: Analyze Root Cause

The main issues likely causing the violations:

1. **Multiple renders**: Using `renderHook` multiple times creates separate React component instances, but we're using hooks across these instances.

2. **Hook definition location**: If hooks aren't defined at the module level and are instead created inside other hooks or memoized functions, they can violate the Rules of Hooks.

3. **State sharing across tests**: The way state is shared between tests can cause hooks to be called in an inconsistent order.

## Implementation Plan

1. Implement the minimal test cases above
2. Run the tests to observe and document the errors
3. Compare with the fix-pattern recommended in `notes/react-hooks-fix.md`
4. Update the main implementation to fully adhere to the function-factory pattern

## Success Criteria

A successful implementation will:

1. Show clear violations in the minimal test case
2. Pass all tests when using the fixed implementation
3. Preserve the exact same public API
4. Follow React's Rules of Hooks
