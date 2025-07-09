import { Database, DocWithId, fireproof } from "@fireproof/core";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

interface TestDoc {
  text: string;
  category: string;
  active: boolean;
}

describe("query return value consistency", function () {
  let db: Database;

  beforeEach(async () => {
    db = fireproof("test-query-docs");

    // Add test documents
    await db.put({ _id: "doc1", text: "hello world", category: "greeting", active: true });
    await db.put({ _id: "doc2", text: "goodbye world", category: "farewell", active: true });
    await db.put({ _id: "doc3", text: "hello again", category: "greeting", active: false });
  });

  afterEach(async () => {
    await db.close();
    await db.destroy();
  });

  it("database query should return docs property like useLiveQuery", async function () {
    // This test should initially fail because the query method doesn't return docs yet
    const result = await db.query<TestDoc>("category");

    // Check that rows property exists (this should pass)
    expect(result).toHaveProperty("rows");
    expect(result.rows.length).toBe(3);

    // Check that docs property exists (this should fail until we implement the feature)
    expect(result).toHaveProperty("docs");
    expect(Array.isArray(result.docs)).toBe(true);
    expect(result.docs.length).toBe(3);

    // Verify docs contain the correct document data
    const docIds = result.docs.map((doc) => doc._id).sort();
    expect(docIds).toEqual(["doc1", "doc2", "doc3"]);
  });

  it("should return docs with the same order as rows", async function () {
    const result = await db.query<TestDoc>("category");

    // Ensure docs array exists
    expect(result).toHaveProperty("docs");

    // Verify the order matches between rows and docs
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows[i];
      const doc = result.docs[i];
      expect(doc._id).toBe(row.id);
    }
  });

  it("should work with complex map functions and query options", async function () {
    // Test with a map function and query options
    const result = await db.query<TestDoc, boolean>((doc) => doc.active, {
      key: true,
      includeDocs: true,
    });

    // Check rows (this should pass)
    expect(result.rows.length).toBeGreaterThan(0);

    // Check docs property (this should fail until we implement the feature)
    expect(result).toHaveProperty("docs");
    expect(result.docs.length).toBe(result.rows.length);

    // Verify all returned docs are active
    result.docs.forEach((doc) => {
      // Since we know these are TestDoc documents
      expect((doc as DocWithId<TestDoc>).active).toBe(true);
    });
  });

  it("should only return docs with false value when queried with {key: false}", async function () {
    // Test with a map function and query options for false value
    const result = await db.query<TestDoc, boolean>((doc) => doc.active, {
      key: false,
      includeDocs: true,
    });

    // Should only return documents where active is false
    expect(result.rows.length).toBe(1); // We only have one document with active: false

    // Check docs property exists and matches rows length
    expect(result).toHaveProperty("docs");
    expect(result.docs.length).toBe(result.rows.length);

    // Verify all returned docs have active set to false
    result.docs.forEach((doc) => {
      expect((doc as DocWithId<TestDoc>).active).toBe(false);
    });

    // Make sure no documents with active: true are included
    const activeTrue = result.docs.filter((doc) => (doc as DocWithId<TestDoc>).active === true);
    expect(activeTrue.length).toBe(0); // No active: true docs should be included

    // Now run a query with key: true for comparison
    const trueResult = await db.query<TestDoc, boolean>((doc) => doc.active, {
      key: true,
      includeDocs: true,
    });

    // This correctly returns only active: true documents
    expect(trueResult.rows.length).toBe(2);

    // All returned docs have active set to true
    trueResult.docs.forEach((doc) => {
      expect((doc as DocWithId<TestDoc>).active).toBe(true);
    });
  });
});
