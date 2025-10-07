import { CompactStrategyContext, TransactionMeta } from "@fireproof/core-types-base";
import { anyBlock2FPBlock } from "@fireproof/core-blockstore/loader-helpers.js";
import { clockChangesSince, getAllEntries, toPailFetcher } from "./crdt-helpers.js";
import { vis } from "@web3-storage/pail/clock";
import { root } from "@web3-storage/pail/crdt";
import { registerCompactStrategy, timerEnd, timerStart } from "@fireproof/core-runtime";

registerCompactStrategy({
  name: "fireproof",
  compact: async (ctx: CompactStrategyContext) => {
    const head = ctx.clock?.head ?? [];
    timerStart(ctx, "compact head");
    for (const cid of head) {
      const bl = await ctx.get(cid);
      if (!bl) throw ctx.logger.Error().Ref("cid", cid).Msg("Missing head block").AsError();
    }
    timerEnd(ctx, "compact head");

    // for await (const blk of  blocks.entries()) {
    //   const bl = await blockLog.get(blk.cid)
    //   if (!bl) throw new Error('Missing tblock: ' + blk.cid.toString())
    // }

    // todo maybe remove
    // for await (const blk of blocks.loader!.entries()) {
    //   const bl = await blockLog.get(blk.cid)
    //   if (!bl) throw new Error('Missing db block: ' + blk.cid.toString())
    // }

    timerStart(ctx, "compact all entries");

    for await (const _entry of getAllEntries(ctx, head, ctx.logger)) {
      // result.push(entry)
      // void 1;
      // continue;
    }
    timerEnd(ctx, "compact all entries");

    // timerStart("compact crdt entries")
    // for await (const [, link] of entries(blockLog, head)) {
    //   const bl = await blockLog.get(link)
    //   if (!bl) throw new Error('Missing entry block: ' + link.toString())
    // }
    // timerEnd("compact crdt entries")

    timerStart(ctx, "compact clock vis");

    for await (const _line of vis(toPailFetcher(ctx), head)) {
      void 1;
    }
    timerEnd(ctx, "compact clock vis");

    timerStart(ctx, "compact root");
    const result = await root(toPailFetcher(ctx), head);
    timerEnd(ctx, "compact root");

    timerStart(ctx, "compact root blocks");
    for (const block of [...result.additions, ...result.removals]) {
      ctx.loggedBlocks.putSync(await anyBlock2FPBlock(block));
    }
    timerEnd(ctx, "compact root blocks");

    timerStart(ctx, "compact changes");
    await clockChangesSince(ctx, head, [], {}, ctx.logger);
    timerEnd(ctx, "compact changes");

    return { head: ctx.clock?.head } as TransactionMeta;
  },
});

registerCompactStrategy({
  name: "full",
  compact: async (ctx: CompactStrategyContext) => {
    if (!ctx.lastTxMeta) {
      throw ctx.logger.Error().Msg("no lastTxMeta").AsError();
    }
    for await (const blk of ctx.loader.entries(false)) {
      ctx.loggedBlocks.putSync(blk);
    }
    for (const t of ctx.transactions) {
      for await (const blk of t.entries()) {
        ctx.loggedBlocks.putSync(blk);
      }
    }
    return ctx.lastTxMeta as TransactionMeta;
  },
});

registerCompactStrategy({
  name: "no-op",
  compact: async () => {
    // do nothing
    await Promise.resolve();
    return {} as TransactionMeta;
  },
});
