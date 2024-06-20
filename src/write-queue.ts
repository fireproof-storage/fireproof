import { CRDTMeta, DocRecord, DocTypes, DocUpdate, IndexKeyType } from "./types";

type WorkerFunction<T extends DocTypes, K extends IndexKeyType> = (tasks: DocUpdate<T>[]) => Promise<CRDTMeta>;

export interface WriteQueue<T extends DocTypes> {
  push(task: DocUpdate<T>): Promise<CRDTMeta>;
}

interface WriteQueueItem<T extends DocTypes, K extends IndexKeyType> {
  readonly task: DocUpdate<T>;
  resolve(result: CRDTMeta): void;
  reject(error: Error): void;
}

export function writeQueue<T extends DocTypes, K extends IndexKeyType>(worker: WorkerFunction<T, K>, payload = Infinity, unbounded = false): WriteQueue<T> {
  const queue: WriteQueueItem<T, K>[] = [];
  let isProcessing = false;

  async function process() {
    if (isProcessing || queue.length === 0) return;
    isProcessing = true;

    const tasksToProcess = queue.splice(0, payload);
    const updates = tasksToProcess.map((item) => item.task);

    if (unbounded) {
      // Run all updates in parallel and resolve/reject them individually
      const promises = updates.map(async (update, index) => {
        try {
          const result = await worker([update]);
          tasksToProcess[index].resolve(result);
        } catch (error) {
          tasksToProcess[index].reject(error as Error);
        }
      });

      await Promise.all(promises);
    } else {
      // Original logic: Run updates in a batch and resolve/reject them together
      try {
        const result = await worker(updates);
        tasksToProcess.forEach((task) => task.resolve(result));
      } catch (error) {
        tasksToProcess.forEach((task) => task.reject(error as Error));
      }
    }

    isProcessing = false;
    void process();
  }

  return {
    push(task: DocUpdate<T>): Promise<CRDTMeta> {
      return new Promise<CRDTMeta>((resolve, reject) => {
        queue.push({ task, resolve, reject });
        void process();
      });
    },
  };
}
