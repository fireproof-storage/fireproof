import { Block } from "multiformats";
import { ResolveOnce } from "@adviser/cement";

import {
  EncryptedBlockstore,
  type CompactionFetcher,
  type TransactionMeta,
  type CarTransaction,
  BaseBlockstore,
} from "./block-store/index.js";
import {
  clockChangesSince,
  applyBulkUpdateToCrdt,
  getValueFromCrdt,
  readFiles,
  getAllEntries,
  clockVis,
  getBlock,
  doCompact,
} from "./crdt-helpers.js";
import type {
  DocUpdate,
  CRDTMeta,
  ClockHead,
  ConfigOpts,
  ChangesOptions,
  IdxMetaMap,
  DocValue,
  IndexKeyType,
  DocWithId,
  DocTypes,
} from "./types.js";
import { index, type Index } from "./indexer.js";
import { CRDTClock } from "./crdt-clock.js";
import { blockstoreFactory } from "./block-store/transaction.js";

export class CRDT<T extends DocTypes> {
  readonly name?: string;
  readonly opts: ConfigOpts;

  readonly onceReady = new ResolveOnce<void>();
  async ready(): Promise<void> {
    return this.onceReady.once(async () => {
      await Promise.all([this.blockstore.ready(), this.indexBlockstore.ready(), this.clock.ready()]);
    });
  }

  async close(): Promise<void> {
    await Promise.all([this.blockstore.close(), this.indexBlockstore.close(), this.clock.close()]);
  }

  async destroy(): Promise<void> {
    await Promise.all([this.blockstore.destroy(), this.indexBlockstore.destroy()]);
  }

  readonly blockstore: BaseBlockstore;
  readonly indexBlockstore: BaseBlockstore;
  readonly indexers = new Map<string, Index<IndexKeyType, NonNullable<unknown>>>();
  readonly clock: CRDTClock<T>;

  constructor(name?: string, opts: ConfigOpts = {}) {
    this.name = name;
    this.opts = opts;
    this.blockstore = blockstoreFactory({
      name: name,
      applyMeta: async (meta: TransactionMeta) => {
        const crdtMeta = meta as CRDTMeta;
        if (!crdtMeta.head) throw new Error("missing head");
        await this.clock.applyHead(crdtMeta.head, []);
      },
      compact: async (blocks: CompactionFetcher) => {
        await doCompact(blocks, this.clock.head);
        return { head: this.clock.head } as TransactionMeta;
      },
      autoCompact: this.opts.autoCompact || 100,
      crypto: this.opts.crypto,
      store: this.opts.store,
      public: this.opts.public,
      meta: this.opts.meta,
      threshold: this.opts.threshold,
    });
    this.indexBlockstore = blockstoreFactory({
      name: this.opts.indexStore && name ? name + ".idx" : undefined,
      applyMeta: async (meta: TransactionMeta) => {
        const idxCarMeta = meta as IdxMetaMap;
        if (!idxCarMeta.indexes) throw new Error("missing indexes");
        for (const [name, idx] of Object.entries(idxCarMeta.indexes)) {
          index({ _crdt: this }, name, undefined, idx);
        }
      },
      crypto: this.opts.crypto,
      store: this.opts.indexStore,
      public: this.opts.public,
    });
    this.clock = new CRDTClock<T>(this.blockstore);
    this.clock.onZoom(() => {
      for (const idx of this.indexers.values()) {
        idx._resetIndex();
      }
    });
  }

  async bulk(updates: DocUpdate<T>[]): Promise<CRDTMeta> {
    await this.ready();
    const prevHead = [...this.clock.head];

    const done = await this.blockstore.transaction<CRDTMeta>(async (blocks: CarTransaction): Promise<CRDTMeta> => {
      const { head } = await applyBulkUpdateToCrdt<T>(this.blockstore.ebOpts.store, blocks, this.clock.head, updates);
      updates = updates.map((dupdate: DocUpdate<T>) => {
        // if (!dupdate.value) throw new Error("missing value");
        readFiles(this.blockstore, { doc: dupdate.value as DocWithId<T> });
        return dupdate;
      });
      return { head };
    });
    await this.clock.applyHead(done.meta.head, prevHead, updates);
    return done.meta;
  }

  // if (snap) await this.clock.applyHead(crdtMeta.head, this.clock.head)

  async allDocs(): Promise<{ result: DocUpdate<T>[]; head: ClockHead }> {
    await this.ready();
    const result: DocUpdate<T>[] = [];
    for await (const entry of getAllEntries<T>(this.blockstore, this.clock.head)) {
      result.push(entry);
    }
    return { result, head: this.clock.head };
  }

  async vis(): Promise<string> {
    await this.ready();
    const txt: string[] = [];
    for await (const line of clockVis(this.blockstore, this.clock.head)) {
      txt.push(line);
    }
    return txt.join("\n");
  }

  async getBlock(cidString: string): Promise<Block> {
    await this.ready();
    return await getBlock(this.blockstore, cidString);
  }

  async get(key: string): Promise<DocValue<T> | null> {
    await this.ready();
    const result = await getValueFromCrdt<T>(this.blockstore, this.clock.head, key);
    if (result.del) return null;
    return result;
  }

  async changes(
    since: ClockHead = [],
    opts: ChangesOptions = {},
  ): Promise<{
    result: DocUpdate<T>[];
    head: ClockHead;
  }> {
    await this.ready();
    return await clockChangesSince<T>(this.blockstore, this.clock.head, since, opts);
  }

  async compact(): Promise<void> {
    const blocks = this.blockstore as EncryptedBlockstore;
    return await blocks.compact();
  }
}
