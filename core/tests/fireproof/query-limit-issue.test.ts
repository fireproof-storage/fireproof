import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { Database, fireproof } from "@fireproof/core";

interface TodoDoc {
  task: string;
  completed: boolean;
  priority?: number;
}

describe("query limit handling", () => {
  let db: Database;

  beforeEach(async () => {
    db = await fireproof("test-query-limit");

    // Create multiple documents with different completed values and priorities
    await db.put({ _id: "task1", task: "Task 1", completed: true, priority: 1 });
    await db.put({ _id: "task2", task: "Task 2", completed: true, priority: 2 });
    await db.put({ _id: "task3", task: "Task 3", completed: false, priority: 3 });
    await db.put({ _id: "task4", task: "Task 4", completed: false, priority: 4 });
    await db.put({ _id: "task5", task: "Task 5", completed: true, priority: 5 });
  });

  afterEach(async () => {
    await db.destroy();
  });

  // PASSING CASES - These should work correctly with the current implementation

  it("should correctly limit results for regular queries", async () => {
    // Regular query with limit (no key/keys specified)
    const queryResult = await db.query("completed", {
      includeDocs: false,
      limit: 2,
    });

    // This should pass - limit should work for regular queries
    expect(queryResult.rows.length).toBe(2);
  });

  it("should correctly limit results for 'key' parameter queries", async () => {
    // Query with a single key and limit
    const queryResult = await db.query("completed", {
      key: true,
      includeDocs: false,
      limit: 2,
    });

    // This should pass - limit should work for queries with 'key' option
    expect(queryResult.rows.length).toBe(2);

    // All results should have completed=true
    queryResult.rows.forEach((row) => {
      expect(row.key).toBe(true);
    });
  });

  it("should correctly limit range query results", async () => {
    // Query with range and limit
    const queryResult = await db.query("priority", {
      range: [2, 4],
      includeDocs: false,
      limit: 2,
    });

    // This should pass - limit should work for range queries
    expect(queryResult.rows.length).toBe(2);

    // All results should have priority between 2 and 4
    queryResult.rows.forEach((row) => {
      expect(row.key).toBeGreaterThanOrEqual(2);
      expect(row.key).toBeLessThanOrEqual(4);
    });
  });

  // FAILING CASES - These demonstrate the current bug

  it("should respect the limit option with 'keys' parameter (currently failing)", async () => {
    // Query with multiple keys and limit=1
    // This should return only 1 result total, but currently returns 1 per key
    const queryResult = await db.query("completed", {
      keys: [true, false],
      includeDocs: false,
      limit: 1,
    });

    // This assertion will fail with the current implementation
    // Current behavior: Returns limit=1 for EACH key, so 2 results total
    // Expected behavior: Returns limit=1 across ALL keys combined
    expect(queryResult.rows.length).toBe(1);
  });

  it("should apply limit correctly to combined results from multiple keys", async () => {
    // Query with multiple keys and limit=3
    // Should return exactly 3 results total
    const queryResult = await db.query<TodoDoc, boolean>("completed", {
      keys: [true, false],
      includeDocs: false,
      limit: 3,
    });

    // This assertion verifies that limit is applied to the combined result
    expect(queryResult.rows.length).toBe(3);
  });

  it("demonstrates the limit+1 issue with the 'keys' parameter", async () => {
    // Create a controlled test case with exact document counts
    await db.destroy();
    db = await fireproof("test-exact-limit");

    // Create exactly 2 documents with completed=true and 2 with completed=false
    await db.put({ _id: "doc1", task: "Doc 1", completed: true });
    await db.put({ _id: "doc2", task: "Doc 2", completed: true });
    await db.put({ _id: "doc3", task: "Doc 3", completed: false });
    await db.put({ _id: "doc4", task: "Doc 4", completed: false });

    // Query with limit=1 - should return exactly 1 result total
    const result1 = await db.query("completed", {
      keys: [true, false],
      limit: 1,
      includeDocs: false,
    });

    // Will fail - returns 2 instead of 1
    expect(result1.rows.length).toBe(1);

    // Query with limit=2 - should return exactly 2 results total
    const result2 = await db.query("completed", {
      keys: [true, false],
      limit: 2,
      includeDocs: false,
    });

    // Will fail - returns 4 instead of 2
    expect(result2.rows.length).toBe(2);

    // Query with limit=3 - should return exactly 3 results total
    const result3 = await db.query("completed", {
      keys: [true, false],
      limit: 3,
      includeDocs: false,
    });

    // Will fail - returns 4 instead of 3
    expect(result3.rows.length).toBe(3);
  });
});
