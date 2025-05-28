import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { Database, DocWithId, ensureSuperThis, fireproof } from "@fireproof/core";

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
    console.log("Query without key option - first row properties:", Object.keys(queryNoKey.rows[0]));
    
    // Verify it has 'value' property
    expect(queryNoKey.rows[0]).toHaveProperty("value");
    expect(queryNoKey.rows[0]).not.toHaveProperty("row");
    
    // Case 2: Query with key option - should have 'row' property instead of 'value'
    const queryWithKey = await db.query<TestDoc>((doc) => doc.category, {
      key: "greeting"
    });
    console.log("Query with key option - first row properties:", Object.keys(queryWithKey.rows[0]));
    
    // THIS WILL FAIL - Demonstrating the inconsistency
    // The following assertion shows that with {key: ...}, we get 'row' instead of 'value'
    expect(queryWithKey.rows[0]).toHaveProperty("value");
    expect(queryWithKey.rows[0]).not.toHaveProperty("row");
    
    // Compare the two responses
    console.log("\nProperty comparison:");
    console.log("- Without key option:", JSON.stringify(queryNoKey.rows[0], null, 2));
    console.log("- With key option:", JSON.stringify(queryWithKey.rows[0], null, 2));
  });

  it("should use consistent property names regardless of query type", async function () {
    // Multiple query variations to test different code paths
    
    // 1. Regular query (no options)
    const regularQuery = await db.query<TestDoc>((doc) => doc.category);
    
    // 2. Query with key option
    const keyQuery = await db.query<TestDoc>((doc) => doc.category, {
      key: "greeting"
    });
    
    // 3. Query with range option
    const rangeQuery = await db.query<TestDoc>((doc) => doc.count, {
      range: [1, 3]
    });
    
    // 4. Query with prefix option
    const prefixQuery = await db.query<TestDoc>((doc) => [doc.category, doc.count], {
      prefix: ["greeting"]
    });
    
    // Log all result property sets for comparison
    console.log("Regular query row properties:", Object.keys(regularQuery.rows[0]));
    console.log("Key query row properties:", Object.keys(keyQuery.rows[0]));
    console.log("Range query row properties:", Object.keys(rangeQuery.rows[0]));
    console.log("Prefix query row properties:", Object.keys(prefixQuery.rows[0]));
    
    // The following assertion will fail, demonstrating the inconsistency across query types
    const regularProps = Object.keys(regularQuery.rows[0]).sort();
    const keyProps = Object.keys(keyQuery.rows[0]).sort();
    const rangeProps = Object.keys(rangeQuery.rows[0]).sort();
    const prefixProps = Object.keys(prefixQuery.rows[0]).sort();
    
    expect(keyProps).toEqual(regularProps);
    expect(rangeProps).toEqual(regularProps);
    expect(prefixProps).toEqual(regularProps);
  });
});
