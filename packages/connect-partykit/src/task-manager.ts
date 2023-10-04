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

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      const filteredQueue = this.queue.filter(({ cid }) => !this.eventsWeHandled.has(cid));
      const first = filteredQueue[0]
      await first.loader?.remoteMetaStore?.handleByteHeads(first.eventBlock.value.data.dbMeta)
      this.eventsWeHandled.add(first.cid)
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

