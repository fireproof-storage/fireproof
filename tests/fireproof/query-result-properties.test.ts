import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { Database, DocWithId, ensureSuperThis, fireproof } from "@fireproof/core";

interface TestDoc {
  text: string;
  category: string;
  count: number;
}

describe("query result property consistency", function () {
  let db: Database;
  const sthis = ensureSuperThis();

  beforeEach(async () => {
    await sthis.start();
    db = fireproof("test-query-result-properties");

    // Add test documents
    await db.put({ _id: "doc1", text: "hello world", category: "greeting", count: 1 });
    await db.put({ _id: "doc2", text: "goodbye world", category: "farewell", count: 2 });
    await db.put({ _id: "doc3", text: "hello again", category: "greeting", count: 3 });
  });

  afterEach(async () => {
    await db.close();
    await db.destroy();
  });

  it("should have consistent result properties regardless of query options", async function () {
    console.log("===== QUERY WITHOUT KEY OPTION =====");
    // Query without using the key option
    const resultWithoutKey = await db.query<TestDoc>((doc) => doc.category);
    
    // Log the first row to examine its properties
    console.log("First row of result without key option:", JSON.stringify(resultWithoutKey.rows[0], null, 2));
    
    console.log("\n===== QUERY WITH KEY OPTION =====");
    // Query with the key option
    const resultWithKey = await db.query<TestDoc>((doc) => doc.category, {
      key: "greeting",
    });
    
    // Log the first row to examine its properties
    console.log("First row of result with key option:", JSON.stringify(resultWithKey.rows[0], null, 2));
    
    // Add assertions to check property existence
    const withoutKeyProps = Object.keys(resultWithoutKey.rows[0]);
    const withKeyProps = Object.keys(resultWithKey.rows[0]);
    
    console.log("\n===== PROPERTY COMPARISON =====");
    console.log("Properties without key option:", withoutKeyProps);
    console.log("Properties with key option:", withKeyProps);
    
    // Test if the properties are the same in both cases
    expect(withoutKeyProps).toEqual(withKeyProps);
  });
});
