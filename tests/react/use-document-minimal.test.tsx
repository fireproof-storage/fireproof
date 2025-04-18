import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { fireproof, useFireproof } from "use-fireproof";
import type { Database } from "use-fireproof";

// Test timeout value for CI
const TEST_TIMEOUT = 45000;

describe("HOOK: useDocument minimal test", () => {
  const dbName = "document-minimal-test-db";
  let db: Database;

  beforeEach(async () => {
    db = fireproof(dbName);
  });

  it(
    "should create and manage a document",
    async () => {
      // Keep everything local to the test
      let docId: string | undefined;

      const { result } = renderHook(() => {
        const { useDocument } = useFireproof(dbName);
        const [doc, updateDoc, saveDoc] = useDocument({ text: "initial" });
        return { doc, updateDoc, saveDoc };
      });

      // Verify initial state
      expect(result.current.doc.text).toBe("initial");
      expect(result.current.doc._id).toBeUndefined();

      // Save the document
      await result.current.saveDoc();

      // Get the ID for later cleanup
      docId = result.current.doc._id;

      // Verify document was saved with an ID
      expect(docId).toBeDefined();

      // Update the document
      result.current.updateDoc({ text: "updated" });

      // Verify update worked
      await waitFor(() => {
        expect(result.current.doc.text).toBe("updated");
      });

      // Clean up the specific document we created
      if (docId) {
        await db.delete(docId);
      }
    },
    TEST_TIMEOUT,
  );

  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
});
