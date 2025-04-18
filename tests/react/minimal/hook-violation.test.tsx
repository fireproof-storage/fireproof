import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { fireproof, useFireproof } from "use-fireproof";
import type { Database, UseDocumentResult } from "use-fireproof";

const TEST_DB = "hook-violation-test-db";
const TEST_TIMEOUT = 10000;

describe("Hook Violation Test", () => {
  let db: Database;
  let docResult: UseDocumentResult<{ input: string }>;
  let useDocument: ReturnType<typeof useFireproof>["useDocument"];
  let database: ReturnType<typeof useFireproof>["database"];

  beforeEach(() => {
    // Setup database
    db = fireproof(TEST_DB);

    // First renderHook call - this is fine
    renderHook(() => {
      const result = useFireproof(TEST_DB);
      database = result.database;
      useDocument = result.useDocument;
      docResult = useDocument<{ input: string }>({ input: "" });
    });
  });

  afterEach(async () => {
    await db.close();
    await db.destroy();
    await database?.close();
    await database?.destroy();
  });

  it(
    "demonstrates hook violation when using multiple renderHook calls",
    async () => {
      // First, verify initial state
      await waitFor(() => {
        expect(docResult.doc.input).toBe("");
      });

      // Second renderHook call in the same test - THIS TRIGGERS THE VIOLATION
      // The issue is that we're rendering a new component instance with hooks
      // while the first one is still active
      renderHook(() => {
        docResult.merge({ input: "new value" });
      });

      // Verify the mutation happened
      await waitFor(() => {
        expect(docResult.doc.input).toBe("new value");
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "demonstrates hook violation across consecutive tests",
    async () => {
      // This second test inherits hook state from the previous test
      // and can trigger violations due to shared state
      await waitFor(() => {
        // In an ideal world, this would be an empty string again
        // since we've reset in beforeEach, but due to hook violations
        // and shared state, the value persists
        expect(docResult.doc.input).not.toBe("");
      });
    },
    TEST_TIMEOUT,
  );
});
