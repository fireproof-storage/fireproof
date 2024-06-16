import { ClockHead, DocUpdate } from "./types";

type ApplyHeadWorkerFunction = (newHead: ClockHead, prevHead: ClockHead, localUpdates: boolean) => Promise<void>;

type ApplyHeadTask = {
  readonly newHead: ClockHead;
  readonly prevHead: ClockHead;
  readonly updates?: DocUpdate[];
};

export interface ApplyHeadQueue {
  push(task: ApplyHeadTask): AsyncGenerator<
    {
      readonly updates: DocUpdate[];
      readonly all: boolean;
    },
    void,
    unknown
  >;
  size(): number;
}

export function applyHeadQueue(worker: ApplyHeadWorkerFunction): ApplyHeadQueue {
  const queue: ApplyHeadTask[] = [];
  let isProcessing = false;

  async function* process() {
    if (isProcessing || queue.length === 0) return;
    isProcessing = true;
    const allUpdates: DocUpdate[] = [];
    try {
      while (queue.length > 0) {
        queue.sort((a, b) => (b.updates ? 1 : -1));
        const task = queue.shift();
        if (!task) continue;

        // console.time('int_applyHead worker')
        await worker(task.newHead, task.prevHead, task.updates !== null).catch((e) => {
          console.error("int_applyHead worker error", e);
          throw e;
        });
        // console.timeEnd('int_applyHead worker')

        if (task.updates) {
          allUpdates.push(...task.updates);
        }
        // Yield the updates if there are no tasks with updates left in the queue or the current task has updates
        if (!queue.some((t) => t.updates) || task.updates) {
          const allTasksHaveUpdates = queue.every((task) => task.updates !== null);
          yield { updates: allUpdates, all: allTasksHaveUpdates };
          allUpdates.length = 0;
        }
      }
    } finally {
      isProcessing = false;
      const generator = process();
      let result = await generator.next();
      while (!result.done) {
        result = await generator.next();
      }
    }
  }

  return {
    push(task: ApplyHeadTask): AsyncGenerator<{ updates: DocUpdate[]; all: boolean }, void, unknown> {
      queue.push(task);
      return process();
    },
    size() {
      return queue.length;
    },
  };
}
