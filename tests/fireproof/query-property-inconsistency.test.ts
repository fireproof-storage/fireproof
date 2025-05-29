import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { Database, ensureSuperThis, fireproof } from "@fireproof/core";

interface TestDoc {
  text: string;
  category: string;
  count: number;
}

describe("query property inconsistency issue", function () {
  let db: Database;
  const sthis = ensureSuperThis();

  beforeEach(async () => {
    await sthis.start();
    db = fireproof("test-query-property-inconsistency");

    // Add test documents
    await db.put({ _id: "doc1", text: "hello world", category: "greeting", count: 1 });
    await db.put({ _id: "doc2", text: "goodbye world", category: "farewell", count: 2 });
    await db.put({ _id: "doc3", text: "hello again", category: "greeting", count: 3 });
  });

  afterEach(async () => {
    await db.close();
    await db.destroy();
  });

  it("demonstrates property inconsistency in query results", async function () {
    // Case 1: Query without key option - should have 'value' property
    const queryNoKey = await db.query<TestDoc>((doc) => doc.category);

    // Verify it has 'value' property
    expect(queryNoKey.rows[0]).toHaveProperty("value");

    // Case 2: Query with key option - currently has 'row' property instead of 'value'
    const queryWithKey = await db.query<TestDoc>((doc) => doc.category, {
      key: "greeting",
    });

    // THIS WILL FAIL - Demonstrating the inconsistency
    // After standardizing on 'value', this assertion should pass
    expect(queryWithKey.rows[0]).toHaveProperty("value");

    // This assertion will pass after standardizing on 'value' and removing 'row'
    expect(queryWithKey.rows[0]).not.toHaveProperty("row");
  });

  it("should use consistent property names regardless of query type", async function () {
    // Multiple query variations to test different code paths

    // 1. Regular query (no options)
    const regularQuery = await db.query<TestDoc>((doc) => doc.category);

    // 2. Query with key option
    const keyQuery = await db.query<TestDoc>((doc) => doc.category, {
      key: "greeting",
    });

    // 3. Query with range option
    const rangeQuery = await db.query<TestDoc>((doc) => doc.count, {
      range: [1, 3],
    });

    // 4. Query with prefix option
    const prefixQuery = await db.query<TestDoc>((doc) => [doc.category, doc.count], {
      prefix: ["greeting"],
    });

    // Check each query type has the 'value' property
    expect(regularQuery.rows[0]).toHaveProperty("value");
    expect(keyQuery.rows[0]).toHaveProperty("value");
    expect(rangeQuery.rows[0]).toHaveProperty("value");
    expect(prefixQuery.rows[0]).toHaveProperty("value");

    // Ensure no query has the 'row' property
    expect(regularQuery.rows[0]).not.toHaveProperty("row");
    expect(keyQuery.rows[0]).not.toHaveProperty("row");
    expect(rangeQuery.rows[0]).not.toHaveProperty("row");
    expect(prefixQuery.rows[0]).not.toHaveProperty("row");

    // Ensure all queries have the same set of properties
    const regularProps = Object.keys(regularQuery.rows[0]).sort();
    const keyProps = Object.keys(keyQuery.rows[0]).sort();
    const rangeProps = Object.keys(rangeQuery.rows[0]).sort();
    const prefixProps = Object.keys(prefixQuery.rows[0]).sort();

    expect(keyProps).toEqual(regularProps);
    expect(rangeProps).toEqual(regularProps);
    expect(prefixProps).toEqual(regularProps);
  });
});
