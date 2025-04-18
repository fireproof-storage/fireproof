import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { fireproof, useFireproof } from "use-fireproof";
import type { Database } from "use-fireproof";

const TEST_DB = "hook-fixed-test-db";
const TEST_TIMEOUT = 10000;

describe("Hook Fixed Test", () => {
  let db: Database;
  // Define a properly typed result variable from renderHook
  let result: {
    current: {
      docResult: {
        doc: { input: string; _id?: string };
        merge: (data: { input: string }) => void;
      };
      database: Database;
    };
  };

  beforeEach(() => {
    // Setup database
    db = fireproof(TEST_DB);

    // Create a renderHook result that includes everything we need
    const hookResult = renderHook(() => {
      const { useDocument, database } = useFireproof(TEST_DB);
      const docResult = useDocument<{ input: string }>({ input: "" });

      return { docResult, database };
    });

    // Store the result for use in tests
    result = hookResult.result;
  });

  afterEach(async () => {
    await db.close();
    await db.destroy();
    const { database } = result.current;
    await database?.close();
    await database?.destroy();
  });

  it(
    "demonstrates proper hook usage with act for state updates",
    async () => {
      // First, verify initial state
      await waitFor(() => {
        const { docResult } = result.current;
        expect(docResult.doc.input).toBe("");
      });

      // Instead of multiple renderHook calls, we use act() to perform mutations
      // This respects React's component lifecycle and Rules of Hooks
      await act(async () => {
        const { docResult } = result.current;
        docResult.merge({ input: "new value" });
      });

      // Verify the mutation happened
      await waitFor(() => {
        const { docResult } = result.current;
        expect(docResult.doc.input).toBe("new value");
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "demonstrates proper hook reset between tests",
    async () => {
      // Since we create a fresh hook in beforeEach, this test starts with a clean state
      await waitFor(() => {
        // This should be an empty string again because we've properly reset
        const { docResult } = result.current;
        expect(docResult.doc.input).toBe("");
      });
    },
    TEST_TIMEOUT,
  );
});
