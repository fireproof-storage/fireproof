import { advance } from "@web3-storage/pail/clock";
import { root } from "@web3-storage/pail/crdt";
import { Logger, ResolveOnce } from "@adviser/cement";

import { clockChangesSince, toPailFetcher } from "./crdt-helpers.js";
import {
  type DocUpdate,
  type ClockHead,
  type DocTypes,
  type VoidFn,
  type UnReg,
  type SuperThis,
  type BaseBlockstore,
  type CarTransaction,
  PARAM,
} from "./types.js";
import { applyHeadQueue, ApplyHeadQueue } from "./apply-head-queue.js";
import { ensureLogger } from "./utils.js";
import { anyBlock2FPBlock } from "./blockstore/loader-helpers.js";

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
      // await this.blockstore.ready();
    });
  }

  async close() {
    // await this.blockstore.close();
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
    const oldHeadStr = this.head.map((c) => c.toString()).join(",");
    const newHeadStr = head.map((c) => c.toString()).join(",");
    this.logger
      .Debug()
      .Str("old_head", oldHeadStr)
      .Str("new_head", newHeadStr)
      .Int("old_head_length", this.head.length)
      .Int("new_head_length", head.length)
      .Bool("head_changed", oldHeadStr !== newHeadStr)
      .Msg("CLOCK-HEAD-UPDATED");
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
    updates = updates.filter((update) => update.id !== PARAM.GENESIS_CID);
    if (!updates.length) {
      return;
    }
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

    const noLoader = !localUpdates;

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

    // const noLoader = this.head.length === 1 && !updates?.length
    if (!this.blockstore) {
      throw this.logger.Error().Msg("missing blockstore").AsError();
    }
    await validateBlocks(this.logger, newHead, this.blockstore);
    if (!this.transaction) {
      this.transaction = this.blockstore.openTransaction({ noLoader, add: false });
    }
    const tblocks = this.transaction;

    const advancedHead = await advanceBlocks(this.logger, newHead, tblocks, this.head);
    const result = await root(toPailFetcher(tblocks), advancedHead);
    for (const block of [
      ...result.additions,
      // ...result.removals
    ]) {
      tblocks.putSync(await anyBlock2FPBlock(block));
    }
    if (!noLoader) {
      await this.blockstore.commitTransaction(tblocks, { head: advancedHead }, { add: false, noLoader });
      this.transaction = undefined;
    }
    const callerStack = new Error().stack?.split("\n").slice(2, 6).join("\n") || "unknown";
    this.logger
      .Debug()
      .Str("caller_stack", callerStack)
      .Str("advanced_head", advancedHead.map((c) => c.toString()).join(","))
      .Int("advanced_head_length", advancedHead.length)
      .Msg("INT-APPLY-HEAD-COMPLETE");
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
  // Add detailed logging for debugging sync issues
  const initialHeadStr = head.map((cid) => cid.toString()).join(",");
  const newHeadStr = newHead.map((cid) => cid.toString()).join(",");

  logger
    .Debug()
    .Str("initial_head", initialHeadStr)
    .Int("initial_head_length", head.length)
    .Str("new_head", newHeadStr)
    .Int("new_head_length", newHead.length)
    .Msg("ADVANCE-BLOCKS-START");

  for (const cid of newHead) {
    try {
      const cidStr = cid.toString();
      const preAdvanceHeadStr = head.map((c) => c.toString()).join(",");
      logger
        .Debug()
        .Str("processing_cid", cidStr)
        .Str("pre_advance_head", preAdvanceHeadStr)
        .Int("pre_advance_head_length", head.length)
        .Msg("ADVANCE-BLOCKS-PROCESSING");

      head = await advance(toPailFetcher(tblocks), head, cid);

      const postAdvanceHeadStr = head.map((c) => c.toString()).join(",");
      logger
        .Debug()
        .Str("processed_cid", cidStr)
        .Str("post_advance_head", postAdvanceHeadStr)
        .Int("post_advance_head_length", head.length)
        .Bool("head_changed", preAdvanceHeadStr !== postAdvanceHeadStr)
        .Msg("ADVANCE-BLOCKS-PROCESSED");
    } catch (e) {
      logger.Error().Err(e).Str("failed_cid", cid.toString()).Msg("failed to advance head");
      // console.log('failed to advance head:', cid.toString(), e)
      // continue;
    }
  }

  const finalHeadStr = head.map((cid) => cid.toString()).join(",");
  const headChanged = initialHeadStr !== finalHeadStr;

  logger
    .Debug()
    .Str("final_head", finalHeadStr)
    .Int("final_head_length", head.length)
    .Bool("head_changed", headChanged)
    .Msg("ADVANCE-BLOCKS-COMPLETE");

  return head;
}
