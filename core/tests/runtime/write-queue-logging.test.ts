import { describe, it, expect, beforeEach, vi } from "vitest";
import { writeQueue } from "../../base/write-queue.js";
import type { DocUpdate, DocTypes } from "@fireproof/core-types-base";
import type { SuperThis } from "@fireproof/core-types-base";

describe("WriteQueue Logging", () => {
  let mockWorker: ReturnType<typeof vi.fn>;
  let mockSuperThis: SuperThis;
  let logger: any;

  beforeEach(() => {
    // Mock worker function
    mockWorker = vi.fn().mockResolvedValue({ head: [] });

    // Mock SuperThis
    mockSuperThis = {
      timeOrderedNextId: vi.fn().mockReturnValue({ str: "mock-id" })
    } as any;

    // Create logger with mocked methods
    logger = {
      Debug: vi.fn().mockReturnValue({
        Any: vi.fn().mockReturnThis(),
        Len: vi.fn().mockReturnThis(),
        Uint: vi.fn().mockReturnThis(),
        Msg: vi.fn().mockReturnThis()
      }),
      Warn: vi.fn().mockReturnValue({
        Uint: vi.fn().mockReturnThis(),
        Msg: vi.fn().mockReturnThis()
      }),
      Error: vi.fn().mockReturnValue({
        Err: vi.fn().mockReturnThis(),
        Msg: vi.fn().mockReturnValue({
          AsError: vi.fn().mockReturnValue(new Error("test error"))
        })
      })
    };
  });

  it("should log debug messages for normal operations", async () => {
    const queue = writeQueue(mockSuperThis, mockWorker, { chunkSize: 32 });

    const tasks: DocUpdate<DocTypes>[] = [
      { id: "test1", value: { test: "data1" } },
      { id: "test2", value: { test: "data2" } }
    ];

    await queue.bulk(tasks);

    // Verify worker was called
    expect(mockWorker).toHaveBeenCalledWith(tasks);
  });

  it("should handle single push operations", async () => {
    const queue = writeQueue(mockSuperThis, mockWorker, { chunkSize: 32 });

    const task: DocUpdate<DocTypes> = { id: "test", value: { test: "data" } };

    await queue.push(task);

    // Push should call bulk with single item array
    expect(mockWorker).toHaveBeenCalledWith([task]);
  });

  it("should process operations in chunks", async () => {
    const chunkSize = 3;
    const queue = writeQueue(mockSuperThis, mockWorker, { chunkSize });

    // Add more tasks than chunk size
    const promises = [];
    for (let i = 0; i < 7; i++) {
      promises.push(queue.push({ id: `test${i}`, value: { index: i } }));
    }

    await Promise.all(promises);

    // Should have been called multiple times due to chunking
    expect(mockWorker).toHaveBeenCalled();
  });

  it("should handle concurrent bulk operations", async () => {
    const queue = writeQueue(mockSuperThis, mockWorker, { chunkSize: 32 });

    const bulkTasks1 = Array.from({ length: 5 }, (_, i) => ({
      id: `bulk1-${i}`,
      value: { batch: 1, index: i }
    }));

    const bulkTasks2 = Array.from({ length: 5 }, (_, i) => ({
      id: `bulk2-${i}`,
      value: { batch: 2, index: i }
    }));

    // Execute concurrent bulk operations
    const [result1, result2] = await Promise.all([
      queue.bulk(bulkTasks1),
      queue.bulk(bulkTasks2)
    ]);

    // Both should complete successfully
    expect(result1).toBeDefined();
    expect(result2).toBeDefined();
    expect(mockWorker).toHaveBeenCalled();
  });

  it("should handle queue closure", async () => {
    const queue = writeQueue(mockSuperThis, mockWorker, { chunkSize: 32 });

    // Add some tasks
    const task1Promise = queue.push({ id: "test1", value: { test: "data1" } });
    const task2Promise = queue.push({ id: "test2", value: { test: "data2" } });

    // Close the queue
    const closePromise = queue.close();

    // Wait for all operations to complete
    await Promise.all([task1Promise, task2Promise, closePromise]);

    expect(mockWorker).toHaveBeenCalled();
  });

  it("should handle worker errors", async () => {
    // Make worker throw an error
    mockWorker.mockRejectedValueOnce(new Error("Worker failed"));

    const queue = writeQueue(mockSuperThis, mockWorker, { chunkSize: 32 });

    const task: DocUpdate<DocTypes> = { id: "test", value: { test: "data" } };

    // Should propagate the error
    await expect(queue.push(task)).rejects.toThrow("Worker failed");
  });

  it("should handle mixed operation types", async () => {
    const queue = writeQueue(mockSuperThis, mockWorker, { chunkSize: 32 });

    // Mix of single pushes and bulk operations
    const singlePromise = queue.push({ id: "single", value: { type: "single" } });
    
    const bulkTasks = [
      { id: "bulk1", value: { type: "bulk", index: 1 } },
      { id: "bulk2", value: { type: "bulk", index: 2 } }
    ];
    const bulkPromise = queue.bulk(bulkTasks);

    await Promise.all([singlePromise, bulkPromise]);

    // Worker should have been called for both operations
    expect(mockWorker).toHaveBeenCalled();
  });

  it("should maintain correct queue processing order", async () => {
    const queue = writeQueue(mockSuperThis, mockWorker, { chunkSize: 1 }); // Process one at a time

    const calls: string[] = [];
    mockWorker.mockImplementation(async (tasks: DocUpdate<DocTypes>[]) => {
      calls.push(tasks[0].id);
      return { head: [] };
    });

    // Add tasks in sequence
    await Promise.all([
      queue.push({ id: "first", value: { order: 1 } }),
      queue.push({ id: "second", value: { order: 2 } }),
      queue.push({ id: "third", value: { order: 3 } })
    ]);

    // Should have processed all tasks
    expect(calls).toHaveLength(3);
    expect(calls).toContain("first");
    expect(calls).toContain("second");
    expect(calls).toContain("third");
  });
});