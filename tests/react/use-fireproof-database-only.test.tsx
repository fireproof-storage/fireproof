import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { fireproof, useFireproof } from "use-fireproof";
import type { Database } from "use-fireproof";

// Test timeout value for CI
const TEST_TIMEOUT = 45000;

describe("HOOK: useFireproof database only", () => {
  const dbName = "database-only-test-db";
  let db: Database;

  beforeEach(async () => {
    db = fireproof(dbName);
    await db.put({ text: "initial data" });
  });

  it(
    "should provide a working database instance",
    async () => {
      // Only use the database, not any of the custom hooks
      const { result } = renderHook(() => {
        return useFireproof(dbName).database;
      });

      // Check basic database functionality
      expect(result.current).toBeDefined();
      expect(result.current.name).toBe(dbName);
      
      // Test that we can put and get data
      let docId: string;
      
      // Use act to wrap state updates
      await act(async () => {
        const response = await result.current.put({ text: "more data" });
        docId = response.id;
      });
      
      expect(docId).toBeDefined();
      
      // Get the document back
      await act(async () => {
        const doc = await result.current.get(docId);
        expect(doc).toBeDefined();
        expect(doc.text).toBe("more data");
      });
      
      // Get all documents
      await act(async () => {
        const allDocs = await result.current.allDocs();
        expect(allDocs.rows.length).toBeGreaterThan(0);
      });
    },
    TEST_TIMEOUT,
  );

  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
});
