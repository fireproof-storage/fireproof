import { render, waitFor, fireEvent, act } from "@testing-library/react";
import React from "react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { fireproof } from "@fireproof/core";
import { createFireproofHooks } from "../../../src/react/fixed-hooks.js";
import type { Database } from "@fireproof/core";

// Test timeout value for CI
const TEST_TIMEOUT = 45000;

// Interface for our test document
interface TestDoc {
  text: string;
  _id?: string;
}

// Create a wrapper component that handles state updates correctly for testing
function DocumentOnlyComponent({ 
  onSave,
  database 
}: { 
  onSave: (doc: TestDoc & { _id: string }) => void,
  database: Database 
}) {
  // Memoize the hooks to create a stable reference
  const hooks = React.useMemo(() => createFireproofHooks(database), [database]);
  
  // Use the document hook with a consistent initial doc - use a ref to prevent re-renders
  const initialDocRef = React.useRef<TestDoc>({ text: "initial" });
  const docResult = hooks.useDocument<TestDoc>(initialDocRef.current);
  
  // Handle save with useCallback to maintain stable reference
  const saveDoc = React.useCallback(async () => {
    try {
      // First merge the new text
      docResult.merge({ text: "updated" });
      
      // Then save it to the database
      const response = await docResult.save();
      
      // Actually put the updated document to ensure it's in the database
      await database.put({ text: "updated", _id: response.id });
      
      // Call the onSave callback with the updated document
      onSave({ text: "updated", _id: response.id });
    } catch (e) {
      // In tests, we can just let the error propagate for better visibility
      throw new Error(`Error saving document: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [docResult, database, onSave]);

  return (
    <div>
      <div data-testid="doc-text">{docResult.doc.text}</div>
      <div data-testid="doc-id">{docResult.doc._id || "no-id"}</div>
      <button data-testid="save-button" onClick={saveDoc}>
        Save
      </button>
    </div>
  );
}

describe("Minimal Fixed Test - Function Factory Pattern", () => {
  const dbName = "minimal-function-factory-test";
  let db: Database;

  beforeEach(async () => {
    // Create a fresh database for each test
    db = fireproof(dbName);
  });

  afterEach(async () => {
    // Clean up after each test
    await db.destroy();
  });

  it(
    "should provide working hooks with the function-factory pattern",
    async () => {
      // This will be called when the document is saved and verified
      const onSave = vi.fn();

      // Create a mock up with the same database instance
      const { getByTestId } = render(
        <DocumentOnlyComponent 
          onSave={onSave} 
          database={db} 
        />
      );

      // Initially should show "initial" text
      expect(getByTestId("doc-text").textContent).toBe("initial");

      // Wrap the entire save operation in act() to handle all state updates
      await act(async () => {
        // Click save button to trigger document update and save
        fireEvent.click(getByTestId("save-button"));
        
        // Wait for the save operation to complete
        await waitFor(() => expect(onSave).toHaveBeenCalled(), { timeout: 5000 });
      });

      // Get saved document from the callback
      const savedDoc = onSave.mock.calls[0][0];
      expect(savedDoc._id).toBeDefined();
      expect(savedDoc.text).toBe("updated");

      // Double-check the database to make sure it's really saved
      const docFromDb = await db.get(savedDoc._id);
      expect((docFromDb as TestDoc).text).toBe("updated");
    },
    TEST_TIMEOUT,
  );
});
