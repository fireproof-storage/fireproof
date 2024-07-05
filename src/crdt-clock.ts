import { advance } from "@web3-storage/pail/clock";
import { root } from "@web3-storage/pail/crdt";
import { Logger, ResolveOnce } from "@adviser/cement";

import { clockChangesSince } from "./crdt-helpers.js";
import type { BaseBlockstore, CarTransaction } from "./blockstore/index.js";
import { type DocUpdate, type ClockHead, type DocTypes, throwFalsy, CRDTMeta } from "./types.js";
import { applyHeadQueue, ApplyHeadQueue } from "./apply-head-queue.js";
import { ensureLogger } from "./utils.js";

export class CRDTClock<T extends DocTypes> {
  // todo: track local and remote clocks independently, merge on read
  // that way we can drop the whole remote if we need to
  // should go with making sure the local clock only references locally available blockstore on write
  head: ClockHead = [];

  readonly zoomers = new Set<() => void>();
  readonly watchers = new Set<(updates: DocUpdate<T>[]) => void>();
  readonly emptyWatchers = new Set<() => void>();

  readonly blockstore: BaseBlockstore;

  readonly applyHeadQueue: ApplyHeadQueue<T>;

  readonly _ready = new ResolveOnce<void>();
  async ready() {
    return this._ready.once(async () => {
      await this.blockstore.ready();
    });
  }

  async close() {
    await this.blockstore.close();
  }

  readonly logger: Logger;
  constructor(blockstore: BaseBlockstore) {
    this.blockstore = blockstore;
    this.logger = ensureLogger(blockstore.logger, "CRDTClock");
    this.applyHeadQueue = applyHeadQueue(this.int_applyHead.bind(this), this.logger);
  }

  setHead(head: ClockHead) {
    this.head = head;
  }

  async applyHead(newHead: ClockHead, prevHead: ClockHead, updates?: DocUpdate<T>[]) {
    for await (const { updates: updatesAcc, all } of this.applyHeadQueue.push({
      newHead,
      prevHead,
      updates,
    })) {
      return this.processUpdates(updatesAcc, all, prevHead);
    }
  }

  async processUpdates(updatesAcc: DocUpdate<T>[], all: boolean, prevHead: ClockHead) {
    let internalUpdates = updatesAcc;
    if (this.watchers.size && !all) {
      const changes = await clockChangesSince<T>(throwFalsy(this.blockstore), this.head, prevHead, {}, this.logger);
      internalUpdates = changes.result;
    }
    this.zoomers.forEach((fn) => fn());
    this.notifyWatchers(internalUpdates || []);
  }

  notifyWatchers(updates: DocUpdate<T>[]) {
    this.emptyWatchers.forEach((fn) => fn());
    this.watchers.forEach((fn) => fn(updates || []));
  }

  onTick(fn: (updates: DocUpdate<T>[]) => void) {
    this.watchers.add(fn);
  }

  onTock(fn: () => void) {
    this.emptyWatchers.add(fn);
  }

  onZoom(fn: () => void) {
    this.zoomers.add(fn);
  }

  async int_applyHead(newHead: ClockHead, prevHead: ClockHead, localUpdates: boolean) {
    // if (!(this.head && prevHead && newHead)) {
    //   throw new Error("missing head");
    // }
    // console.log("int_applyHead", this.applyHeadQueue.size(), this.head, newHead, prevHead, localUpdates);
    const ogHead = sortClockHead(this.head);
    newHead = sortClockHead(newHead);
    if (compareClockHeads(ogHead, newHead)) {
      return;
    }
    const ogPrev = sortClockHead(prevHead);
    if (compareClockHeads(ogHead, ogPrev)) {
      this.setHead(newHead);
      return;
    }

    const noLoader = !localUpdates;
    // const noLoader = this.head.length === 1 && !updates?.length
    if (!this.blockstore) {
      throw this.logger.Error().Msg("missing blockstore").AsError();
    }
    await validateBlocks(this.logger, newHead, this.blockstore);
    const { meta } = await this.blockstore.transaction<CRDTMeta>(
      async (tblocks: CarTransaction) => {
        const advancedHead = await advanceBlocks(this.logger, newHead, tblocks, this.head);
        const result = await root(tblocks, advancedHead);
        for (const { cid, bytes } of [
          ...result.additions,
          // ...result.removals
        ]) {
          tblocks.putSync(cid, bytes);
        }
        return { head: advancedHead };
      },
      { noLoader },
    );
    this.setHead(meta.head);
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
      head = await advance(tblocks, head, cid);
    } catch (e) {
      logger.Debug().Err(e).Msg("failed to advance head");
      // console.log('failed to advance head:', cid.toString(), e)
      continue;
    }
  }
  return head;
}
