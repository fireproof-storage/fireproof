import { Logger } from "@adviser/cement";
import { ClockHead, DocTypes, DocUpdate } from "./types.js";

type ApplyHeadWorkerFunction = (newHead: ClockHead, prevHead: ClockHead, localUpdates: boolean) => Promise<void>;

interface ApplyHeadTask<T extends DocTypes> {
  readonly newHead: ClockHead;
  readonly prevHead: ClockHead;
  readonly updates?: DocUpdate<T>[];
}

export interface ApplyHeadQueue<T extends DocTypes> {
  push(task: ApplyHeadTask<T>): AsyncGenerator<
    {
      readonly updates: DocUpdate<T>[];
      readonly all: boolean;
    },
    void,
    unknown
  >;
  size(): number;
}

export function applyHeadQueue<T extends DocTypes>(worker: ApplyHeadWorkerFunction, logger: Logger): ApplyHeadQueue<T> {
  const queue: ApplyHeadTask<T>[] = [];
  let isProcessing = false;

  async function* process() {
    if (isProcessing || queue.length === 0) return;
    isProcessing = true;
    const allUpdates: DocUpdate<T>[] = [];
    try {
      while (queue.length > 0) {
        queue.sort((a, b) => (b.updates ? 1 : -1));
        const task = queue.shift();
        if (!task) continue;

        await worker(task.newHead, task.prevHead, task.updates !== undefined).catch((e) => {
          throw logger.Error().Err(e).Msg("int_applyHead worker error").AsError();
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
    push(task: ApplyHeadTask<T>): AsyncGenerator<{ updates: DocUpdate<T>[]; all: boolean }, void, unknown> {
      queue.push(task);
      return process();
    },
    size() {
      return queue.length;
    },
  };
}
