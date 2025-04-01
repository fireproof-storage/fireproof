import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fireproof, useFireproof } from "use-fireproof";
import type { Database, LiveQueryResult } from "use-fireproof";

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
    "should switch databases and update query results when database name changes",
    async () => {
      let query: LiveQueryResult<{ foo: string }, string>;
      let currentDbName: string;
      let currentDb: Database;

      // Initial render with db1
      const { rerender } = renderHook(
        ({ dbName }) => {
          const result = useFireproof(dbName);
          currentDbName = result.database.name;
          currentDb = result.database;
          query = result.useLiveQuery<{ foo: string }>("foo");
          return result;
        },
        { initialProps: { dbName: db1Name } },
      );

      // Verify initial state with db1
      await waitFor(() => {
        expect(currentDbName).toBe(db1Name);
        expect(currentDb.name).toBe(db1Name);
        expect(query.rows.map((row) => row.doc?.foo)).toEqual(["db1-data"]);
      });

      // Switch to db2
      rerender({ dbName: db2Name });

      // Verify state with db2
      await waitFor(() => {
        expect(currentDbName).toBe(db2Name);
        expect(currentDb.name).toBe(db2Name);
        expect(query.rows.map((row) => row.doc?.foo)).toEqual(["db2-data"]);
      });

      // Switch back to db1
      rerender({ dbName: db1Name });

      // Verify state is back to db1
      await waitFor(() => {
        expect(currentDbName).toBe(db1Name);
        expect(currentDb.name).toBe(db1Name);
        expect(query.rows.map((row) => row.doc?.foo)).toEqual(["db1-data"]);
      });

      // Test that changes to the new database are reflected
      await db2.put({ foo: "db2-updated" });
      rerender({ dbName: db2Name });

      await waitFor(() => {
        expect(currentDbName).toBe(db2Name);
        expect(currentDb.name).toBe(db2Name);
        expect(query.rows.map((row) => row.doc?.foo)).toEqual(["db2-data", "db2-updated"]);
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
