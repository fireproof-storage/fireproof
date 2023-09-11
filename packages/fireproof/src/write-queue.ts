import { BulkResult, DocUpdate } from './types'

type WorkerFunction = (tasks: DocUpdate[]) => Promise<BulkResult>;

export type WriteQueue = {
  push(task: DocUpdate): Promise<BulkResult>;
};

export function writeQueue(worker: WorkerFunction, payload: number = Infinity, unbounded: boolean = false): WriteQueue {
  const queue: {
    task: DocUpdate;
    resolve: (result: BulkResult) => void;
    reject: (error: Error) => void;
  }[] = []
  let isProcessing = false

  async function process() {
    if (isProcessing || queue.length === 0) return
    isProcessing = true

    const tasksToProcess = queue.splice(0, payload)
    const updates = tasksToProcess.map(item => item.task)

    if (unbounded) {
      // Run all updates in parallel and resolve/reject them individually
      const promises = updates.map(async (update, index) => {
        try {
          const result = await worker([update])
          tasksToProcess[index].resolve(result)
        } catch (error) {
          tasksToProcess[index].reject(error as Error)
        }
      })

      await Promise.all(promises)
    } else {
      // Original logic: Run updates in a batch and resolve/reject them together
      try {
        const result = await worker(updates)
        tasksToProcess.forEach(task => task.resolve(result))
      } catch (error) {
        tasksToProcess.forEach(task => task.reject(error as Error))
      }
    }

    isProcessing = false
    void process()
  }

  return {
    push(task: DocUpdate): Promise<BulkResult> {
      return new Promise<BulkResult>((resolve, reject) => {
        queue.push({ task, resolve, reject })
        void process()
      })
    }
  }
}
