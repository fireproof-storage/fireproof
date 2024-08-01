import { MemoryBlockstore } from "@web3-storage/pail/block";
import { BlockFetcher as BlockFetcherApi } from "@web3-storage/pail/api";

import {
  AnyAnyLink,
  AnyBlock,
  AnyLink,
  CarMakeable,
  TransactionMeta,
  TransactionWrapper,
  BlockstoreOpts,
  BlockstoreRuntime,
} from "./types.js";

import { Loader } from "./loader.js";
import type { CID, Block, Version } from "multiformats";
import { falsyToUndef } from "../types.js";
import { toCryptoRuntime } from "../runtime/crypto.js";
import { toStoreRuntime } from "./store-factory.js";
import { Logger } from "@adviser/cement";
import { ensureLogger } from "../utils.js";

export type BlockFetcher = BlockFetcherApi;

export class CarTransaction extends MemoryBlockstore implements CarMakeable {
  readonly parent: BaseBlockstore;
  constructor(parent: BaseBlockstore, opts = { add: true }) {
    super();
    if (opts.add) {
      parent.transactions.add(this);
    }
    this.parent = parent;
  }

  async get<T, C extends number, A extends number, V extends Version>(cid: AnyLink): Promise<Block<T, C, A, V> | undefined> {
    return ((await this.superGet(cid)) || falsyToUndef(await this.parent.get(cid))) as Block<T, C, A, V>;
  }

  async superGet(cid: AnyLink): Promise<AnyBlock | undefined> {
    return super.get(cid);
  }
}

export function defaultedBlockstoreRuntime(
  opts: BlockstoreOpts,
  component: string,
  ctx?: Record<string, unknown>,
): BlockstoreRuntime {
  const logger = ensureLogger(opts, component, ctx);
  const store = opts.store || {};
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    applyMeta: (meta: TransactionMeta, snap?: boolean): Promise<void> => {
      return Promise.resolve();
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    compact: async (blocks: BlockFetcher) => {
      return {} as unknown as TransactionMeta;
    },
    autoCompact: 100,
    public: false,
    name: undefined,
    threshold: 1000 * 1000,
    ...opts,
    logger,
    keyBag: opts.keyBag || {},
    crypto: toCryptoRuntime(opts.crypto),
    store,
    storeRuntime: toStoreRuntime(store, logger),
  };
}

const blockstoreFactory = function (opts: BlockstoreOpts): BaseBlockstore | EncryptedBlockstore {
  if (opts.name) {
    return new EncryptedBlockstore(opts);
  } else {
    return new BaseBlockstore(opts);
  }
};

export { blockstoreFactory };

export class BaseBlockstore implements BlockFetcher {
  readonly transactions = new Set<CarTransaction>();
  readonly ebOpts: BlockstoreRuntime;

  readonly loader?: Loader;
  readonly name?: string;

  // ready: Promise<void>;
  ready(): Promise<void> {
    return Promise.resolve();
  }

  async close(): Promise<void> {
    // no-op
  }

  async destroy(): Promise<void> {
    // no-op
  }

  readonly logger: Logger;
  constructor(ebOpts: BlockstoreOpts = {}) {
    // console.log("BaseBlockstore", ebOpts)
    this.ebOpts = defaultedBlockstoreRuntime(ebOpts, "BaseBlockstore");
    this.logger = this.ebOpts.logger;
  }

  async get<T, C extends number, A extends number, V extends Version>(cid: AnyAnyLink): Promise<Block<T, C, A, V> | undefined> {
    if (!cid) throw this.logger.Error().Msg("required cid").AsError();
    for (const f of this.transactions) {
      // if (Math.random() < 0.001) console.log('get', cid.toString(), this.transactions.size)
      const v = await f.superGet(cid);
      if (v) return v as Block<T, C, A, V>;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async put(cid: AnyAnyLink, block: Uint8Array): Promise<void> {
    throw this.logger.Error().Msg("use a transaction to put").AsError();
  }

  lastTxMeta?: unknown; // TransactionMeta

  async transaction<M extends TransactionMeta>(
    fn: (t: CarTransaction) => Promise<M>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _opts = {},
  ): Promise<TransactionWrapper<M>> {
    const t = new CarTransaction(this);
    const done: M = await fn(t);
    this.lastTxMeta = done;
    return { t, meta: done };
  }

  async *entries(): AsyncIterableIterator<AnyBlock> {
    const seen = new Set<string>();
    for (const t of this.transactions) {
      for await (const blk of t.entries()) {
        if (seen.has(blk.cid.toString())) continue;
        seen.add(blk.cid.toString());
        yield blk;
      }
    }
  }
}

export class EncryptedBlockstore extends BaseBlockstore {
  readonly name: string;
  readonly loader: Loader;

  ready(): Promise<void> {
    return this.loader.ready();
  }

  close(): Promise<void> {
    return this.loader.close();
  }

  destroy(): Promise<void> {
    return this.loader.destroy();
  }

  compacting = false;
  readonly logger: Logger;

  constructor(ebOpts: BlockstoreOpts) {
    super(ebOpts);
    this.logger = ensureLogger(ebOpts, "EncryptedBlockstore");
    const { name } = ebOpts;
    if (!name) {
      throw this.logger.Error().Msg("name required").AsError();
    }
    this.name = name;
    this.loader = new Loader(this.name, ebOpts);
  }

  async get<T, C extends number, A extends number, V extends Version>(cid: AnyAnyLink): Promise<Block<T, C, A, V> | undefined> {
    const got = await super.get(cid);
    if (got) return got as Block<T, C, A, V>;
    if (!this.loader) {
      return;
    }
    return falsyToUndef(await this.loader.getBlock(cid)) as Block<T, C, A, V>;
  }

  async transaction<M extends TransactionMeta>(
    fn: (t: CarTransaction) => Promise<M>,
    opts = { noLoader: false },
  ): Promise<TransactionWrapper<M>> {
    const { t, meta: done } = await super.transaction<M>(fn);
    const cars = await this.loader.commit<M>(t, done, opts);
    if (this.ebOpts.autoCompact && this.loader.carLog.length > this.ebOpts.autoCompact) {
      setTimeout(() => void this.compact(), 10);
    }
    if (cars) {
      this.transactions.delete(t);
      return { meta: done, cars, t };
    }
    throw this.logger.Error().Msg("failed to commit car files").AsError();
  }

  async getFile(car: AnyLink, cid: AnyLink /*, isPublic = false*/): Promise<Uint8Array> {
    await this.ready();
    if (!this.loader) throw this.logger.Error().Msg("loader required to get file, database must be named").AsError();
    const reader = await this.loader.loadFileCar(car /*, isPublic */);
    const block = await reader.get(cid as CID);
    if (!block) throw this.logger.Error().Str("cid", cid.toString()).Msg(`Missing block`).AsError();
    return block.bytes;
  }

  async compact() {
    await this.ready();
    if (!this.loader) throw this.logger.Error().Msg("loader required to compact").AsError();
    if (this.loader.carLog.length < 2) return;
    const compactFn = this.ebOpts.compact || ((blocks: CompactionFetcher) => this.defaultCompact(blocks, this.logger));
    if (!compactFn || this.compacting) return;
    const blockLog = new CompactionFetcher(this);
    this.compacting = true;
    const meta = await compactFn(blockLog);
    await this.loader?.commit(blockLog.loggedBlocks, meta, {
      compact: true,
      noLoader: true,
    });
    this.compacting = false;
  }

  async defaultCompact(blocks: CompactionFetcher, logger: Logger): Promise<TransactionMeta> {
    // console.log('eb compact')
    if (!this.loader) {
      throw logger.Error().Msg("no loader").AsError();
    }
    if (!this.lastTxMeta) {
      throw logger.Error().Msg("no lastTxMeta").AsError();
    }
    for await (const blk of this.loader.entries(false)) {
      blocks.loggedBlocks.putSync(blk.cid, blk.bytes);
    }
    for (const t of this.transactions) {
      for await (const blk of t.entries()) {
        blocks.loggedBlocks.putSync(blk.cid, blk.bytes);
      }
    }
    return this.lastTxMeta as TransactionMeta;
  }

  async *entries(): AsyncIterableIterator<AnyBlock> {
    // const seen = new Set<string>();
    for await (const blk of this.loader.entries()) {
      // if (seen.has(blk.cid.toString())) continue
      // seen.add(blk.cid.toString())
      yield blk;
    }
  }
}

export class CompactionFetcher implements BlockFetcher {
  readonly blockstore: EncryptedBlockstore;
  // loader: Loader | null = null
  readonly loggedBlocks: CarTransaction;

  constructor(blocks: EncryptedBlockstore) {
    this.blockstore = blocks;
    // this.loader = blocks.loader
    this.loggedBlocks = new CarTransaction(blocks);
  }

  async get<T, C extends number, A extends number, V extends Version>(cid: AnyLink): Promise<Block<T, C, A, V> | undefined> {
    const block = await this.blockstore.get(cid);
    if (block) this.loggedBlocks.putSync(cid, block.bytes);
    return falsyToUndef(block) as Block<T, C, A, V>;
  }
}
