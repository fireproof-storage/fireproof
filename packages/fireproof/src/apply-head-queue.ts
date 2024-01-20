import { ClockHead, DocUpdate } from './types'

type ApplyHeadWorkerFunction = (newHead: ClockHead, prevHead: ClockHead, localUpdates: boolean) => Promise<void>

type ApplyHeadTask = {
  newHead: ClockHead
  prevHead: ClockHead
  updates: DocUpdate[] | null
}

export type ApplyHeadQueue = {
  push(task: ApplyHeadTask): AsyncGenerator<{ updates: DocUpdate[]; all: boolean }, void, unknown>
}

export function applyHeadQueue(worker: ApplyHeadWorkerFunction): ApplyHeadQueue {
  const queue: ApplyHeadTask[] = []
  let isProcessing = false

  async function* process() {
    if (isProcessing || queue.length === 0) return
    isProcessing = true
    const allUpdates: DocUpdate[] = []
    try {
      while (queue.length > 0) {
        queue.sort((a, b) => (b.updates ? 1 : -1))
        const task = queue.shift()
        if (!task) continue

        await worker(task.newHead, task.prevHead, task.updates !== null)

        if (task.updates) {
          allUpdates.push(...task.updates)
        }
        // Yield the updates if there are no tasks with updates left in the queue or the current task has updates
        if (!queue.some(t => t.updates) || task.updates) {
          const allTasksHaveUpdates = queue.every(task => task.updates !== null)
          yield { updates: allUpdates, all: allTasksHaveUpdates }
          allUpdates.length = 0
        }
      }
    } finally {
      isProcessing = false
      const generator = process()
      let result = await generator.next()
      while (!result.done) {
        result = await generator.next()
      }
    }
  }

  return {
    push(
      task: ApplyHeadTask
    ): AsyncGenerator<{ updates: DocUpdate[]; all: boolean }, void, unknown> {
      queue.push(task)
      return process()
    }
  }
}
