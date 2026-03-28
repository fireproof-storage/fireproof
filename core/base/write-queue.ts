import { ensureLogger } from "@fireproof/core-runtime";
import {
  DocTypes,
  MetaType,
  DocUpdate,
  SuperThis,
  WriteQueue,
  defaultWriteQueueOpts,
  WriteQueueParams,
} from "@fireproof/core-types-base";
import { Future, Logger } from "@adviser/cement";

type WorkerFunction<T extends DocTypes> = (tasks: DocUpdate<T>[]) => Promise<MetaType>;

interface WriteQueueItem<T extends DocTypes> {
  // readonly task?: DocUpdate<T>;
  readonly tasks?: DocUpdate<T>[];
  resolve(result: MetaType): void;
  reject(error: Error): void;
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
      const allUpdates = tasksToProcess.flatMap((item) => item.tasks || []);
      try {
        const result = await this.worker(allUpdates);
        for (const task of tasksToProcess) {
          task.resolve(result);
        }
      } catch (error) {
        const err = this.logger.Error().Err(error).Msg("Error processing task").AsError();
        for (const task of tasksToProcess) {
          task.reject(err);
        }
      }
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
  hasPending(): boolean {
    return this.queue.length > 0;
  }
}

export function writeQueue<T extends DocUpdate<S>, S extends DocTypes = DocTypes>(
  sthis: SuperThis,
  worker: WorkerFunction<S>,
  opts: WriteQueueParams,
): WriteQueue<T, S> {
  return new WriteQueueImpl<T, S>(sthis, worker, opts);
}
