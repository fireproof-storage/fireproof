import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { fireproof } from "use-fireproof";
import type { Database } from "use-fireproof";
import { useState, useMemo } from "react";

const TEST_DB = "minimal-fixed-test";
const TEST_TIMEOUT = 10000;

// This is the minimal version of the function-factory pattern
// described in the notes/react-hooks-fix.md file
function useDocumentState(database: Database, initialDoc: any = {}) {
  // Basic state
  const [doc, setDoc] = useState(initialDoc);

  // Function to update the doc
  const merge = (newData: any) => {
    setDoc({ ...doc, ...newData });
  };

  return { doc, merge };
}

// Factory function that returns hooks bound to a database
// This is NOT a hook, so hook rules don't apply
function createHooks(database: Database) {
  // Return a function that USES the hook
  return {
    useDocument: (initialDoc: any = {}) => {
      return useDocumentState(database, initialDoc);
    },
  };
}

// Main hook that follows the function-factory pattern
function useCustomFireproof(name: string) {
  // Create database - this is a real hook call
  const database = useMemo(() => fireproof(name), [name]);

  // Create hooks - this is allowed in useMemo
  const hooks = useMemo(() => createHooks(database), [database]);

  // Return the API with database and hooks
  return {
    database,
    ...hooks,
  };
}

describe("Minimal Fixed Test - Function Factory Pattern", () => {
  let db: Database;

  beforeEach(() => {
    db = fireproof(TEST_DB);
  });

  afterEach(async () => {
    await db.close();
    await db.destroy();
  });

  it("should provide working hooks with the function-factory pattern", () => {
    // This single renderHook contains the full test
    const { result } = renderHook(() => {
      // Get hooks from our custom hook
      const { useDocument } = useCustomFireproof(TEST_DB);

      // Use the document hook with initial data
      const docState = useDocument({ text: "initial" });

      // Return everything for assertions
      return { docState };
    });

    // Check initial state
    expect(result.current.docState.doc.text).toBe("initial");

    // Perform state update with act()
    act(() => {
      result.current.docState.merge({ text: "updated" });
    });

    // Verify state was updated
    expect(result.current.docState.doc.text).toBe("updated");
  });
});
