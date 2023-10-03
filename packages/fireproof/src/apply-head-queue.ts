import { Transaction } from "./transaction";
import { ClockHead, DocUpdate } from "./types";

type ApplyHeadWorkerFunction = (id: string, tblocks: Transaction | null, newHead: ClockHead, prevHead: ClockHead, updates: DocUpdate[] | null) => Promise<void>;

type ApplyHeadTask = {
  id : string;
  tblocks: Transaction | null;
  newHead: ClockHead;
  prevHead: ClockHead;
  updates: DocUpdate[] | null;
};

export type ApplyHeadQueue = {
  push(task: ApplyHeadTask): AsyncGenerator<{ updates: DocUpdate[], all: boolean }, void, unknown>;
};

export function applyHeadQueue(worker: ApplyHeadWorkerFunction): ApplyHeadQueue {
  const queue: ApplyHeadTask[] = [];
  let isProcessing = false;

  async function* process() {
    // console.log('maybe process', isProcessing, queue.length)
    if (isProcessing || queue.length === 0) return;
    isProcessing = true;
    const allUpdates: DocUpdate[] = [];

    try {
      while (queue.length > 0) {
        // Prioritize tasks with updates
        queue.sort((a, b) => (b.updates ? 1 : -1));

        const task = queue.shift();
        if (!task) continue;
        // console.log('start task', task.id, queue.length + 1, task.newHead.toString())
        // console.time('worker'+ task.id)
        await worker(task.id, task.tblocks, task.newHead, task.prevHead, task.updates);
        // console.timeEnd('worker'+ task.id)
        if (task.updates) {
          allUpdates.push(...task.updates);
        }
        // Yield the updates if there are no tasks with updates left in the queue or the current task has updates
        if (!queue.some(t => t.updates) || task.updates) {
          const allTasksHaveUpdates = queue.every(task => task.updates !== null);
          // console.time('yielding')
          yield { updates: allUpdates, all: allTasksHaveUpdates };
          // console.timeEnd('yielding')
          allUpdates.length = 0; // Clear the updates
        } 
        // else {
        //   yield { updates: [], all: false };
        // }
      }
      // yield { updates: allUpdates, all: true };
    } finally {
      // console.log('finally processing')
      isProcessing = false;
      // return process();
      const generator = process();
      let result = await generator.next();
      while (!result.done) {
        result = await generator.next();
      }
    }
  }

  return {
    push(task: ApplyHeadTask): AsyncGenerator<{ updates: DocUpdate[], all: boolean }, void, unknown> {
      // console.log('push task', task.id, task.newHead.toString())
      queue.push(task);
      return process();
    },
  };
}
