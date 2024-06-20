import { DbMetaEventBlock } from "./connection";
import { AnyLink, Loader } from "./index";

export class TaskManager {
  private readonly eventsWeHandled = new Set<string>();
  private readonly loader: Loader;

  private queue: any[] = [];
  private isProcessing = false;

  constructor(loader: Loader) {
    this.loader = loader;
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
        console.error("failed to process event block after 3 retries:" + first.cid);
        this.queue = this.queue.filter(({ cid }) => cid !== first.cid);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
      console.error(JSON.stringify(err));
      throw err;
    } finally {
      this.isProcessing = false;
      if (this.queue.length > 0) {
        void this.processQueue();
      }
    }
  }
}
