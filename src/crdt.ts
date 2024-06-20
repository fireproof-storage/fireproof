import { EncryptedBlockstore, type CompactionFetcher, type TransactionMeta, type CarTransaction } from "./storage-engine";

import { store, crypto } from "./web/eb-web";

import {
  clockChangesSince,
  applyBulkUpdateToCrdt,
  getValueFromCrdt,
  readFiles,
  getAllEntries,
  clockVis,
  getBlock,
  doCompact,
} from "./crdt-helpers";
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
  DocRecord,
  DocTypes,
} from "./types";
import { index, type Index } from "./indexer";
import { CRDTClock } from "./crdt-clock";
import { Block } from "multiformats";
import { MetaType } from "./storage-engine/types";

export class CRDT<T extends DocTypes> {
  readonly name?: string;
  readonly opts: ConfigOpts = {};
  readonly ready: Promise<void>;
  readonly blockstore: EncryptedBlockstore;
  readonly indexBlockstore: EncryptedBlockstore;

  readonly indexers = new Map<string, Index<IndexKeyType, {}>>();

  readonly clock: CRDTClock<T> = new CRDTClock<T>();

  constructor(name?: string, opts?: ConfigOpts) {
    this.name = name;
    this.opts = opts || this.opts;
    this.blockstore = new EncryptedBlockstore({
      name,
      applyMeta: async (meta: MetaType) => {
        const crdtMeta = meta as unknown as CRDTMeta;
        await this.clock.applyHead(crdtMeta.head, []);
      },
      compact: async (blocks: CompactionFetcher) => {
        await doCompact(blocks, this.clock.head);
        return { head: this.clock.head } as TransactionMeta;
      },
      autoCompact: this.opts.autoCompact || 100,
      crypto: this.opts.crypto || crypto,
      store: this.opts.store || store,
      public: this.opts.public,
      meta: this.opts.meta,
      threshold: this.opts.threshold,
    });
    this.clock.blockstore = this.blockstore;
    this.indexBlockstore = new EncryptedBlockstore({
      name: this.opts.persistIndexes && this.name ? this.name + ".idx" : undefined,
      applyMeta: async (meta: MetaType) => {
        const idxCarMeta = meta as unknown as IdxMetaMap;
        for (const [name, idx] of Object.entries(idxCarMeta.indexes)) {
          index({ _crdt: this }, name, undefined, idx as any);
        }
      },
      crypto,
      public: this.opts.public,
      store,
    });
    this.ready = Promise.all([this.blockstore.ready, this.indexBlockstore.ready]).then(() => {});
    this.clock.onZoom(() => {
      for (const idx of this.indexers.values()) {
        idx._resetIndex();
      }
    });
  }

  async bulk(updates: DocUpdate<T>[]): Promise<TransactionMeta> {
    await this.ready;
    const prevHead = [...this.clock.head];

    const meta = await this.blockstore.transaction(async (blocks: CarTransaction): Promise<TransactionMeta> => {
      const { head } = await applyBulkUpdateToCrdt<T>(blocks, this.clock.head, updates);
      updates = updates.map((dupdate: DocUpdate<T>) => {
        if (!dupdate.value) throw new Error("missing value");
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
    await this.ready;
    const result: DocUpdate<T>[] = [];
    for await (const entry of getAllEntries<T>(this.blockstore, this.clock.head)) {
      result.push(entry);
    }
    return { result, head: this.clock.head };
  }

  async vis(): Promise<string> {
    await this.ready;
    const txt: string[] = [];
    for await (const line of clockVis(this.blockstore, this.clock.head)) {
      txt.push(line);
    }
    return txt.join("\n");
  }

  async getBlock(cidString: string): Promise<Block> {
    await this.ready;
    return await getBlock(this.blockstore, cidString);
  }

  async get(key: string): Promise<DocValue<T> | undefined> {
    await this.ready;
    const result = await getValueFromCrdt<T>(this.blockstore, this.clock.head, key);
    if (result.del) return undefined;
    return result;
  }

  async changes(
    since: ClockHead = [],
    opts: ChangesOptions = {},
  ): Promise<{
    result: DocUpdate<T>[];
    head: ClockHead;
  }> {
    await this.ready;
    return await clockChangesSince<T>(this.blockstore, this.clock.head, since, opts);
  }

  async compact(): Promise<void> {
    return await this.blockstore.compact();
  }
}
