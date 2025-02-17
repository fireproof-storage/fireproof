import { advance } from "@fireproof/vendor/@web3-storage/pail/clock";
import { root } from "@fireproof/vendor/@web3-storage/pail/crdt";
import { Logger, ResolveOnce } from "@adviser/cement";

import { clockChangesSince } from "./crdt-helpers.js";
import type { DocUpdate, ClockHead, DocTypes, VoidFn, UnReg, SuperThis, BaseBlockstore, CarTransaction } from "./types.js";
import { applyHeadQueue, ApplyHeadQueue } from "./apply-head-queue.js";
import { ensureLogger } from "./utils.js";

export class CRDTClockImpl {
  // todo: track local and remote clocks independently, merge on read
  // that way we can drop the whole remote if we need to
  // should go with making sure the local clock only references locally available blockstore on write
  readonly head: ClockHead = [];

  readonly zoomers = new Map<string, VoidFn>();
  readonly watchers = new Map<string, (updates: DocUpdate<DocTypes>[]) => void>();
  readonly emptyWatchers = new Map<string, VoidFn>();

  readonly blockstore: BaseBlockstore;

  readonly applyHeadQueue: ApplyHeadQueue<DocTypes>;
  transaction?: CarTransaction;

  readonly _ready: ResolveOnce<void> = new ResolveOnce<void>();
  async ready(): Promise<void> {
    return this._ready.once(async () => {
      await this.blockstore.ready();
    });
  }

  async close() {
    await this.blockstore.close();
  }

  readonly logger: Logger;
  readonly sthis: SuperThis;
  constructor(blockstore: BaseBlockstore) {
    this.sthis = blockstore.sthis;
    this.blockstore = blockstore;
    this.logger = ensureLogger(blockstore.sthis, "CRDTClock");
    this.applyHeadQueue = applyHeadQueue(this.int_applyHead.bind(this), this.logger);
  }

  setHead(head: ClockHead) {
    // this.head = head;
    this.head.splice(0, this.head.length, ...head);
  }

  async applyHead(newHead: ClockHead, prevHead: ClockHead, updates?: DocUpdate<DocTypes>[]): Promise<void> {
    for await (const { updates: updatesAcc, all } of this.applyHeadQueue.push({
      newHead,
      prevHead,
      updates,
    })) {
      return this.processUpdates(updatesAcc, all, prevHead);
    }
  }

  async processUpdates(updatesAcc: DocUpdate<DocTypes>[], all: boolean, prevHead: ClockHead) {
    let internalUpdates = updatesAcc;
    if (this.watchers.size && !all) {
      const changes = await clockChangesSince<DocTypes>(this.blockstore, this.head, prevHead, {}, this.logger);
      internalUpdates = changes.result;
    }
    this.zoomers.forEach((fn) => fn());
    this.notifyWatchers(internalUpdates || []);
  }

  notifyWatchers(updates: DocUpdate<DocTypes>[]) {
    this.emptyWatchers.forEach((fn) => fn());
    this.watchers.forEach((fn) => fn(updates || []));
  }

  onTick(fn: (updates: DocUpdate<DocTypes>[]) => void): UnReg {
    const key = this.sthis.timeOrderedNextId().str;
    this.watchers.set(key, fn);
    return () => {
      this.watchers.delete(key);
    };
  }

  onTock(fn: VoidFn): UnReg {
    const key = this.sthis.timeOrderedNextId().str;
    this.emptyWatchers.set(key, fn);
    return () => {
      this.emptyWatchers.delete(key);
    };
  }

  onZoom(fn: VoidFn): UnReg {
    const key = this.sthis.timeOrderedNextId().str;
    this.zoomers.set(key, fn);
    return () => {
      this.zoomers.delete(key);
    };
  }

  async int_applyHead(newHead: ClockHead, prevHead: ClockHead, localUpdates: boolean) {
    // if (!(this.head && prevHead && newHead)) {
    //   throw new Error("missing head");
    // }

    console.log("int_applyHead:1") 
    const noLoader = !localUpdates;

    // console.log("int_applyHead", this.applyHeadQueue.size(), this.head, newHead, prevHead, localUpdates);
    const ogHead = sortClockHead(this.head);
    console.log("int_applyHead:2") 
    newHead = sortClockHead(newHead);
    console.log("int_applyHead:3") 
    if (compareClockHeads(ogHead, newHead)) {
      console.log("int_applyHead:4") 
      return;
    }
    console.log("int_applyHead:5") 
    const ogPrev = sortClockHead(prevHead);
    console.log("int_applyHead:6") 
    if (compareClockHeads(ogHead, ogPrev)) {
      console.log("int_applyHead:7") 
      this.setHead(newHead);
      return;
    }

    // const noLoader = this.head.length === 1 && !updates?.length
    console.log("int_applyHead:8") 
    if (!this.blockstore) {
      throw this.logger.Error().Msg("missing blockstore").AsError();
    }
    console.log("int_applyHead:9") 
    await validateBlocks(this.logger, newHead, this.blockstore);
    console.log("int_applyHead:10") 
    if (!this.transaction) {
      this.transaction = this.blockstore.openTransaction({ noLoader, add: false });
    }
    const tblocks = this.transaction;

    console.log("int_applyHead:11") 
    const advancedHead = await advanceBlocks(this.logger, newHead, tblocks, this.head);
    console.log("int_applyHead:12", tblocks, advancedHead) 
    const result = await root(tblocks, advancedHead);
    console.log("int_applyHead:12.x", result.additions.length) 
    for (const { cid, bytes } of [
      ...result.additions,
      // ...result.removals
    ]) {
      console.log("int_applyHead:12.y", result.additions.length) 
      tblocks.putSync(cid, bytes);
    }
    console.log("int_applyHead:12.1") 
    if (!noLoader) {
      console.log("int_applyHead:13") 
      await this.blockstore.commitTransaction(tblocks, { head: advancedHead }, { add: false, noLoader });
      console.log("int_applyHead:14") 
      this.transaction = undefined;
    }
    this.setHead(advancedHead);
  }
}

// Helper functions
function sortClockHead(clockHead: ClockHead) {
  return clockHead.sort((a, b) => a.toString().localeCompare(b.toString()));
}

async function validateBlocks(logger: Logger, newHead: ClockHead, blockstore?: BaseBlockstore) {
  if (!blockstore) throw logger.Error().Msg("missing blockstore");
  newHead.map(async (cid) => {
    const got = await blockstore.get(cid);
    if (!got) {
      throw logger.Error().Str("cid", cid.toString()).Msg("int_applyHead missing block").AsError();
    }
  });
}

function compareClockHeads(head1: ClockHead, head2: ClockHead) {
  return head1.toString() === head2.toString();
}

async function advanceBlocks(logger: Logger, newHead: ClockHead, tblocks: CarTransaction, head: ClockHead) {
  for (const cid of newHead) {
    try {
      console.log("advanceBlocks:1", cid.toString(), newHead.length)
      head = await advance(tblocks, head, cid);
      console.log("advanceBlocks:2", cid.toString(), head)
    } catch (e) {
      logger.Error().Err(e).Msg("failed to advance head");
      // console.log('failed to advance head:', cid.toString(), e)
      continue;
    }
  }
  return head;
}
