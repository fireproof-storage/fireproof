import { MemoryBlockstore } from "@fireproof/vendor/@web3-storage/pail/block";
import { BlockFetcher as BlockFetcherApi } from "@fireproof/vendor/@web3-storage/pail/api";

import {
  AnyAnyLink,
  AnyBlock,
  AnyLink,
  CarMakeable,
  TransactionMeta,
  TransactionWrapper,
  BlockstoreOpts,
  BlockstoreRuntime,
  Loadable,
} from "./types.js";

import { Loader } from "./loader.js";
import type { Block, Version, UnknownLink } from "multiformats";
import { BaseBlockstore, CarTransaction, falsyToUndef, SuperThis } from "../types.js";
import { ensureStoreEnDeFile, toStoreRuntime } from "./store-factory.js";
import { Logger, toCryptoRuntime } from "@adviser/cement";
import { ensureLogger, ensureSuperThis } from "../utils.js";

export type BlockFetcher = BlockFetcherApi;
export interface CarTransactionOpts {
  readonly add: boolean;
  readonly noLoader: boolean;
}

export class CarTransactionImpl implements CarMakeable, CarTransaction {
  readonly parent: BaseBlockstore;
  readonly #memblock = new MemoryBlockstore();
  #hackUnshift?: AnyBlock;

  constructor(parent: BaseBlockstore, opts: CarTransactionOpts = { add: true, noLoader: false }) {
    // super();
    if (opts.add) {
      parent.transactions.add(this);
    }
    this.parent = parent;
  }

  async get<T, C extends number, A extends number, V extends Version>(cid: AnyLink): Promise<Block<T, C, A, V> | undefined> {
    return ((await this.superGet(cid)) ?? falsyToUndef(await this.parent.get(cid))) as Block<T, C, A, V>;
  }

  async superGet(cid: AnyLink): Promise<AnyBlock | undefined> {
    return this.#memblock.get(cid);
  }

  async put(cid: AnyLink, block: Uint8Array): Promise<void> {
    await this.#memblock.put(cid, block);
  }

  putSync(cid: UnknownLink, bytes: Uint8Array<ArrayBufferLike>): void {
    this.#memblock.putSync(cid, bytes);
  }

  unshift(cid: UnknownLink, bytes: Uint8Array<ArrayBufferLike>): void {
    if (this.#hackUnshift) {
      throw new Error("unshift already called");
    }
    this.#hackUnshift = { cid, bytes };
  }

  async *entries(): AsyncIterableIterator<AnyBlock> {
    if (this.#hackUnshift) {
      yield this.#hackUnshift;
    }
    for await (const blk of this.#memblock.entries()) {
      yield blk;
    }
  }
}

export function defaultedBlockstoreRuntime(
  sthis: SuperThis,
  opts: BlockstoreOpts,
  component: string,
  ctx?: Record<string, unknown>,
): BlockstoreRuntime {
  const logger = ensureLogger(sthis, component, ctx);
  // const store = opts.store || {};
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
    // name: undefined,
    threshold: 1000 * 1000,
    ...opts,
    logger,
    keyBag: opts.keyBag || {},
    crypto: toCryptoRuntime(opts.crypto),
    storeUrls: opts.storeUrls,
    taskManager: {
      removeAfter: 3,
      retryTimeout: 50,
      ...opts.taskManager,
    },
    // storeEnDeFile: ensureStoreEnDeFile(opts.storeEnDeFile),
    // store,
    storeRuntime: toStoreRuntime(sthis, ensureStoreEnDeFile(opts.storeEnDeFile)),
  };
}

// export function blockstoreFactory(sthis: SuperThis, opts: BlockstoreOpts): BaseBlockstore | EncryptedBlockstore {
//   // if (opts.name) {
//   return new EncryptedBlockstore(sthis, opts);
//   // } else {
//   // return new BaseBlockstore(opts);
//   // }
// }

export class BaseBlockstoreImpl implements BlockFetcher {
  readonly transactions: Set<CarTransaction> = new Set<CarTransaction>();
  readonly ebOpts: BlockstoreRuntime;
  readonly sthis: SuperThis;

  readonly loader: Loadable;
  // readonly name?: string;

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

  async compact(): Promise<void> {
    // no-op
  }

  readonly logger: Logger;
  constructor(ebOpts: BlockstoreOpts) {
    this.sthis = ensureSuperThis(ebOpts);
    this.ebOpts = defaultedBlockstoreRuntime(this.sthis, ebOpts, "BaseBlockstore");
    this.logger = this.ebOpts.logger;
    this.loader = new Loader(this.sthis, ebOpts);
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
    _opts?: CarTransactionOpts,
  ): Promise<TransactionWrapper<M>> {
    this.logger.Debug().Msg("enter transaction");
    const t = new CarTransactionImpl(this, _opts);
    this.logger.Debug().Msg("post CarTransaction");
    const done: M = await fn(t);
    this.logger.Debug().Msg("post fn");
    this.lastTxMeta = done;
    return { t, meta: done };
  }

  openTransaction(opts: CarTransactionOpts = { add: true, noLoader: false }): CarTransaction {
    return new CarTransactionImpl(this, opts);
  }

  async commitTransaction<M extends TransactionMeta>(
    t: CarTransaction,
    done: M,
    opts: CarTransactionOpts,
  ): Promise<TransactionWrapper<M>> {
    if (!this.loader) throw this.logger.Error().Msg("loader required to commit").AsError();
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

export class EncryptedBlockstore extends BaseBlockstoreImpl {
  // readonly name: string;

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

  constructor(sthis: SuperThis, ebOpts: BlockstoreOpts) {
    super(ebOpts);
    this.logger = ensureLogger(this.sthis, "EncryptedBlockstore", {
      this: 1,
    });
  }

  async get<T, C extends number, A extends number, V extends Version>(cid: AnyAnyLink): Promise<Block<T, C, A, V> | undefined> {
    const got = await super.get(cid);
    if (got) return got as Block<T, C, A, V>;
    // if (!this.loader) {
    //   return;
    // }
    const ret = falsyToUndef(await this.loader.getBlock(cid, this.loader.attachedStores.local())) as Block<T, C, A, V>;
    return ret;
  }

  async transaction<M extends TransactionMeta>(
    fn: (t: CarTransaction) => Promise<M>,
    opts = { noLoader: false },
  ): Promise<TransactionWrapper<M>> {
    this.logger.Debug().Msg("enter transaction");
    const { t, meta: done } = await super.transaction<M>(fn);
    this.logger.Debug().Msg("post super.transaction");
    const cars = await this.loader.commit<M>(t, done, opts);
    this.logger.Debug().Msg("post this.loader.commit");
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
    if (!this.loader) throw this.logger.Error().Msg("loader required to get file, ledger must be named").AsError();
    const reader = await this.loader.loadFileCar(car /*, isPublic */, this.loader.attachedStores.local());
    const block = await reader.blocks.find((i) => i.cid.equals(cid));
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
    await this.loader.commit(blockLog.loggedBlocks, meta, {
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
    this.loggedBlocks = new CarTransactionImpl(blocks);
  }

  async get<T, C extends number, A extends number, V extends Version>(cid: AnyLink): Promise<Block<T, C, A, V> | undefined> {
    const block = await this.blockstore.get(cid);
    if (block) this.loggedBlocks.putSync(cid, block.bytes);
    return falsyToUndef(block) as Block<T, C, A, V>;
  }
}
