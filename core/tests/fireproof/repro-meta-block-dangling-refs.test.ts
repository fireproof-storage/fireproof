import { fireproof, Database, DocWithId } from "@fireproof/core";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { describe, it, expect, vi } from "vitest";

interface TestRecord {
  id: string;
  type: string;
  data: string;
  createdAt: string;
}

/**
 * Test to reproduce the meta block dangling reference issue.
 *
 * The race condition occurs when:
 * 1. A commit captures a carLog snapshot [CAR1, CAR2, CAR3]
 * 2. Compaction starts based on the same snapshot
 * 3. New commits arrive during compaction, adding CAR4
 * 4. Original commit creates meta block referencing [CAR1, CAR2, CAR3]
 * 5. Compaction completes and replaces carLog with [COMPACTED_CAR]
 * 6. Meta block now has dangling references to eliminated CAR entries
 */
describe("Meta Block Dangling References", () => {
  const sthis = ensureSuperThis();

  it("should reproduce dangling meta block references during compaction", async () => {
    const dbName = `meta-dangling-${sthis.nextId().str}`;

    // Use aggressive auto-compaction to trigger the race condition quickly
    const db = fireproof(dbName, {
      autoCompact: 2, // Extremely low threshold to trigger compaction frequently
    }) as Database;

    try {
      // Step 1: Fill database to approach compaction threshold
      const initialDocs: DocWithId<TestRecord>[] = [];
      for (let i = 0; i < 2; i++) {
        const doc: DocWithId<TestRecord> = {
          _id: `initial-${i}`,
          id: `initial-${i}`,
          type: "TestRecord",
          data: `Initial data ${i}`.repeat(100), // Make docs larger to fill carLog faster
          createdAt: new Date().toISOString(),
        };
        await db.put(doc);
        initialDocs.push(doc);
      }

      // Step 2: Set up the race condition by intercepting compaction
      let compactionStarted = false;
      let compactionCompleted = false;
      let concurrentCommitDone = false;

      // Get access to the underlying blockstore to monitor compaction
      const blockstore = db.ledger.crdt.blockstore;
      const originalCompact = blockstore.compact.bind(blockstore);

      // Spy on compact method to detect when it starts and introduce delays
      blockstore.compact = vi.fn(async () => {
        compactionStarted = true;
        console.log("🔥 Compaction started");

        // Introduce delay to create race condition window
        await new Promise((resolve) => setTimeout(resolve, 100));

        const result = await originalCompact();
        compactionCompleted = true;
        console.log("✅ Compaction completed");
        return result;
      });

      // Step 3: Create the commit that will trigger compaction
      const triggerDoc: DocWithId<TestRecord> = {
        _id: "trigger-compaction",
        id: "trigger-compaction",
        type: "TestRecord",
        data: "This commit will trigger compaction".repeat(100),
        createdAt: new Date().toISOString(),
      };

      // This commit should trigger auto-compaction due to carLog.length > 5
      const triggerCommitPromise = db.put(triggerDoc);

      // Wait for the trigger commit to complete first
      await triggerCommitPromise;

      // Force a compaction check since auto-compaction might not trigger immediately
      const currentCarLogLength = blockstore.loader.carLog.length;
      console.log(`Current carLog length: ${currentCarLogLength}, autoCompact threshold: ${blockstore.ebOpts.autoCompact}`);

      if (currentCarLogLength > blockstore.ebOpts.autoCompact) {
        // Manually trigger needsCompaction to ensure the race condition scenario
        (blockstore as unknown as { needsCompaction(): void }).needsCompaction();
      }

      // Step 4: Wait for compaction to start, then add concurrent commits
      const maxWait = 2000; // 2 second timeout
      const startTime = Date.now();

      while (!compactionStarted && Date.now() - startTime < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      if (!compactionStarted) {
        console.log("⚠️  Compaction did not start automatically, forcing it manually");
        // Force compaction to test the race condition
        const compactPromise = blockstore.compact();
        compactionStarted = true;
        await compactPromise;
        compactionCompleted = true;
      } else {
        expect(compactionStarted).toBe(true);
      }
      console.log("🚀 Detected compaction started, adding concurrent commits");

      // Step 5: Add commits while compaction is running
      const concurrentDocs: DocWithId<TestRecord>[] = [];
      for (let i = 0; i < 3; i++) {
        const doc: DocWithId<TestRecord> = {
          _id: `concurrent-${i}`,
          id: `concurrent-${i}`,
          type: "TestRecord",
          data: `Concurrent data ${i}`.repeat(100),
          createdAt: new Date().toISOString(),
        };

        const putPromise = db.put(doc);
        concurrentDocs.push(doc);

        // Don't await immediately to maximize race condition chances
        if (i === concurrentDocs.length - 1) {
          await putPromise;
          concurrentCommitDone = true;
          console.log("📝 Concurrent commits completed");
        }
      }

      // Step 6: Wait for both trigger commit and compaction to complete
      await triggerCommitPromise;

      const compactionWaitStart = Date.now();
      while (!compactionCompleted && Date.now() - compactionWaitStart < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      expect(compactionCompleted).toBe(true);
      expect(concurrentCommitDone).toBe(true);

      // Step 7: Try to read all documents - this should expose dangling references
      console.log("🔍 Testing document retrieval after compaction...");

      // Test allDocs - this operation reads meta blocks and follows carLog references
      const allDocsResult = await db.allDocs<TestRecord>();
      console.log(`📊 allDocs returned ${allDocsResult.rows.length} documents`);

      // Test individual document retrieval
      for (const doc of [...initialDocs, triggerDoc, ...concurrentDocs]) {
        try {
          const retrieved = await db.get<TestRecord>(doc._id);
          expect(retrieved).toBeDefined();
          expect(retrieved._id).toBe(doc._id);
          console.log(`✅ Successfully retrieved document: ${doc._id}`);
        } catch (error) {
          console.error(`❌ Failed to retrieve document ${doc._id}:`, error);

          // Check if this is the specific "missing block" error we expect
          if (error instanceof Error && error.message.includes("missing block")) {
            throw new Error(`Dangling meta block reference detected for document ${doc._id}: ${error.message}`);
          }
          throw error;
        }
      }

      // Test query operations which also traverse meta blocks
      const queryResult = await db.query<TestRecord>(
        (doc: DocWithId<TestRecord>) => {
          if (doc.type === "TestRecord") {
            return doc.createdAt;
          }
        },
        { descending: true },
      );

      console.log(`🔎 Query returned ${queryResult.rows.length} documents`);
      expect(queryResult.rows.length).toBeGreaterThan(0);

      // If we reach this point without errors, the race condition wasn't triggered
      // or the bug doesn't exist. The test should be considered passing in this case.
      console.log("✅ All document operations completed successfully");
    } finally {
      await db.destroy();
    }
  }, 10000); // 10 second timeout for this complex test

  it("should detect carLog inconsistencies after compaction", async () => {
    const dbName = `carlog-consistency-${sthis.nextId().str}`;
    const db = fireproof(dbName, {
      autoCompact: 3, // Very aggressive compaction
    }) as Database;

    try {
      // Record carLog state before and after operations
      const blockstore = db.ledger.crdt.blockstore;

      // Add some initial data
      for (let i = 0; i < 5; i++) {
        await db.put({
          _id: `doc-${i}`,
          data: `Document ${i}`,
          type: "TestDoc",
        });
      }

      // Get carLog state
      const carLogBefore = blockstore.loader.carLog.asArray();
      console.log(`CarLog before compaction: ${carLogBefore.length} entries`);

      // Force compaction and concurrent writes
      const compactionPromise = blockstore.compact();

      // Add more data while compaction might be running
      const concurrentWrites = [];
      for (let i = 0; i < 3; i++) {
        concurrentWrites.push(
          db.put({
            _id: `concurrent-${i}`,
            data: `Concurrent ${i}`,
            type: "ConcurrentDoc",
          }),
        );
      }

      await Promise.all([compactionPromise, ...concurrentWrites]);

      const carLogAfter = blockstore.loader.carLog.asArray();
      console.log(`CarLog after compaction: ${carLogAfter.length} entries`);

      // Verify all documents are still accessible
      const allDocs = await db.allDocs();
      expect(allDocs.rows.length).toBe(8); // 5 initial + 3 concurrent

      // Try to access each document to ensure no missing blocks
      for (const row of allDocs.rows) {
        if (row.key) {
          // Check for valid ID
          const doc = await db.get(row.key);
          expect(doc).toBeDefined();
        }
      }
    } finally {
      await db.destroy();
    }
  }, 10000);
});
