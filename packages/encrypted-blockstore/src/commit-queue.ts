type QueueFunction = () => Promise<void>

export class CommitQueue<T = void> {
  queue: QueueFunction[] = []
  processing = false

  async enqueue(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const queueFn = async () => {
        try {
          resolve(await fn())
        } catch (e) {
          reject(e)
        } finally {
          this.processing = false
          this.processNext()
        }
      }
      this.queue.push(queueFn)
      if (!this.processing) {
        this.processNext()
      }
    })
  }

  processNext() {
    if (this.queue.length > 0 && !this.processing) {
      this.processing = true
      const queueFn = this.queue.shift()
      if (queueFn) {
        queueFn()
      }
    }
  }
}
