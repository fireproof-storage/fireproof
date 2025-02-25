import { ensureLogger } from "./utils.js";
import { DocTypes, MetaType, DocUpdate, SuperThis, WriteQueue } from "./types.js";
import { Future, Logger } from "@adviser/cement";

type WorkerFunction<T extends DocTypes> = (tasks: DocUpdate<T>[]) => Promise<MetaType>;

interface WriteQueueItem<T extends DocTypes> {
  // readonly task?: DocUpdate<T>;
  readonly tasks?: DocUpdate<T>[];
  resolve(result: MetaType): void;
  reject(error: Error): void;
}

export interface WriteQueueParams {
  // default 32
  // if chunkSize is 1 the result will be ordered in time
  readonly chunkSize: number;
}

export function defaultWriteQueueOpts(opts: Partial<WriteQueueParams> = {}): WriteQueueParams {
  return {
    ...opts,
    chunkSize: opts.chunkSize && opts.chunkSize > 0 ? opts.chunkSize : 32,
  };
}

class WriteQueueImpl<T extends DocUpdate<S>, S extends DocTypes = DocTypes> implements WriteQueue<T> {
  private readonly opts: WriteQueueParams;

  private readonly queue: WriteQueueItem<S>[] = [];
  private readonly worker: WorkerFunction<S>;
  private isProcessing = false;
  private readonly logger: Logger;

  constructor(sthis: SuperThis, worker: WorkerFunction<S>, opts: WriteQueueParams) {
    this.logger = ensureLogger(sthis, "WriteQueueImpl");
    this.worker = worker;
    this.opts = defaultWriteQueueOpts(opts);
  }

  private waitForEmptyQueue?: Future<void>;
  private testEmptyQueue() {
    if (this.waitForEmptyQueue && this.queue.length === 0) {
      this.waitForEmptyQueue.resolve();
    }
  }

  private async process() {
    if (this.isProcessing || this.queue.length === 0) {
      this.testEmptyQueue();
      return;
    }
    this.isProcessing = true;
    try {
      this.logger.Debug().Any("opts", this.opts).Len(this.queue).Msg("Processing tasks");
      const tasksToProcess = this.queue.splice(0, this.opts.chunkSize);
      const updates = tasksToProcess.map((item) => item.tasks).filter((item) => item) as DocUpdate<S>[][];
      const promises = updates.map(async (update, index) => {
        try {
          const result = await this.worker(update);
          tasksToProcess[index].resolve(result);
        } catch (error) {
          tasksToProcess[index].reject(this.logger.Error().Err(error).Msg("Error processing task").AsError());
        }
      });
      await Promise.allSettled(promises);
      this.logger.Debug().Any("opts", this.opts).Len(this.queue).Msg("Processed tasks");
    } catch (error) {
      this.logger.Error().Err(error).Msg("Error processing tasks");
    } finally {
      this.isProcessing = false;
      setTimeout(() => this.process(), 0);
    }
  }

  bulk(tasks: DocUpdate<S>[]): Promise<MetaType> {
    return new Promise<MetaType>((resolve, reject) => {
      this.queue.push({ tasks, resolve, reject });
      this.process();
    });
  }
  push(task: DocUpdate<S>): Promise<MetaType> {
    return this.bulk([task]);
  }
  close(): Promise<void> {
    this.waitForEmptyQueue = new Future();
    this.testEmptyQueue();
    return this.waitForEmptyQueue.asPromise();
  }
}

export function writeQueue<T extends DocUpdate<S>, S extends DocTypes = DocTypes>(
  sthis: SuperThis,
  worker: WorkerFunction<S>,
  opts: WriteQueueParams,
): WriteQueue<T, S> {
  return new WriteQueueImpl<T, S>(sthis, worker, opts);
}
