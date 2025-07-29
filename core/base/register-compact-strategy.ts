import { exception2Result, Result } from "@adviser/cement";
import { CompactStrategyContext, CompactStrategy, HasLogger, TransactionMeta } from "@fireproof/core-types-base";
import { anyBlock2FPBlock } from "@fireproof/core-blockstore/loader-helpers.js";
import { clockChangesSince, getAllEntries, toPailFetcher } from "./crdt-helpers.js";
import { vis } from "@web3-storage/pail/clock";
import { root } from "@web3-storage/pail/crdt";

const compactStrategyRegistry = new Map<string, CompactStrategy>();

export function registerCompactStrategy(compactStrategy: CompactStrategy): () => void {
  const key = compactStrategy.name.toLowerCase();
  if (compactStrategyRegistry.has(key)) {
    throw new Error(`compactStrategy ${compactStrategy.name} already registered`);
  }
  compactStrategyRegistry.set(key, compactStrategy);
  return () => {
    compactStrategyRegistry.delete(key);
  };
}

export function getCompactStrategy(name = "fireproof"): Result<CompactStrategy> {
  return exception2Result(() => getCompactStrategyThrow(name));
}

export function getCompactStrategyThrow(name = "fireproof"): CompactStrategy {
  const key = name.toLowerCase();
  if (!compactStrategyRegistry.has(key)) {
    throw new Error(`compactStrategy ${name} not found`);
  }
  return compactStrategyRegistry.get(key) as CompactStrategy;
}

function time({ logger }: HasLogger, tag: string) {
  logger.Debug().TimerStart(tag).Msg("Timing started");
}

function timeEnd({ logger }: HasLogger, tag: string) {
  logger.Debug().TimerEnd(tag).Msg("Timing ended");
}

registerCompactStrategy({
  name: "fireproof",
  compact: async (ctx: CompactStrategyContext) => {
    const head = ctx.clock?.head || [];
    time(ctx, "compact head");
    for (const cid of head) {
      const bl = await ctx.get(cid);
      if (!bl) throw ctx.logger.Error().Ref("cid", cid).Msg("Missing head block").AsError();
    }
    timeEnd(ctx, "compact head");

    // for await (const blk of  blocks.entries()) {
    //   const bl = await blockLog.get(blk.cid)
    //   if (!bl) throw new Error('Missing tblock: ' + blk.cid.toString())
    // }

    // todo maybe remove
    // for await (const blk of blocks.loader!.entries()) {
    //   const bl = await blockLog.get(blk.cid)
    //   if (!bl) throw new Error('Missing db block: ' + blk.cid.toString())
    // }

    time(ctx, "compact all entries");
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _entry of getAllEntries(ctx, head, ctx.logger)) {
      // result.push(entry)
      // void 1;
      // continue;
    }
    timeEnd(ctx, "compact all entries");

    // time("compact crdt entries")
    // for await (const [, link] of entries(blockLog, head)) {
    //   const bl = await blockLog.get(link)
    //   if (!bl) throw new Error('Missing entry block: ' + link.toString())
    // }
    // timeEnd("compact crdt entries")

    time(ctx, "compact clock vis");
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _line of vis(toPailFetcher(ctx), head)) {
      void 1;
    }
    timeEnd(ctx, "compact clock vis");

    time(ctx, "compact root");
    const result = await root(toPailFetcher(ctx), head);
    timeEnd(ctx, "compact root");

    time(ctx, "compact root blocks");
    for (const block of [...result.additions, ...result.removals]) {
      ctx.loggedBlocks.putSync(await anyBlock2FPBlock(block));
    }
    timeEnd(ctx, "compact root blocks");

    time(ctx, "compact changes");
    await clockChangesSince(ctx, head, [], {}, ctx.logger);
    timeEnd(ctx, "compact changes");

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
    return {} as TransactionMeta;
  },
});
