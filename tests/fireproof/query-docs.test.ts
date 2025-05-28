import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { Database, DocWithId, ensureSuperThis, fireproof } from "@fireproof/core";

interface TestDoc {
  text: string;
  category: string;
  active: boolean;
}

describe("query return value consistency", function () {
  let db: Database;
  const sthis = ensureSuperThis();

  beforeEach(async () => {
    await sthis.start();
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
});
