import { Future } from "@adviser/cement";

type QueueFunction<T = void> = () => Promise<T>;

export class CommitQueue<T = void> {
  readonly queue: QueueFunction<void>[] = [];
  processing = false;

  readonly _waitIdleItems = new Set<Future<void>>();
  waitIdle() {
    if (this.queue.length === 0 && !this.processing) {
      return Promise.resolve();
    }
    const fn = new Future<void>();
    this._waitIdleItems.add(fn);
    return fn.asPromise();
  }

  async enqueue(fn: QueueFunction<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const queueFn = async () => {
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        } finally {
          this.processing = false;
          this.processNext();
        }
      };
      this.queue.push(queueFn);
      if (!this.processing) {
        this.processNext();
      }
    });
  }

  processNext() {
    if (this.queue.length > 0 && !this.processing) {
      this.processing = true;
      const queueFn = this.queue.shift();
      if (queueFn) {
        queueFn().finally(() => {
          /**/
        });
      }
    }
    if (this.queue.length === 0 && !this.processing) {
      const toResolve = Array.from(this._waitIdleItems);
      this._waitIdleItems.clear();
      toResolve.map((fn) => fn.resolve());
    }
  }
}
