import { EventBlock } from '@alanshaw/pail/src/clock';
import { AnyLink, Loader } from '@fireproof/core';

export class TaskManager {
  private eventsWeHandled: Set<string> = new Set();
  private queue: any[] = [];
  private isProcessing: boolean = false;

  async handleEvent(eventBlock: DbMetaEventBlock, loader: Loader) {
    const cid = eventBlock.cid.toString();
    const parents = eventBlock.value.parents.map((cid: AnyLink) => cid.toString());
    for (const parent of parents) {
      this.eventsWeHandled.add(parent);
    }
    this.queue.push({ cid, eventBlock, loader });
    this.queue = this.queue.filter(({ cid }) => !this.eventsWeHandled.has(cid));
    void this.processQueue();
  }
  // change this to run one at a time and refilter between each run
  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      const filteredQueue = this.queue.filter(({ cid }) => !this.eventsWeHandled.has(cid));
      const dbMetas = filteredQueue.map(
        ({ eventBlock }) => eventBlock.value.data.dbMeta as Uint8Array
      );
      if (!dbMetas.length) return;
      await filteredQueue[0]?.loader?.remoteMetaStore?.handleByteHeads(dbMetas);
      filteredQueue.forEach(({ cid }) => this.eventsWeHandled.add(cid));
      this.queue = this.queue.filter(({ cid }) => !this.eventsWeHandled.has(cid));
    } catch (err) {
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
export type DbMetaEventBlock = EventBlock<{ dbMeta: Uint8Array} >

