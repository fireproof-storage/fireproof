import { Database, fireproof } from "@fireproof/core";

describe("allDocs deleted document handling", () => {
  let db: Database;

  beforeEach(async () => {
    db = await fireproof("test-deleted-docs");

    // Create a mix of regular and deleted documents
    await db.put({ _id: "doc1", value: "one" });
    await db.put({ _id: "doc2", value: "two" });
    await db.put({ _id: "doc3", value: "three" });

    // Create deleted documents
    await db.put({ _id: "deleted1", value: "deleted-one", _deleted: true });
    await db.put({ _id: "deleted2", value: "deleted-two", _deleted: true });
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("should exclude deleted documents by default (currently failing)", async () => {
    const result = await db.allDocs();

    // This test will fail because allDocs() currently returns deleted documents
    expect(result.rows.length).toBe(3); // Only non-deleted docs should be returned

    const ids = result.rows.map((row) => row.key);
    expect(ids).toContain("doc1");
    expect(ids).toContain("doc2");
    expect(ids).toContain("doc3");
    expect(ids).not.toContain("deleted1");
    expect(ids).not.toContain("deleted2");
  });

  it("should include deleted documents when includeDeleted is true (new feature)", async () => {
    // This test will fail because the includeDeleted option doesn't exist yet
    const result = await db.allDocs({ includeDeleted: true });

    expect(result.rows.length).toBe(5); // All docs

    const ids = result.rows.map((row) => row.key);
    expect(ids).toContain("doc1");
    expect(ids).toContain("doc2");
    expect(ids).toContain("doc3");
    expect(ids).toContain("deleted1");
    expect(ids).toContain("deleted2");
  });

  it("handles empty databases correctly", async () => {
    // Create a new empty database
    const emptyDb = await fireproof("test-empty-db");

    // Test with default options
    const defaultResult = await emptyDb.allDocs();
    expect(defaultResult.rows.length).toBe(0);

    // Test with includeDeleted option
    const includeDeletedResult = await emptyDb.allDocs({ includeDeleted: true });
    expect(includeDeletedResult.rows.length).toBe(0);

    await emptyDb.destroy();
  });

  it("handles database with only deleted documents", async () => {
    // Create a database with only deleted documents
    const deletedOnlyDb = await fireproof("test-deleted-only-db");

    // Add only deleted documents
    await deletedOnlyDb.put({ _id: "deleted1", value: "deleted-one", _deleted: true });
    await deletedOnlyDb.put({ _id: "deleted2", value: "deleted-two", _deleted: true });

    // By default, should return empty result
    const defaultResult = await deletedOnlyDb.allDocs();
    expect(defaultResult.rows.length).toBe(0); // This will fail with current implementation

    // With includeDeleted, should return all deleted docs
    const includeDeletedResult = await deletedOnlyDb.allDocs({ includeDeleted: true });
    expect(includeDeletedResult.rows.length).toBe(2);

    await deletedOnlyDb.destroy();
  });

  it("respects limit option while excluding deleted documents", async () => {
    // Test with limit option
    const limitResult = await db.allDocs({ limit: 2 });

    expect(limitResult.rows.length).toBe(2);

    // All returned documents should be non-deleted
    const docs = await Promise.all(limitResult.rows.map((row) => db.get(row.key)));
    docs.forEach((doc) => {
      expect(doc._deleted).not.toBe(true);
    });
  });

  it("respects limit option while including deleted documents", async () => {
    // Test with limit and includeDeleted options
    const result = await db.allDocs({ limit: 3, includeDeleted: true });

    expect(result.rows.length).toBe(3);

    // Can include both deleted and non-deleted documents
    const ids = result.rows.map((row) => row.key);

    // We don't test specific IDs here because the order depends on implementation
    // Just verify that the limit is respected
    expect(ids.length).toBe(3);
  });
});
