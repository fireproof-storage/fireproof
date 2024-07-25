import { Logger } from "@adviser/cement";
import { DbMetaEventBlock } from "./connection-base.js";
import { AnyLink, Loadable } from "./index.js";
import { ensureLogger } from "../utils.js";

interface TaskItem {
  readonly cid: string;
  readonly eventBlock: DbMetaEventBlock;
  retries: number;
}

export class TaskManager {
  private readonly eventsWeHandled = new Set<string>();
  private readonly loader: Loadable;

  private queue: TaskItem[] = [];
  private isProcessing = false;

  readonly logger: Logger;
  constructor(loader: Loadable) {
    this.loader = loader;
    this.logger = ensureLogger(loader.logger, "TaskManager");
  }

  async handleEvent(eventBlock: DbMetaEventBlock) {
    const cid = eventBlock.cid.toString();
    const parents = eventBlock.value.parents.map((cid: AnyLink) => cid.toString());
    for (const parent of parents) {
      this.eventsWeHandled.add(parent);
    }
    this.queue.push({ cid, eventBlock, retries: 0 });
    this.queue = this.queue.filter(({ cid }) => !this.eventsWeHandled.has(cid));
    void this.processQueue();
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    const filteredQueue = this.queue.filter(({ cid }) => !this.eventsWeHandled.has(cid));
    const first = filteredQueue[0];
    if (!first) {
      return;
    }
    try {
      this.loader?.remoteMetaStore?.handleByteHeads([first.eventBlock.value.data.dbMeta]);
      this.eventsWeHandled.add(first.cid);
      this.queue = this.queue.filter(({ cid }) => !this.eventsWeHandled.has(cid));
    } catch (err) {
      if (first.retries++ > 3) {
        this.logger.Error().Str("cid", first.cid).Msg("failed to process event block after 3 retries");
        this.queue = this.queue.filter(({ cid }) => cid !== first.cid);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
      throw this.logger.Error().Err(err).Msg("failed to process event block").AsError();
    } finally {
      this.isProcessing = false;
      if (this.queue.length > 0) {
        void this.processQueue();
      }
    }
  }
}
