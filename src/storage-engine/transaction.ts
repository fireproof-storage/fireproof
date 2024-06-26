import { MemoryBlockstore } from "@web3-storage/pail/block";
import { BlockFetcher as BlockFetcherApi } from "@web3-storage/pail/api";

import { AnyAnyLink, AnyBlock, AnyLink, CarMakeable, DbMeta, MetaType, StoreRuntime, StoreOpts, TransactionMeta } from "./types.js";

import { Loader } from "./loader.js";
import type { CID, Block, Version } from "multiformats";
import { CryptoOpts } from "./types.js";
import { falsyToUndef } from "../types.js";
import { toCryptoOpts } from "../runtime/crypto.js";
import { toStoreRuntime } from "./store-factory.js";

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

export function defaultedBlockstoreRuntime(opts: BlockstoreOpts): BlockstoreRuntime {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    applyMeta: (meta: TransactionMeta, snap?: boolean): Promise<void> => {
      return Promise.resolve();
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    compact: async (blocks: CompactionFetcher) => {
      return {} as unknown as MetaType;
    },
    autoCompact: 100,
    public: false,
    name: undefined,
    threshold: 1000 * 1000,
    ...opts,
    crypto: toCryptoOpts(opts.crypto),
    store: toStoreRuntime(opts.store),
  };
}

export class BaseBlockstore implements BlockFetcher {
  readonly transactions = new Set<CarTransaction>();
  readonly ebOpts: BlockstoreRuntime;
  // ready: Promise<void>;
  xready(): Promise<void> {
    return Promise.resolve();
  }

  constructor(ebOpts: BlockstoreOpts = {}) {
    this.ebOpts = defaultedBlockstoreRuntime(ebOpts);
  }

  async get<T, C extends number, A extends number, V extends Version>(cid: AnyAnyLink): Promise<Block<T, C, A, V> | undefined> {
    if (!cid) throw new Error("required cid");
    for (const f of this.transactions) {
      // if (Math.random() < 0.001) console.log('get', cid.toString(), this.transactions.size)
      const v = await f.superGet(cid);
      if (v) return v as Block<T, C, A, V>;
    }
  }

  lastTxMeta?: unknown; // TransactionMeta

  async transaction<M extends MetaType>(fn: (t: CarTransaction) => Promise<M>): Promise<M> {
    const t = new CarTransaction(this);
    const done: M = await fn(t);
    this.lastTxMeta = done;
    return { t, ...done };
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
  xready(): Promise<void> {
    return this.loader.xready();
  }
  compacting = false;

  constructor(ebOpts: BlockstoreOpts) {
    super(ebOpts);
    const { name } = ebOpts;
    if (!name) {
      throw new Error("name required");
    }
    this.name = name;
    this.loader = new Loader(this.name, this.ebOpts);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async put(cid: AnyAnyLink, block: Uint8Array): Promise<void> {
    throw new Error("use a transaction to put");
  }

  async get<T, C extends number, A extends number, V extends Version>(cid: AnyAnyLink): Promise<Block<T, C, A, V> | undefined> {
    const got = await super.get(cid);
    if (got) return got as Block<T, C, A, V>;
    if (!this.loader) {
      return;
    }
    return falsyToUndef(await this.loader.getBlock(cid)) as Block<T, C, A, V>;
  }

  async transaction<M extends MetaType>(fn: (t: CarTransaction) => Promise<M>, opts = { noLoader: false }): Promise<M> {
    // @ts-expect-error - need to make a type for transaction return vs its inner function return
    const { t, ...done }: M = await super.transaction<M>(fn, opts);
    const cars = await this.loader.commit(t, done, opts);
    if (this.ebOpts.autoCompact && this.loader.carLog.length > this.ebOpts.autoCompact) {
      setTimeout(() => void this.compact(), 10);
    }
    if (cars) {
      this.transactions.delete(t);
      // @ts-expect-error - need to make a type for transaction return vs its inner function return
      return { ...done, cars };
    }
    throw new Error("failed to commit car files");
  }

  async getFile(car: AnyLink, cid: AnyLink, isPublic = false): Promise<Uint8Array> {
    await this.xready();
    if (!this.loader) throw new Error("loader required to get file");
    const reader = await this.loader.loadFileCar(car, isPublic);
    const block = await reader.get(cid as CID);
    if (!block) throw new Error(`Missing block ${cid.toString()}`);
    return block.bytes;
  }

  async compact() {
    await this.xready();
    if (!this.loader) throw new Error("loader required to compact");
    if (this.loader.carLog.length < 2) return;
    const compactFn = this.ebOpts.compact || ((blocks: CompactionFetcher) => this.defaultCompact(blocks));
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

  async defaultCompact(blocks: CompactionFetcher): Promise<TransactionMeta> {
    // console.log('eb compact')
    if (!this.loader) {
      throw new Error("no loader");
    }
    if (!this.lastTxMeta) {
      throw new Error("no lastTxMeta");
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
  blockstore: EncryptedBlockstore;
  // loader: Loader | null = null
  loggedBlocks: CarTransaction;

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

export type CompactFn = (blocks: CompactionFetcher) => Promise<MetaType>;

export interface BlockstoreOpts {
  readonly applyMeta?: (meta: TransactionMeta, snap?: boolean) => Promise<void>;
  readonly compact?: CompactFn;
  readonly autoCompact?: number;
  readonly crypto?: CryptoOpts;
  readonly store?: StoreOpts;
  readonly public?: boolean;
  readonly meta?: DbMeta;
  readonly name?: string;
  readonly threshold?: number;
}

export interface BlockstoreRuntime {
  readonly applyMeta: (meta: TransactionMeta, snap?: boolean) => Promise<void>;
  readonly compact: CompactFn;
  readonly autoCompact: number;
  readonly crypto: CryptoOpts;
  readonly store: StoreRuntime;
  readonly public: boolean;
  readonly meta?: DbMeta;
  readonly name?: string;
  readonly threshold: number;
}
