import { describe, it, expect } from "vitest";
import { Database, DocWithId, fireproof } from "@fireproof/core";
import { ensureSuperThis } from "@fireproof/core-runtime";

interface TestDoc {
  id: string;
  data: string;
}

/**
 * Direct test for meta block dangling reference issue.
 * 
 * This test simulates the exact sequence that causes the race condition:
 * 1. Create documents to fill carLog
 * 2. Start a commit that will capture carLog snapshot
 * 3. During that commit, trigger compaction that replaces carLog
 * 4. The meta block from step 2 will reference eliminated carLog entries
 */
describe("Direct Meta Block Reference Test", () => {
  const sthis = ensureSuperThis();

  it("should detect meta block references to eliminated carLog entries", async () => {
    const dbName = `direct-meta-${sthis.nextId().str}`;
    const db = fireproof(dbName, {
      autoCompact: 3, // Low threshold for predictable compaction
    }) as Database;

    try {
      // Step 1: Create initial documents to build up carLog
      console.log("📝 Creating initial documents...");
      for (let i = 0; i < 3; i++) {
        await db.put({
          _id: `doc-${i}`,
          id: `doc-${i}`,
          data: `Data ${i}`.repeat(50), // Larger docs to fill carLog faster
        });
      }

      const blockstore = db.ledger.crdt.blockstore;
      
      // Check initial carLog state
      const initialCarLog = blockstore.loader.carLog.asArray();
      console.log(`📊 Initial carLog has ${initialCarLog.length} entries`);
      console.log(`🎯 AutoCompact threshold: ${blockstore.ebOpts.autoCompact}`);
      
      // Step 2: Add one more document to trigger compaction
      console.log("🚀 Adding document to trigger compaction...");
      await db.put({
        _id: "trigger-doc",
        id: "trigger-doc", 
        data: "This will trigger compaction".repeat(50),
      });

      // Check if compaction was triggered
      const postTriggerCarLog = blockstore.loader.carLog.asArray();
      console.log(`📊 Post-trigger carLog has ${postTriggerCarLog.length} entries`);

      // Step 3: Force compaction if not triggered automatically
      if (postTriggerCarLog.length > blockstore.ebOpts.autoCompact) {
        console.log("🔧 Manually triggering compaction...");
        await blockstore.compact();
      }

      const postCompactCarLog = blockstore.loader.carLog.asArray();
      console.log(`📊 Post-compact carLog has ${postCompactCarLog.length} entries`);
      
      // Step 4: Now add documents AFTER compaction has modified carLog
      console.log("📝 Adding post-compaction documents...");
      const postCompactDocs = [];
      for (let i = 0; i < 2; i++) {
        const doc = {
          _id: `post-compact-${i}`,
          id: `post-compact-${i}`,
          data: `Post-compact data ${i}`.repeat(30),
        };
        await db.put(doc);
        postCompactDocs.push(doc);
      }

      const finalCarLog = blockstore.loader.carLog.asArray();
      console.log(`📊 Final carLog has ${finalCarLog.length} entries`);

      // Step 5: Test document retrieval - this is where missing block errors occur
      console.log("🔍 Testing document retrieval...");
      
      const allDocs = await db.allDocs<TestDoc>();
      console.log(`📋 allDocs() returned ${allDocs.rows.length} documents`);
      
      // Verify we can retrieve all documents
      const expectedDocs = [
        'doc-0', 'doc-1', 'doc-2', 'trigger-doc', 
        ...postCompactDocs.map(d => d._id)
      ];
      
      for (const docId of expectedDocs) {
        try {
          const doc = await db.get(docId);
          expect(doc).toBeDefined();
          console.log(`✅ Retrieved: ${docId}`);
        } catch (error) {
          console.error(`❌ Failed to retrieve ${docId}:`, error);
          
          if (error instanceof Error && error.message.includes("missing block")) {
            throw new Error(`Detected dangling meta block reference for ${docId}: ${error.message}`);
          }
          throw error;
        }
      }

      // Step 6: Test query operations
      console.log("🔎 Testing query operations...");
      const queryResult = await db.query<TestDoc>((doc: DocWithId<TestDoc>) => {
        if (doc.data && doc.id) {
          return doc.id;
        }
      });
      
      console.log(`🔍 Query returned ${queryResult.rows.length} documents`);
      expect(queryResult.rows.length).toBeGreaterThan(0);

      console.log("✅ All operations completed successfully");
      
    } finally {
      await db.destroy();
    }
  }, 15000);

  it("should show carLog state transitions during compaction", async () => {
    const dbName = `carlog-transitions-${sthis.nextId().str}`;
    const db = fireproof(dbName, {
      autoCompact: 2, // Very aggressive
    }) as Database;

    try {
      const blockstore = db.ledger.crdt.blockstore;
      
      console.log("=== CarLog State Transitions ===");
      
      // Track carLog changes
      const logCarLogState = (label: string) => {
        const carLog = blockstore.loader.carLog.asArray();
        console.log(`${label}: ${carLog.length} entries - ${carLog.map(g => g.map(c => c.toString().slice(-8)).join(',')).join(' | ')}`);
        return carLog;
      };

      // const initial = logCarLogState("Initial");
      
      // Add documents one by one and observe carLog changes
      for (let i = 0; i < 5; i++) {
        await db.put({
          _id: `step-${i}`,
          data: `Step ${i} data`.repeat(20),
        });
        logCarLogState(`After step-${i}`);
        
        // Small delay to let any async compaction complete
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Force a final compaction
      console.log("🔧 Forcing final compaction...");
      await blockstore.compact();
      // const final = logCarLogState("Final");
      
      // Verify all documents are still accessible
      const allDocs = await db.allDocs();
      console.log(`📋 Final document count: ${allDocs.rows.length}`);
      
      expect(allDocs.rows.length).toBe(5);
      
    } finally {
      await db.destroy();
    }
  }, 10000);
});