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
    console.log("process:1", queue.length);
    if (isProcessing || queue.length === 0) return;
    isProcessing = true;
    const allUpdates: DocUpdate<T>[] = [];
    try {
      while (queue.length > 0) {
        console.log("process:1.1:", queue.length);
        queue.sort((a, b) => (b.updates ? 1 : -1));
        const task = queue.shift();
        if (!task) continue;

        console.log("process:1.2:", queue.length, worker.toString());
        await worker(task.newHead, task.prevHead, task.updates !== undefined).catch((e) => {
          console.log("process:1.2.1:", queue.length);
          throw logger.Error().Err(e).Msg("int_applyHead worker error").AsError();
        });
        // console.timeEnd('int_applyHead worker')

        console.log("process:1.3:", queue.length);
        if (task.updates) {
          allUpdates.push(...task.updates);
        }
        console.log("process:1.4:", queue.length);
        // Yield the updates if there are no tasks with updates left in the queue or the current task has updates
        if (!queue.some((t) => t.updates) || task.updates) {
          const allTasksHaveUpdates = queue.every((task) => task.updates !== null);
          console.log("process:1.5:", queue.length);
          yield { updates: allUpdates, all: allTasksHaveUpdates };
          console.log("process:1.6:", queue.length);
          allUpdates.length = 0;
        }
        console.log("process:1.7:", queue.length);
      }
    } finally {
      console.log("process:1.2");
      isProcessing = false;
      const generator = process();
      let result = await generator.next();
      while (!result.done) {
        result = await generator.next();
      }
    }
    console.log("process:2");
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
