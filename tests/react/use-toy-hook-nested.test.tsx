import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { useToyHook, ToyDatabase, toyDatabase } from "./hooks/useToyHook";

// Test timeout for CI
const TEST_TIMEOUT = 45000;

describe("HOOK: useToyHook with nested hooks", () => {
  const dbName = "toy-hook-nested-test-db";
  let db: ToyDatabase;

  beforeEach(async () => {
    db = toyDatabase(dbName);
    await db.put({ text: "sample data" });
  });

  it(
    "should work with useToyQuery",
    async () => {
      // Using the nested useToyQuery hook
      const { result, rerender } = renderHook((name = dbName) => {
        const toyHook = useToyHook(name);
        return {
          query: toyHook.useToyQuery("text"),
          db: toyHook.database,
          name: toyHook.name
        };
      });

      // Wait for initial data to load
      await waitFor(() => {
        expect(result.current.query.rows.length).toBeGreaterThan(0);
      }, { timeout: 2000 });
      
      expect(result.current.query.rows[0].doc.text).toBe("sample data");

      // Test hook reordering by changing database name
      // This should trigger the conditional useState in useToyHook
      rerender("new-toy-db-name");
      
      // Add more data and verify it updates
      await act(async () => {
        await result.current.db.put({ text: "more data" });
      });

      await waitFor(() => {
        expect(result.current.query.rows.length).toBeGreaterThan(0);
      }, { timeout: 2000 });
      
      const texts = result.current.query.rows.map((row: any) => row.doc.text);
      expect(texts).toContain("more data");
    },
    TEST_TIMEOUT,
  );

  it(
    "should work with useToyDocument",
    async () => {
      // Using the nested useToyDocument hook
      const { result, rerender } = renderHook((name = dbName) => {
        const toyHook = useToyHook(name);
        // Now we need to pass a function that returns the initial document
        return toyHook.useToyDocument(() => ({ text: "initial" }));
      });

      // Check initial state
      expect(result.current[0].text).toBe("initial");
      expect(result.current[0]._id).toBeUndefined();

      // Update the document
      await act(() => {
        result.current[1]({ text: "updated" });
      });

      expect(result.current[0].text).toBe("updated");

      // Save the document
      let docId = "";
      await act(async () => {
        const response = await result.current[2]();
        docId = response.id;
      });

      expect(docId).toBeDefined();
      expect(result.current[0]._id).toBe(docId);
      
      // Test hook reordering by changing database name
      rerender("another-toy-db-name");
    },
    TEST_TIMEOUT,
  );
  
  it(
    "should trigger hook violations with dynamic name changes",
    async () => {
      // This test is specifically designed to trigger hook rule violations
      const { result, rerender } = renderHook((dbNameInput = dbName) => {
        // Create a hook with initial name
        const hook1 = useToyHook(dbNameInput);
        
        // Create another hook with a different name in the same render
        // This should cause hooks to be called in a different order on re-renders
        const hook2 = useToyHook(dbNameInput + "-secondary");
        
        return {
          // Use both hooks' nested hooks
          query1: hook1.useToyQuery("text"),
          doc1: hook1.useToyDocument(() => ({ text: "from hook1" })),
          query2: hook2.useToyQuery("text"),
          doc2: hook2.useToyDocument(() => ({ text: "from hook2" })),
          db1: hook1.database,
          db2: hook2.database
        };
      });
      
      // Initial check
      expect(result.current.db1.name).toBe(dbName);
      expect(result.current.db2.name).toBe(dbName + "-secondary");
      
      // Changing the name should cause hook rule violations due to conditional execution
      rerender("changing-hook-order");
      
      // Add data to both databases
      await act(async () => {
        await result.current.db1.put({ text: "test data 1" });
        await result.current.db2.put({ text: "test data 2" });
      });
      
      // This test might cause console errors but should still function
      expect(result.current.db1.name).toBe("changing-hook-order");
      expect(result.current.db2.name).toBe("changing-hook-order-secondary");
    },
    TEST_TIMEOUT,
  );

  afterEach(async () => {
    await db.destroy();
  });
});
