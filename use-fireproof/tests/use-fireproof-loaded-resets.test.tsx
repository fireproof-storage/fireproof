import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireproof, useFireproof } from "../index.js";
import type { Database } from "../index.js";

const TEST_TIMEOUT = 45000;

describe("HOOK: loaded flag resets on dependency changes", () => {
  const dbName = "loadedResetTest";
  let db: Database;

  beforeEach(async () => {
    db = fireproof(dbName);
    // Create test documents
    await db.put({ _id: "doc1", type: "todo", text: "Task 1" });
    await db.put({ _id: "doc2", type: "todo", text: "Task 2" });
    await db.put({ _id: "doc3", type: "note", text: "Note 1" });
  });

  afterEach(async () => {
    await db.close();
    await db.destroy();
  });

  it(
    "useDocument should reset loaded to false when _id changes",
    async () => {
      const { result, rerender } = renderHook(
        ({ docId }) => {
          const { useDocument } = useFireproof(dbName);
          return useDocument<{ type: string; text: string }>({ _id: docId } as { _id: string; type: string; text: string });
        },
        {
          initialProps: { docId: "doc1" },
        },
      );

      // Wait for initial document to load
      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
        expect(result.current.doc._id).toBe("doc1");
        expect(result.current.doc.text).toBe("Task 1");
      });

      // Change to a different document ID
      rerender({ docId: "doc2" });

      // loaded should reset to false while fetching new document
      expect(result.current.loaded).toBe(false);

      // Wait for new document to load
      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
        expect(result.current.doc._id).toBe("doc2");
        expect(result.current.doc.text).toBe("Task 2");
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "useLiveQuery should reset loaded to false when query changes",
    async () => {
      const { result, rerender } = renderHook(
        ({ queryKey }) => {
          const { useLiveQuery } = useFireproof(dbName);
          return useLiveQuery<{ type: string; text: string }>("type", { key: queryKey });
        },
        {
          initialProps: { queryKey: "todo" },
        },
      );

      // Wait for initial query to load
      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
        expect(result.current.rows.length).toBe(2);
      });

      // Change query key
      rerender({ queryKey: "note" });

      // loaded should reset to false while fetching new query
      expect(result.current.loaded).toBe(false);

      // Wait for new query to load
      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
        expect(result.current.rows.length).toBe(1);
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "useLiveQuery should reset loaded to false when mapFn changes",
    async () => {
      const { result, rerender } = renderHook(
        ({ field }) => {
          const { useLiveQuery } = useFireproof(dbName);
          return useLiveQuery<{ type: string; text: string }>(field);
        },
        {
          initialProps: { field: "type" },
        },
      );

      // Wait for initial query to load
      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
        expect(result.current.rows.length).toBeGreaterThan(0);
      });

      // Change map function
      rerender({ field: "text" });

      // loaded should reset to false while fetching new query
      expect(result.current.loaded).toBe(false);

      // Wait for new query to load
      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "useAllDocs should reset loaded to false when query changes",
    async () => {
      const { result, rerender } = renderHook(
        ({ descending }) => {
          const { useAllDocs } = useFireproof(dbName);
          return useAllDocs<{ type: string; text: string }>(descending ? { descending } : {});
        },
        {
          initialProps: { descending: false },
        },
      );

      // Wait for initial query to load
      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
        expect(result.current.docs.length).toBe(3);
      });

      // Change query parameters
      rerender({ descending: true });

      // loaded should reset to false while fetching new query
      expect(result.current.loaded).toBe(false);

      // Wait for new query to load
      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
        expect(result.current.docs.length).toBe(3);
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "useChanges should reset loaded to false when opts change",
    async () => {
      const { result, rerender } = renderHook(
        ({ limit }) => {
          const { useChanges } = useFireproof(dbName);
          return useChanges<{ type: string; text: string }>([], { limit });
        },
        {
          initialProps: { limit: undefined as number | undefined },
        },
      );

      // Wait for initial changes to load
      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
        expect(result.current.docs.length).toBe(3);
      });

      // Change options
      rerender({ limit: 1 });

      // loaded should reset to false while fetching new changes
      expect(result.current.loaded).toBe(false);

      // Wait for new changes to load
      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
        expect(result.current.docs.length).toBe(1);
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "useDocument should reset loaded when switching from doc with _id to one without",
    async () => {
      const { result, rerender } = renderHook(
        ({ docId }) => {
          const { useDocument } = useFireproof(dbName);
          return useDocument<{ type: string; text: string }>(
            docId ? ({ _id: docId } as { _id: string; type: string; text: string }) : { type: "new", text: "" },
          );
        },
        {
          initialProps: { docId: "doc1" as string | undefined },
        },
      );

      // Wait for document with ID to load
      await waitFor(() => {
        expect(result.current.loaded).toBe(true);
        expect(result.current.doc._id).toBe("doc1");
      });

      // Switch to new document without ID
      rerender({ docId: undefined });

      // When switching to a new doc without _id, there's no async fetch so loaded may stay true or briefly be false
      // The important part is that the document changes correctly
      await waitFor(() => {
        expect(result.current.doc._id).toBeUndefined();
        expect(result.current.doc.type).toBe("new");
        expect(result.current.loaded).toBe(true); // Should be loaded since no fetch is needed
      });
    },
    TEST_TIMEOUT,
  );
});
