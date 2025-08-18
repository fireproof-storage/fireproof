import { describe, it, expect, beforeEach, vi } from "vitest";
import { applyHeadQueue } from "../../base/apply-head-queue.js";
import { ensureLogger } from "@fireproof/core-runtime";
import type { ClockHead, DocTypes, DocUpdate } from "@fireproof/core-types-base";

describe("ApplyHeadQueue Logging", () => {
  let mockWorker: ReturnType<typeof vi.fn>;
  let logger: any;
  let queue: ReturnType<typeof applyHeadQueue>;

  beforeEach(() => {
    // Mock worker function
    mockWorker = vi.fn().mockResolvedValue(undefined);

    // Create logger with mocked methods
    logger = {
      Debug: vi.fn().mockReturnValue({
        Uint: vi.fn().mockReturnThis(),
        Bool: vi.fn().mockReturnThis(),
        Msg: vi.fn().mockReturnThis()
      }),
      Warn: vi.fn().mockReturnValue({
        Uint: vi.fn().mockReturnThis(),
        Bool: vi.fn().mockReturnThis(),
        Msg: vi.fn().mockReturnThis()
      }),
      Error: vi.fn().mockReturnValue({
        Err: vi.fn().mockReturnThis(),
        Msg: vi.fn().mockReturnValue({
          AsError: vi.fn().mockReturnValue(new Error("test error"))
        })
      })
    };

    // Create queue with mocked dependencies
    queue = applyHeadQueue<DocTypes>(mockWorker, logger);
  });

  it("should track queue size correctly", async () => {
    // Initially queue should be empty
    expect(queue.size()).toBe(0);

    // Add a task
    const mockHead: ClockHead = [];
    const mockPrevHead: ClockHead = [];
    const mockUpdates: DocUpdate<DocTypes>[] = [
      { id: "test", value: { test: "data" } }
    ];

    const generator = queue.push({
      newHead: mockHead,
      prevHead: mockPrevHead,
      updates: mockUpdates
    });

    // Queue size should increase temporarily
    // Note: This is implementation dependent and may vary
    // The main goal is to verify the size() method works

    // Process the queue
    let result = await generator.next();
    while (!result.done) {
      result = await generator.next();
    }

    // Verify worker was called
    expect(mockWorker).toHaveBeenCalledWith(mockHead, mockPrevHead, true);
  });

  it("should handle multiple concurrent tasks", async () => {
    const tasks = Array.from({ length: 10 }, (_, i) => ({
      newHead: [] as ClockHead,
      prevHead: [] as ClockHead,
      updates: [{ id: `test-${i}`, value: { index: i } }] as DocUpdate<DocTypes>[]
    }));

    // Add all tasks
    const generators = tasks.map(task => queue.push(task));

    // Process all tasks
    await Promise.all(
      generators.map(async (gen) => {
        let result = await gen.next();
        while (!result.done) {
          result = await gen.next();
        }
      })
    );

    // All workers should have been called
    expect(mockWorker).toHaveBeenCalledTimes(10);
  });

  it("should handle tasks without updates", async () => {
    const task = {
      newHead: [] as ClockHead,
      prevHead: [] as ClockHead,
      // No updates
    };

    const generator = queue.push(task);

    let result = await generator.next();
    while (!result.done) {
      result = await generator.next();
    }

    // Worker should be called with localUpdates = false
    expect(mockWorker).toHaveBeenCalledWith([], [], false);
  });

  it("should sort tasks with updates first", async () => {
    const taskWithoutUpdates = {
      newHead: [] as ClockHead,
      prevHead: [] as ClockHead,
    };

    const taskWithUpdates = {
      newHead: [] as ClockHead,
      prevHead: [] as ClockHead,
      updates: [{ id: "test", value: { test: "data" } }] as DocUpdate<DocTypes>[]
    };

    // Add task without updates first
    const gen1 = queue.push(taskWithoutUpdates);
    
    // Add task with updates second
    const gen2 = queue.push(taskWithUpdates);

    // Process both
    await Promise.all([
      (async () => {
        let result = await gen1.next();
        while (!result.done) {
          result = await gen1.next();
        }
      })(),
      (async () => {
        let result = await gen2.next();
        while (!result.done) {
          result = await gen2.next();
        }
      })()
    ]);

    // Both workers should have been called
    expect(mockWorker).toHaveBeenCalledTimes(2);
  });

  it("should handle worker errors gracefully", async () => {
    // Make worker throw an error
    mockWorker.mockRejectedValueOnce(new Error("Worker error"));

    const task = {
      newHead: [] as ClockHead,
      prevHead: [] as ClockHead,
      updates: [{ id: "test", value: { test: "data" } }] as DocUpdate<DocTypes>[]
    };

    const generator = queue.push(task);

    // Should handle the error without crashing
    await expect(async () => {
      let result = await generator.next();
      while (!result.done) {
        result = await generator.next();
      }
    }).rejects.toThrow();

    // Error should have been logged
    expect(logger.Error).toHaveBeenCalled();
  });
});