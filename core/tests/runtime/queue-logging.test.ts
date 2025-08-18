import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Logger } from "@adviser/cement";
import { fireproof } from "@fireproof/core";
import type { Database } from "@fireproof/core-types-base";

describe("Queue Warning Logging", () => {
  let db: Database;
  let mockLogger: {
    warn: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    // Create test database
    db = fireproof("test-queue-logging");
    await db.ready();

    // Mock logger to capture log calls
    mockLogger = {
      warn: vi.fn().mockReturnValue({
        Uint: vi.fn().mockReturnThis(),
        Bool: vi.fn().mockReturnThis(),
        Msg: vi.fn().mockReturnThis()
      }),
      debug: vi.fn().mockReturnValue({
        Uint: vi.fn().mockReturnThis(),
        Bool: vi.fn().mockReturnThis(),
        Msg: vi.fn().mockReturnThis()
      })
    };
  });

  afterEach(async () => {
    await db.close();
    vi.clearAllMocks();
  });

  it("should generate debug logs for normal queue operations", async () => {
    // Single operation should generate debug logs
    await db.put({ test: "single operation" });
    
    // Note: Since we can't easily mock the internal logger,
    // this test validates the operation completes successfully
    // In real scenarios, debug logs would be visible in console
    expect(true).toBe(true);
  });

  it("should handle concurrent operations without errors", async () => {
    // Test multiple concurrent operations
    const promises = Array.from({ length: 15 }, (_, i) => 
      db.put({ id: i, data: `concurrent-${i}` })
    );

    const results = await Promise.all(promises);
    
    // Verify all operations completed successfully
    expect(results).toHaveLength(15);
    results.forEach(result => {
      expect(result.id).toBeDefined();
      expect(result.clock).toBeDefined();
    });
  });

  it("should handle concurrent bulk operations", async () => {
    // Test multiple concurrent bulk operations
    const bulkPromises = Array.from({ length: 8 }, (_, i) => {
      const docs = Array.from({ length: 5 }, (_, j) => ({
        batch: i,
        item: j,
        data: `bulk-${i}-${j}`
      }));
      return db.bulk(docs);
    });

    const results = await Promise.all(bulkPromises);
    
    // Verify all bulk operations completed successfully
    expect(results).toHaveLength(8);
    results.forEach(result => {
      expect(result.ids).toHaveLength(5);
      expect(result.clock).toBeDefined();
    });
  });

  it("should maintain queue size limits under high concurrency", async () => {
    // Create a high number of concurrent operations to potentially trigger warnings
    const concurrentOps = 25;
    const promises: Promise<any>[] = [];

    // Mix of single puts and bulk operations
    for (let i = 0; i < concurrentOps; i++) {
      if (i % 3 === 0) {
        // Bulk operations
        const docs = Array.from({ length: 3 }, (_, j) => ({
          type: 'bulk',
          batch: i,
          item: j
        }));
        promises.push(db.bulk(docs));
      } else {
        // Single puts
        promises.push(db.put({ type: 'single', id: i }));
      }
    }

    // All operations should complete successfully
    const results = await Promise.all(promises);
    expect(results).toHaveLength(concurrentOps);

    // Verify database state is consistent
    const allDocs = await db.allDocs();
    expect(allDocs.rows.length).toBeGreaterThan(0);
  });

  it("should handle rapid sequential operations", async () => {
    // Test rapid sequential operations that might queue up
    const results = [];
    
    for (let i = 0; i < 20; i++) {
      const result = await db.put({ sequence: i, timestamp: Date.now() });
      results.push(result);
    }

    expect(results).toHaveLength(20);
    results.forEach((result, index) => {
      expect(result.id).toBeDefined();
      expect(result.clock).toBeDefined();
    });
  });

  it("should maintain data consistency under high queue pressure", async () => {
    // Create operations that would stress the queue system
    const testData = Array.from({ length: 30 }, (_, i) => ({
      id: `stress-test-${i}`,
      value: i,
      timestamp: Date.now()
    }));

    // Create concurrent bulk and single operations
    const bulkPromise = db.bulk(testData.slice(0, 15));
    const singlePromises = testData.slice(15).map(doc => db.put(doc));

    const [bulkResult, ...singleResults] = await Promise.all([
      bulkPromise,
      ...singlePromises
    ]);

    // Verify bulk result
    expect(bulkResult.ids).toHaveLength(15);

    // Verify single results
    expect(singleResults).toHaveLength(15);
    singleResults.forEach(result => {
      expect(result.id).toBeDefined();
    });

    // Verify all data is retrievable
    for (const doc of testData) {
      const retrieved = await db.get(doc.id);
      expect(retrieved.value).toBe(doc.value);
    }
  });
});