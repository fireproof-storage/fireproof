import { renderHook, waitFor } from "@testing-library/react";
import { describe, afterAll, beforeAll, expect, it } from "vitest";
import { fireproof, useFireproof } from "use-fireproof";
import type { Database, LiveQueryResult } from "use-fireproof";
import fc from "fast-check";

const TEST_TIMEOUT = 10000;

describe("HOOK: useLiveQuery reactivity after concurrent writes", () => {
  let dbName: string;
  let db: Database;

  beforeAll(async () => {
    dbName = `useLiveQueryConcurrent-${Date.now()}-${Math.random()}`;
    db = fireproof(dbName);
  });

  afterAll(async () => {
    await db.close();
    await db.destroy();
  });

  it(
    "should reflect all documents after Promise.all batch put",
    async () => {
      let query: LiveQueryResult<{ type: string; index: number }, string>;
      let database: ReturnType<typeof useFireproof>["database"];

      renderHook(() => {
        const fp = useFireproof(dbName);
        database = fp.database;
        query = fp.useLiveQuery<{ type: string; index: number }>("type", { key: "batch-item" });
      });

      // Wait for initial empty state
      await waitFor(() => {
        expect(query).toBeDefined();
        expect(query.docs.length).toBe(0);
      });

      // Write 12 documents concurrently via Promise.all
      const items = Array.from({ length: 12 }, (_, i) => ({
        type: "batch-item",
        index: i,
      }));
      await Promise.all(items.map((item) => database.put(item)));

      // Verify live query reflects ALL 12 documents
      await waitFor(
        () => {
          expect(query.docs.length).toBe(12);
        },
        { timeout: TEST_TIMEOUT },
      );
    },
    TEST_TIMEOUT,
  );
});

describe("PROPERTY: useLiveQuery concurrent write reactivity", () => {
  it("should eventually reflect all N documents after N concurrent puts", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 50 }), async (n: number) => {
        const dbName = `propTest-${Date.now()}-${Math.random()}`;
        const db = fireproof(dbName);
        try {
          let query: LiveQueryResult<{ type: string; i: number }, string>;
          let database: ReturnType<typeof useFireproof>["database"];

          const { unmount } = renderHook(() => {
            const fp = useFireproof(dbName);
            database = fp.database;
            query = fp.useLiveQuery<{ type: string; i: number }>("type", { key: "prop" });
          });

          // Wait for initial empty
          await waitFor(() => {
            expect(query.docs.length).toBe(0);
          });

          // Concurrent puts
          const items = Array.from({ length: n }, (_, i) => ({ type: "prop", i }));
          await Promise.all(items.map((item) => database.put(item)));

          // Property: live query must reflect all N docs
          await waitFor(
            () => {
              expect(query.docs.length).toBe(n);
            },
            { timeout: 5000 },
          );

          unmount();
        } finally {
          await db.close();
          await db.destroy();
        }
      }),
      { timeout: 120_000, numRuns: 20 },
    );
  }, 180_000);
});
