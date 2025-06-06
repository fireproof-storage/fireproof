import {
  AnyLink,
  CarMakeable,
  TransactionMeta,
  TransactionWrapper,
  BlockstoreOpts,
  BlockstoreRuntime,
  Loadable,
  FPBlock,
  BlockFetcher,
  isCarBlockItemReady,
} from "./types.js";
import { Loader } from "./loader.js";
import { BaseBlockstore, CarTransaction, CRDT, Falsy, falsyToUndef, SuperThis } from "../types.js";
import { ensureStoreEnDeFile, toStoreRuntime } from "./store-factory.js";
import { Logger, toCryptoRuntime } from "@adviser/cement";
import { ensureLogger, ensureSuperThis } from "../utils.js";

export interface CarTransactionOpts {
  readonly add: boolean;
  readonly noLoader: boolean;
}

export class CarTransactionImpl implements CarMakeable, CarTransaction {
  readonly parent: BaseBlockstore;
  readonly #memblock = new Map<string, FPBlock>(); // new MemoryBlockstore();
  #hackUnshift?: FPBlock;

  constructor(parent: BaseBlockstore, opts: CarTransactionOpts = { add: true, noLoader: false }) {
    // super();
    if (opts.add) {
      parent.transactions.add(this);
    }
    this.parent = parent;
  }

  async get(cid: AnyLink): Promise<FPBlock | Falsy> {
    const sg = await this.superGet(cid);
    if (sg) return sg;
    return await this.parent.get(cid);
  }

  async superGet(cid: AnyLink): Promise<FPBlock | Falsy> {
    return this.#memblock.get(cid.toString());
  }

  async put(fb: FPBlock): Promise<void> {
    return this.putSync(fb);
  }

  putSync(fb: FPBlock): void {
    // console.log("putSync", fb.cid.toString(), fb.bytes.length);
    this.#memblock.set(fb.cid.toString(), fb);
  }

  unshift(fb: FPBlock): void {
    if (this.#hackUnshift) {
      throw new Error("unshift already called");
    }
    this.#hackUnshift = fb;
  }

  async *entries(): AsyncIterableIterator<FPBlock> {
    if (this.#hackUnshift) {
      yield this.#hackUnshift;
    }
    for await (const blk of this.#memblock.values()) {
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

  readonly crdtParent?: CRDT;

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
  constructor(ebOpts: BlockstoreOpts, crdt?: CRDT) {
    this.sthis = ensureSuperThis(ebOpts);
    this.crdtParent = crdt;
    this.ebOpts = defaultedBlockstoreRuntime(this.sthis, ebOpts, "BaseBlockstore");
    this.logger = this.ebOpts.logger;
    this.loader = new Loader(this.sthis, ebOpts, this);
  }

  async get(cid: AnyLink): Promise<FPBlock | Falsy> {
    if (!cid) throw this.logger.Error().Msg("required cid").AsError();
    for (const f of this.transactions) {
      // if (Math.random() < 0.001) console.log('get', cid.toString(), this.transactions.size)
      const v = await f.superGet(cid);
      if (v) return v;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async put(fp: FPBlock): Promise<void> {
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

  async *entries(): AsyncIterableIterator<FPBlock> {
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

  constructor(sthis: SuperThis, ebOpts: BlockstoreOpts, crdt?: CRDT) {
    super(ebOpts, crdt);
    this.logger = ensureLogger(this.sthis, "EncryptedBlockstore", {
      this: 1,
    });
  }

  async get(cid: AnyLink): Promise<FPBlock | Falsy> {
    const got = await super.get(cid);
    if (got) return got;
    const ret = await this.loader.getBlock(cid, this.loader.attachedStores.local());
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
    if (!isCarBlockItemReady(reader)) {
      throw this.logger.Error().Str("cid", car.toString()).Msg("car not ready").AsError();
    }
    const block = await reader.item.value.car.blocks.find((i) => i.cid.equals(cid));
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
      blocks.loggedBlocks.putSync(blk);
    }
    for (const t of this.transactions) {
      for await (const blk of t.entries()) {
        blocks.loggedBlocks.putSync(blk);
      }
    }
    return this.lastTxMeta as TransactionMeta;
  }

  async *entries(): AsyncIterableIterator<FPBlock> {
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

  async get(cid: AnyLink): Promise<FPBlock | Falsy> {
    const block = await this.blockstore.get(cid);
    if (block) this.loggedBlocks.putSync(block); //await anyBlock2FPBlock({ cid, bytes: block.bytes }));
    return falsyToUndef(block);
  }
}
