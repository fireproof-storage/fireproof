import { Transaction } from "./transaction";
import { ClockHead, DocUpdate } from "./types";

type ApplyHeadWorkerFunction = (tblocks: Transaction | null, newHead: ClockHead, prevHead: ClockHead, updates: DocUpdate[] | null) => Promise<void>;

type ApplyHeadTask = {
  tblocks: Transaction | null;
  newHead: ClockHead;
  prevHead: ClockHead;
  updates: DocUpdate[] | null;
  resolve?: () => void;
  reject?: (error: Error) => void;
};

export type ApplyHeadQueue = {
  push(task: ApplyHeadTask): AsyncGenerator<{updates: DocUpdate[], all: boolean}, void, unknown>;
};

export function applyHeadQueue(worker: ApplyHeadWorkerFunction): ApplyHeadQueue {
  const queue: ApplyHeadTask[] = [];
  let isProcessing = false;

  async function* process() {
    if (isProcessing || queue.length === 0) return;
    isProcessing = true;

    // Collect all updates
    const allUpdates: DocUpdate[] = [];

    while (queue.length > 0) {
      // Prioritize tasks with updates
      queue.sort((a, b) => (b.updates ? 1 : -1));

      const task = queue[0];
      try {
        await worker(task.tblocks, task.newHead, task.prevHead, task.updates);
        if (task.updates) {
          allUpdates.push(...task.updates);
        }
        // Yield the updates if there are no tasks with updates left in the queue or the current task has updates
        if (!queue.some(t => t.updates) || task.updates) {
          const allTasksHaveUpdates = queue.every(task => task.updates !== null);
          yield { updates: allUpdates, all: allTasksHaveUpdates };
          allUpdates.length = 0; // Clear the updates
        }
      } finally {
        // Remove the processed task from the queue
        queue.shift();
      }
    }

    isProcessing = false;
    void process();
  }

  return {
    push(task: ApplyHeadTask): AsyncGenerator<{updates: DocUpdate[], all: boolean}, void, unknown> {
      queue.push(task);
      return process();
    },
  };
}
