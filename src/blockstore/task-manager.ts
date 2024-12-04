import { Logger } from "@adviser/cement";
import type { CarClockHead, CarClockLink, DbMeta } from "./types.js";
import { ensureLogger } from "../utils.js";
import { SuperThis } from "../types.js";

interface TaskItem {
  readonly cid: string;
  readonly dbMeta: DbMeta;
  retries: number;
}

export class TaskManager {
  // we need to remove the events after some time
  private readonly eventsWeHandled = new Set<string>();

  private queue: TaskItem[] = [];
  private isProcessing = false;

  readonly logger: Logger;
  readonly callback: (dbMeta: DbMeta) => Promise<void>;
  constructor(sthis: SuperThis, callback: (dbMeta: DbMeta) => Promise<void>) {
    this.logger = ensureLogger(sthis, "TaskManager");
    this.callback = callback;
  }

  async handleEvent(cid: CarClockLink, parents: CarClockHead, dbMeta: DbMeta) {
    for (const parent of parents) {
      this.eventsWeHandled.add(parent.toString());
    }
    this.queue.push({ cid: cid.toString(), dbMeta, retries: 0 });
    this.queue = this.queue.filter(({ cid }) => !this.eventsWeHandled.has(cid));
    void this.processQueue();
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    const filteredQueue = this.queue.filter(({ cid }) => !this.eventsWeHandled.has(cid));
    const first = filteredQueue[0];
    if (!first) {
      this.isProcessing = false;
      return;
    }
    try {
      await this.callback(first.dbMeta);
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
