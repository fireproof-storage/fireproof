import { Logger } from "@adviser/cement";
import type { ActiveStore, CarClockHead, CarClockLink, DbMeta } from "./types.js";
import { ensureLogger } from "../utils.js";
import { SuperThis } from "../types.js";

interface TaskItem {
  readonly cid: string;
  readonly dbMeta: DbMeta;
  readonly store: ActiveStore;
  retries: number;
}

export interface TaskManagerParams {
  readonly removeAfter: number; // default 3
  readonly retryTimeout: number; // default 50
}

export class TaskManager {
  // we need to remove the events after some time
  private readonly eventsWeHandled = new Set<string>();

  private queue: TaskItem[] = [];
  private isProcessing = false;

  readonly logger: Logger;
  readonly params: TaskManagerParams;

  readonly callback: (dbMeta: DbMeta, store: ActiveStore) => Promise<void>;
  constructor(sthis: SuperThis, callback: (dbMeta: DbMeta, store: ActiveStore) => Promise<void>, params: TaskManagerParams) {
    this.logger = ensureLogger(sthis, "TaskManager");
    this.callback = callback;
    this.params = params
  }

  async handleEvent(cid: CarClockLink, parents: CarClockHead, dbMeta: DbMeta, store: ActiveStore) {
    for (const parent of parents) {
      this.eventsWeHandled.add(parent.toString());
    }
    this.queue.push({ cid: cid.toString(), dbMeta, retries: 0, store });
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
      await this.callback(first.dbMeta, first.store);
      this.eventsWeHandled.add(first.cid);
      this.queue = this.queue.filter(({ cid }) => !this.eventsWeHandled.has(cid));
    } catch (err) {
      if (first.retries++ > 3) {
        this.logger.Error().Str("cid", first.cid).Msg("failed to process event block after 3 retries");
        this.queue = this.queue.filter(({ cid }) => cid !== first.cid);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
      this.logger.Warn().Err(err).Msg("retry to process event block")
    } finally {
      this.isProcessing = false;
      if (this.queue.length > 0) {
        void this.processQueue();
      }
    }
  }
}
