import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { fireproof, useFireproof } from "use-fireproof";
import type { Database } from "use-fireproof";

// Test timeout value for CI
const TEST_TIMEOUT = 45000;

describe("HOOK: useFireproof database switching", () => {
  const db1Name = "db1";
  const db2Name = "db2";
  let db1: Database, db2: Database;

  beforeEach(async () => {
    // Setup two databases with different data
    db1 = fireproof(db1Name);
    db2 = fireproof(db2Name);

    // Add data to db1
    await db1.put({ foo: "db1-data" });

    // Add different data to db2
    await db2.put({ foo: "db2-data" });
  });

  it(
    "verifies database 1 data loads correctly",
    async () => {
      // Test that db1 loads properly on its own
      let queryResult: any;

      renderHook(() => {
        const fp = useFireproof(db1Name);
        queryResult = fp.useLiveQuery("foo");
      });

      await waitFor(() => {
        expect(queryResult.rows.map((row: any) => row.doc?.foo)).toEqual(["db1-data"]);
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "verifies database 2 data loads correctly",
    async () => {
      // Test that db2 loads properly on its own
      let queryResult: any;

      renderHook(() => {
        const fp = useFireproof(db2Name);
        queryResult = fp.useLiveQuery("foo");
      });

      await waitFor(() => {
        expect(queryResult.rows.map((row: any) => row.doc?.foo)).toEqual(["db2-data"]);
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "updates query results when adding data to database 2",
    async () => {
      // Test that changes to db2 are reflected
      let queryResult: any;
      let database: Database;

      renderHook(() => {
        const fp = useFireproof(db2Name);
        database = fp.database;
        queryResult = fp.useLiveQuery("foo");
      });

      // Wait for initial data
      await waitFor(() => {
        expect(queryResult.rows.map((row: any) => row.doc?.foo)).toEqual(["db2-data"]);
      });

      // Add new data
      await db2.put({ foo: "db2-updated" });

      // Verify update is reflected
      await waitFor(() => {
        expect(queryResult.rows.map((row: any) => row.doc?.foo)).toContain("db2-updated");
      });
    },
    TEST_TIMEOUT,
  );

  afterEach(async () => {
    await db1.close();
    await db1.destroy();
    await db2.close();
    await db2.destroy();
  });
});
