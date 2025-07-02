import { Future } from "@adviser/cement";
import { TraceFn } from "@fireproof/core-types";
import { CommitQueueIf } from "@fireproof/core-types/blockstore";

type QueueFunction<T = void> = () => Promise<T>;

export class CommitQueue<T = void> implements CommitQueueIf<T> {
  readonly queue: QueueFunction<void>[] = [];
  processing = false;

  readonly traceFn: TraceFn;

  constructor({ tracer }: { tracer: TraceFn }) {
    this.traceFn = tracer;
  }

  readonly _waitIdleItems: Set<Future<void>> = new Set<Future<void>>();
  waitIdle(): Promise<void> {
    if (this.queue.length === 0 && !this.processing) {
      return Promise.resolve();
    }
    const fn = new Future<void>();
    this._waitIdleItems.add(fn);
    return fn.asPromise();
  }

  async enqueue(fn: QueueFunction<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // const id = Math.random().toString(36).substring(2, 15);
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
      this.traceFn({
        event: "busyFromCommitQueue",
        queueLen: this.queue.length + 1,
      });
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
      this.traceFn({
        event: "idleFromCommitQueue",
      });
      const toResolve = Array.from(this._waitIdleItems);
      this._waitIdleItems.clear();
      toResolve.map((fn) => fn.resolve());
    }
  }
}
