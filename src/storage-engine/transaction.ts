import { MemoryBlockstore } from "@web3-storage/pail/block";
// todo get these from multiformats?
import { BlockFetcher as BlockFetcherAPI } from "@web3-storage/pail/api";

import { AnyAnyBlock, AnyAnyLink, AnyBlock, AnyLink, CarMakeable, DbMeta, MetaType, TransactionMeta } from "./types";

import { Loader } from "./loader";
import type { CID } from "multiformats";
import { CryptoOpts, StoreOpts } from "./types";

export type BlockFetcher = BlockFetcherAPI;

export class CarTransaction extends MemoryBlockstore implements CarMakeable {
  readonly parent: EncryptedBlockstore;
  constructor(parent: EncryptedBlockstore, opts = { add: true }) {
    super();
    if (opts.add) {
      parent.transactions.add(this);
    }
    this.parent = parent;
  }

  async get(cid: AnyAnyLink): Promise<AnyAnyBlock | undefined> {
    return (await this.superGet(cid)) || this.parent.get(cid);
  }

  async superGet(cid: AnyLink): Promise<AnyBlock | undefined> {
    return super.get(cid);
  }
}

export class EncryptedBlockstore implements BlockFetcher {
  readonly ready: Promise<void>;
  readonly name?: string;
  readonly _loader?: Loader;

  get loader(): Loader {
    if (!this._loader) throw new Error("loader not ready");
    return this._loader;
  }

  readonly ebOpts: BlockstoreOpts;
  readonly transactions = new Set<CarTransaction>();
  lastTxMeta?: unknown; // TransactionMeta
  compacting = false;

  constructor(ebOpts: BlockstoreOpts) {
    this.ebOpts = ebOpts;
    const { name } = ebOpts;
    if (name) {
      this.name = name;
      this._loader = new Loader(name, this.ebOpts);
      this.ready = this.loader.ready;
    } else {
      this.ready = Promise.resolve();
    }
  }

  async transaction<M extends MetaType>(fn: (t: CarTransaction) => Promise<M>, opts = { noLoader: false }): Promise<M> {
    const t = new CarTransaction(this);
    const done: M = await fn(t);
    this.lastTxMeta = done;
    if (this.loader) {
      const cars = await this.loader.commit(t, done, opts);
      if (this.ebOpts.autoCompact && this.loader.carLog.length > this.ebOpts.autoCompact) {
        setTimeout(() => void this.compact(), 10);
      }
      if (cars) {
        this.transactions.delete(t);
        return { ...done, cars };
      }
      throw new Error("failed to commit car");
    }
    return done;
  }

  async put(cid: AnyAnyLink, block: Uint8Array): Promise<void> {
    throw new Error("use a transaction to put");
  }

  async get(cid: AnyAnyLink): Promise<AnyAnyBlock | undefined> {
    if (!cid) throw new Error("required cid");
    for (const f of this.transactions) {
      // if (Math.random() < 0.001) console.log('get', cid.toString(), this.transactions.size)
      const v = await f.superGet(cid);
      if (v) return v;
    }
    if (!this.loader) return;
    return await this.loader.getBlock(cid);
  }

  async getFile(car: AnyLink, cid: AnyLink, isPublic = false): Promise<Uint8Array> {
    await this.ready;
    if (!this.loader) throw new Error("loader required to get file");
    const reader = await this.loader.loadFileCar(car, isPublic);
    const block = await reader.get(cid as CID);
    if (!block) throw new Error(`Missing block ${cid.toString()}`);
    return block.bytes;
  }

  async compact() {
    await this.ready;
    if (!this.loader) throw new Error("loader required to compact");
    if (this.loader.carLog.length < 2) return;
    const compactFn = this.ebOpts.compact || ((blocks: CompactionFetcher) => this.defaultCompact(blocks));
    if (!compactFn || this.compacting) return;
    const blockLog = new CompactionFetcher(this);
    this.compacting = true;
    const meta = await compactFn(blockLog);
    await this.loader!.commit(blockLog.loggedBlocks, meta, {
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
    const seen = new Set<string>();
    if (this.loader) {
      for await (const blk of this.loader.entries()) {
        // if (seen.has(blk.cid.toString())) continue
        // seen.add(blk.cid.toString())
        yield blk;
      }
    } else {
      for (const t of this.transactions) {
        for await (const blk of t.entries()) {
          if (seen.has(blk.cid.toString())) continue;
          seen.add(blk.cid.toString());
          yield blk;
        }
      }
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

  async get(cid: AnyLink): Promise<AnyAnyBlock | undefined> {
    const block = await this.blockstore.get(cid);
    if (block) this.loggedBlocks.putSync(cid, block.bytes);
    return block;
  }
}

export type CompactFn = (blocks: CompactionFetcher) => Promise<MetaType>;

export interface BlockstoreOpts {
  readonly applyMeta?: (meta: TransactionMeta, snap?: boolean) => Promise<void>;
  readonly compact?: CompactFn;
  readonly autoCompact?: number;
  readonly crypto: CryptoOpts;
  readonly store: StoreOpts;
  readonly public?: boolean;
  readonly meta?: DbMeta;
  readonly name?: string;
  readonly threshold?: number;
}
