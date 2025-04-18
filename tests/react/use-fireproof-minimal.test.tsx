import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { fireproof, useFireproof } from "use-fireproof";
import type { Database } from "use-fireproof";

// Test timeout value for CI
const TEST_TIMEOUT = 45000;

describe("HOOK: useFireproof minimal test", () => {
  const dbName = "minimal-test-db";
  let db: Database;

  beforeEach(async () => {
    // Setup database with a sample document
    db = fireproof(dbName);
    await db.put({ text: "sample data" });
  });

  it(
    "should render the hook correctly",
    () => {
      renderHook(() => {
        const { database, useLiveQuery, useDocument } = useFireproof(dbName);
        expect(typeof useLiveQuery).toBe("function");
        expect(typeof useDocument).toBe("function");
        expect(database?.constructor.name).toMatch(/^Database/);
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "should fetch documents correctly with useLiveQuery",
    async () => {
      // We'll keep all variables local to the test
      const { result } = renderHook(() => {
        const fp = useFireproof(dbName);
        return {
          query: fp.useLiveQuery("text"),
        };
      });

      // Verify we get results
      await waitFor(() => {
        expect(result.current.query.rows.length).toBeGreaterThan(0);
        expect(result.current.query.rows[0].doc?.text).toBe("sample data");
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "should update query results when database changes",
    async () => {
      // Setup a simple test hook that returns just what we need
      const { result } = renderHook(() => {
        const fp = useFireproof(dbName);
        return {
          db: fp.database,
          query: fp.useLiveQuery("text"),
        };
      });

      // Verify initial state
      await waitFor(() => {
        expect(result.current.query.rows.length).toBe(1);
        expect(result.current.query.rows[0].doc?.text).toBe("sample data");
      });

      // Add a new document
      await result.current.db.put({ text: "new data" });

      // Verify the hook updates with the new document
      await waitFor(() => {
        expect(result.current.query.rows.length).toBe(2);
        const texts = result.current.query.rows.map((row) => row.doc?.text);
        expect(texts).toContain("sample data");
        expect(texts).toContain("new data");
      });
    },
    TEST_TIMEOUT,
  );

  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
});
