import { ensureLogger } from "./utils.js";
import { DocTypes, MetaType, DocUpdate, SuperThis } from "./types.js";
import { Future, Logger } from "@adviser/cement";

type WorkerFunction<T extends DocTypes> = (tasks: DocUpdate<T>[]) => Promise<MetaType>;

export interface WriteQueue<T extends DocTypes> {
  push(task: DocUpdate<T>): Promise<MetaType>;
  bulk(tasks: DocUpdate<T>[]): Promise<MetaType>;
  close(): Promise<void>;
}

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
    // ordered: false,
    chunkSize: 32,
    ...opts,
  };
}

class WriteQueueImpl<T extends DocTypes> implements WriteQueue<T> {
  private readonly opts: WriteQueueParams;

  private readonly queue: WriteQueueItem<T>[] = [];
  private readonly worker: WorkerFunction<T>;
  private isProcessing = false;
  private readonly logger: Logger;

  constructor(sthis: SuperThis, worker: WorkerFunction<T>, opts: WriteQueueParams) {
    this.logger = ensureLogger(sthis, "WriteQueueImpl");
    this.worker = worker;
    this.opts = opts;
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
    this.logger.Debug().Any("opts", this.opts).Len(this.queue).Msg("Processing tasks");
    const tasksToProcess = this.queue.splice(0, this.opts.chunkSize);
    const updates = tasksToProcess.map((item) => item.tasks).filter((item) => item) as DocUpdate<T>[][];
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
    this.isProcessing = false;
    void this.process();
  }

  bulk(tasks: DocUpdate<T>[]): Promise<MetaType> {
    return new Promise<MetaType>((resolve, reject) => {
      this.queue.push({ tasks, resolve, reject });
      this.process();
    });
  }
  push(task: DocUpdate<T>): Promise<MetaType> {
    return new Promise<MetaType>((resolve, reject) => {
      this.queue.push({ tasks: [task], resolve, reject });
      this.process();
    });
  }
  close(): Promise<void> {
    this.waitForEmptyQueue = new Future();
    this.testEmptyQueue();
    return this.waitForEmptyQueue.asPromise();
  }
}

export function writeQueue<T extends DocTypes>(sthis: SuperThis, worker: WorkerFunction<T>, opts: WriteQueueParams): WriteQueue<T> {
  return new WriteQueueImpl<T>(sthis, worker, opts);
}
