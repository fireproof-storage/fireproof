import { EncryptedBlockstore, type CompactionFetcher, type TransactionMeta, type CarTransaction } from "./storage-engine/index.js";
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
import { Block } from "multiformats";
import { MetaType } from "./storage-engine/types.js";
import { ResolveOnce } from "./storage-engine/resolve-once.js";

export class CRDT<T extends DocTypes> {
  readonly name?: string;
  readonly opts: ConfigOpts;

  readonly onceReady = new ResolveOnce<void>();
  async xready(): Promise<void> {
    return this.onceReady.once(async () => {
      await Promise.all([this.blockstore.xready(), this.indexBlockstore.xready()]);
    });
  }

  readonly blockstore: EncryptedBlockstore;
  readonly indexBlockstore: EncryptedBlockstore;
  readonly indexers = new Map<string, Index<IndexKeyType, NonNullable<unknown>>>();
  readonly clock: CRDTClock<T>;

  constructor(name?: string, opts: ConfigOpts = {}) {
    this.name = name;
    this.opts = opts;
    this.blockstore = new EncryptedBlockstore({
      name: name,
      applyMeta: async (meta: MetaType) => {
        // console.log("applyMeta db", meta);
        const crdtMeta = meta as unknown as CRDTMeta;
        if (!crdtMeta.head) return; // applyMeta is getting called for all blockstores (maybe storage event dispatch bug?)
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
    this.clock = new CRDTClock<T>(this.blockstore);
    this.indexBlockstore = new EncryptedBlockstore({
      name: this.opts.persistIndexes && this.name ? this.name + ".idx" : undefined,
      applyMeta: async (meta: MetaType) => {
        // console.log("applyMeta idx", meta);
        const idxCarMeta = meta as IdxMetaMap;
        if (!idxCarMeta.indexes) return; // applyMeta is getting called for all blockstores (maybe storage event dispatch bug?)
        for (const [name, idx] of Object.entries(idxCarMeta.indexes)) {
          index({ _crdt: this }, name, undefined, idx);
        }
      },
      crypto: this.opts.crypto,
      store: this.opts.indexStore,
      public: this.opts.public,
    });

    this.clock.onZoom(() => {
      for (const idx of this.indexers.values()) {
        idx._resetIndex();
      }
    });
  }

  async bulk(updates: DocUpdate<T>[]): Promise<TransactionMeta> {
    await this.xready();
    const prevHead = [...this.clock.head];

    const meta = await this.blockstore.transaction(async (blocks: CarTransaction): Promise<TransactionMeta> => {
      const { head } = await applyBulkUpdateToCrdt<T>(this.blockstore.ebOpts.store, blocks, this.clock.head, updates);
      updates = updates.map((dupdate: DocUpdate<T>) => {
        // if (!dupdate.value) throw new Error("missing value");
        readFiles(this.blockstore, { doc: dupdate.value as DocWithId<T> });
        return dupdate;
      });
      return { head };
    });
    await this.clock.applyHead(meta.head, prevHead, updates);
    return meta;
  }

  // if (snap) await this.clock.applyHead(crdtMeta.head, this.clock.head)

  async allDocs(): Promise<{ result: DocUpdate<T>[]; head: ClockHead }> {
    await this.xready();
    const result: DocUpdate<T>[] = [];
    for await (const entry of getAllEntries<T>(this.blockstore, this.clock.head)) {
      result.push(entry);
    }
    return { result, head: this.clock.head };
  }

  async vis(): Promise<string> {
    await this.xready();
    const txt: string[] = [];
    for await (const line of clockVis(this.blockstore, this.clock.head)) {
      txt.push(line);
    }
    return txt.join("\n");
  }

  async getBlock(cidString: string): Promise<Block> {
    await this.xready();
    return await getBlock(this.blockstore, cidString);
  }

  async get(key: string): Promise<DocValue<T> | null> {
    await this.xready();
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
    await this.xready();
    return await clockChangesSince<T>(this.blockstore, this.clock.head, since, opts);
  }

  async compact(): Promise<void> {
    return await this.blockstore.compact();
  }
}
