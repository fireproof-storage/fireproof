import { BulkResult, DocUpdate } from './types'

type WorkerFunction = (tasks: DocUpdate[]) => Promise<BulkResult>;

export type WriteQueue = {
  push(task: DocUpdate): Promise<BulkResult>;
};

export function writeQueue(worker: WorkerFunction, payload: number = Infinity): WriteQueue {
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

    try {
      const result = await worker(updates)
      tasksToProcess.forEach(task => task.resolve(result))
    } catch (error) {
      tasksToProcess.forEach(task => task.reject(error as Error))
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
