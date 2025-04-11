import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { fireproof, useFireproof } from "use-fireproof";
import type { Database } from "use-fireproof";
import type { AllDocsResult } from "../../src/react/types.js";
import type { DocWithId } from "@fireproof/core";

// Test timeout value for CI
const TEST_TIMEOUT = 45000;

describe("HOOK: useFireproof useAllDocs", () => {
  const dbName = "useAllDocsTest";
  let db: Database,
    database: ReturnType<typeof useFireproof>["database"],
    useAllDocs: ReturnType<typeof useFireproof>["useAllDocs"];

  beforeEach(async () => {
    const expectedValues = ["apple", "banana", "cherry"];
    db = fireproof(dbName);
    for (const value of expectedValues) {
      await db.put({ fruit: value });
    }

    const allDocs = await db.allDocs<{ fruit: string }>();
    expect(allDocs.rows.map((row) => row.value.fruit)).toEqual(expectedValues);
  });

  it(
    "fetches documents correctly",
    async () => {
      let result: AllDocsResult<{ fruit: string }>;

      renderHook(() => {
        const hookResult = useFireproof(dbName);
        database = hookResult.database;
        useAllDocs = hookResult.useAllDocs;
        result = useAllDocs<{ fruit: string }>();
      });

      await waitFor(() => {
        expect(result.docs.length).toBe(3);
        expect(result.docs.map((doc) => doc.fruit)).toEqual(["apple", "banana", "cherry"]);
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "supports array-like behavior",
    async () => {
      let allDocsResult: AllDocsResult<{ fruit: string }>;
      let destructuredDocs: DocWithId<{ fruit: string }>[];

      renderHook(() => {
        const hookResult = useFireproof(dbName);
        database = hookResult.database;
        useAllDocs = hookResult.useAllDocs;
        allDocsResult = useAllDocs<{ fruit: string }>();

        // Test destructuring the docs property
        const { docs } = allDocsResult;
        destructuredDocs = docs;
      });

      await waitFor(() => {
        // Verify destructured docs
        expect(destructuredDocs.length).toBe(3);
        expect(destructuredDocs.map((doc) => doc.fruit)).toEqual(["apple", "banana", "cherry"]);

        // Verify array-like behavior - need to use type assertions since our interface doesn't include these methods
        const arrayLike = allDocsResult as unknown as {
          length: number;
          [Symbol.iterator](): Iterator<DocWithId<{ fruit: string }>>;
          map<U>(fn: (doc: DocWithId<{ fruit: string }>) => U): U[];
          filter(fn: (doc: DocWithId<{ fruit: string }>) => boolean): DocWithId<{ fruit: string }>[];
          forEach(fn: (doc: DocWithId<{ fruit: string }>) => void): void;
        };

        // Test length property
        expect(arrayLike.length).toBe(3);

        // Test iteration
        const values: string[] = [];
        for (const doc of arrayLike) {
          values.push(doc.fruit);
        }
        expect(values).toEqual(["apple", "banana", "cherry"]);

        // Test map method
        const mappedValues = arrayLike.map((doc) => doc.fruit.toUpperCase());
        expect(mappedValues).toEqual(["APPLE", "BANANA", "CHERRY"]);

        // Test filter method
        const filteredDocs = arrayLike.filter((doc) => doc.fruit.startsWith("b"));
        expect(filteredDocs.length).toBe(1);
        expect(filteredDocs[0].fruit).toBe("banana");

        // Test forEach method
        const forEachValues: string[] = [];
        arrayLike.forEach((doc) => {
          forEachValues.push(doc.fruit);
        });
        expect(forEachValues).toEqual(["apple", "banana", "cherry"]);
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "updates when database changes",
    async () => {
      let allDocsResult: AllDocsResult<{ fruit: string }>;

      renderHook(() => {
        const hookResult = useFireproof(dbName);
        database = hookResult.database;
        useAllDocs = hookResult.useAllDocs;
        allDocsResult = useAllDocs<{ fruit: string }>();
      });

      // Wait for initial data to load
      await waitFor(() => {
        expect(allDocsResult.docs.length).toBe(3);
      });

      // Add a new document
      await database.put({ fruit: "dragonfruit" });

      // Verify the hook updates with the new document
      await waitFor(() => {
        expect(allDocsResult.docs.length).toBe(4);
        expect(allDocsResult.docs.map((doc) => doc.fruit)).toContain("dragonfruit");
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "properly handles subscription lifecycle",
    async () => {
      // This test verifies that the subscription works properly
      // We'll just check that the component renders and updates

      // Render the hook in a way we can unmount it
      const { unmount, result } = renderHook(() => {
        const hookResult = useFireproof(dbName);
        database = hookResult.database;
        useAllDocs = hookResult.useAllDocs;
        return useAllDocs<{ fruit: string }>();
      });

      // Wait for the hook to initialize with data
      await waitFor(() => {
        expect(result.current.docs.length).toBe(3);
      });

      // Add a document to test subscription works
      await database?.put({ fruit: "date" });

      // Verify the hook updates with the new document
      await waitFor(() => {
        expect(result.current.docs.length).toBe(4);
      });

      // Unmount the component to trigger cleanup
      unmount();

      // Test passes if no errors occur during unmount
    },
    TEST_TIMEOUT,
  );

  it(
    "accepts query parameters",
    async () => {
      // This test verifies that the hook accepts query parameters
      let allDocsResult: AllDocsResult<{ fruit: string }>;

      renderHook(() => {
        const hookResult = useFireproof(dbName);
        database = hookResult.database;
        useAllDocs = hookResult.useAllDocs;
        // Pass query parameters to the hook
        allDocsResult = useAllDocs<{ fruit: string }>({ descending: true });
      });

      // Wait for the hook to initialize
      await waitFor(() => {
        // Verify that the hook returns data regardless of parameters
        expect(allDocsResult.docs.length).toBe(3);
        // The current implementation doesn't filter client-side
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "refreshes when query parameters change",
    async () => {
      // This test verifies that the useAllDocs hook refreshes when query parameters change
      let allDocsResult: AllDocsResult<{ fruit: string }>;
      let queryParams = {};

      const { rerender } = renderHook(() => {
        const hookResult = useFireproof(dbName);
        database = hookResult.database;
        useAllDocs = hookResult.useAllDocs;
        allDocsResult = useAllDocs<{ fruit: string }>(queryParams);
      });

      // Verify initial state with no query parameters
      await waitFor(() => {
        expect(allDocsResult.docs.length).toBe(3);
      });

      // Change the query parameters
      queryParams = { descending: true };
      rerender();

      // Verify the hook still works after query parameters change
      // The implementation should handle the parameter change correctly
      await waitFor(() => {
        expect(allDocsResult.docs.length).toBe(3);
      });
    },
    TEST_TIMEOUT,
  );

  afterEach(async () => {
    await db.close();
    await db.destroy();
    await database?.close();
    await database?.destroy();
  });
});
