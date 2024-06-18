import type {
  ClockHead,
  DocUpdate,
  MapFn,
  IndexUpdate,
  QueryOpts,
  IdxMeta,
  DocFragment,
  IdxMetaMap,
  IndexRow,
  DbResponse,
  DocBase,
  IndexKey,
  IndexKeyType
} from "./types";
import { EncryptedBlockstore, TransactionMeta } from "./storage-engine";
import {
  bulkIndex,
  indexEntriesForChanges,
  byIdOpts,
  byKeyOpts,
  IndexTree,
  applyQuery,
  encodeRange,
  encodeKey,
  loadIndex,
  IndexDoc,
} from "./indexer-helpers";
import { CRDT } from "./crdt";

export { CRDT, DocBase };

export { Database, fireproof } from "./database";

export type { DocUpdate, MapFn, IndexUpdate, QueryOpts, IdxMeta, DocFragment, IdxMetaMap, IndexRow, ClockHead, DbResponse };

export function index<K extends IndexKeyType, T = unknown>({ _crdt }: { _crdt: CRDT<T> }, name: string, mapFn?: MapFn<T>, meta?: IdxMeta): Index<K, T> {
  if (mapFn && meta) throw new Error("cannot provide both mapFn and meta");
  if (mapFn && mapFn.constructor.name !== "Function") throw new Error("mapFn must be a function");
  if (_crdt.indexers.has(name)) {
    const idx = _crdt.indexers.get(name) as Index<K, T>;
    idx.applyMapFn(name, mapFn, meta);
  } else {
    const idx = new Index<K, T>(_crdt, name, mapFn, meta);
    _crdt.indexers.set(name, idx);
  }
  return _crdt.indexers.get(name) as Index<K, T>;
}

type ByIdIndexIten<K extends IndexKeyType> = {
  readonly key: K
  readonly value: [K, K]
}

export class Index<K extends IndexKeyType, T = unknown> {
  readonly blockstore: EncryptedBlockstore;
  readonly crdt: CRDT<T>;
  name?: string;
  mapFn?: MapFn<T>;
  mapFnString: string = "";
  byKey: IndexTree<K, T> = new IndexTree();
  byId: IndexTree<K, T> = new IndexTree();
  indexHead?: ClockHead;
  includeDocsDefault: boolean = false;
  initError?: Error;
  readonly ready: Promise<void>;

  constructor(crdt: CRDT<T>, name: string, mapFn?: MapFn<T>, meta?: IdxMeta) {
    this.blockstore = crdt.indexBlockstore;
    this.crdt = crdt;
    this.applyMapFn(name, mapFn, meta);
    if (!(this.mapFnString || this.initError)) throw new Error("missing mapFnString");
    this.ready = this.blockstore.ready.then(() => { });
    // .then((header: IdxCarHeader) => {
    //     // @ts-ignore
    //     if (header.head) throw new Error('cannot have head in idx header')
    //     if (header.indexes === undefined) throw new Error('missing indexes in idx header')
    //     // for (const [name, idx] of Object.entries(header.indexes)) {
    //     //   index({ _crdt: crdt }, name, undefined, idx as IdxMeta)
    //     // }
    //   })
  }

  applyMapFn(name: string, mapFn?: MapFn<T>, meta?: IdxMeta) {
    if (mapFn && meta) throw new Error("cannot provide both mapFn and meta");
    if (this.name && this.name !== name) throw new Error("cannot change name");
    this.name = name;
    try {
      if (meta) {
        // hydrating from header
        if (this.indexHead && this.indexHead.map((c) => c.toString()).join() !== meta.head.map((c) => c.toString()).join()) {
          throw new Error("cannot apply meta to existing index");
        }

        if (this.mapFnString) {
          // we already initialized from application code
          if (this.mapFnString !== meta.map) {
            console.log("cannot apply different mapFn meta: old mapFnString", this.mapFnString, "new mapFnString", meta.map);
            // throw new Error('cannot apply different mapFn meta')
          } else {
            this.byId.cid = meta.byId;
            this.byKey.cid = meta.byKey;
            this.indexHead = meta.head;
          }
        } else {
          // we are first
          this.mapFnString = meta.map;
          this.byId.cid = meta.byId;
          this.byKey.cid = meta.byKey;
          this.indexHead = meta.head;
        }
      } else {
        if (this.mapFn) {
          // we already initialized from application code
          if (mapFn) {
            if (this.mapFn.toString() !== mapFn.toString()) throw new Error("cannot apply different mapFn app2");
          }
        } else {
          // application code is creating an index
          if (!mapFn) {
            mapFn = ((doc) => (doc as Record<string, unknown>)[name] ?? undefined) as MapFn<T>;
          }
          if (this.mapFnString) {
            // we already loaded from a header
            if (this.mapFnString !== mapFn.toString()) {
              throw new Error("cannot apply different mapFn app");
            }
          } else {
            // we are first
            this.mapFnString = mapFn.toString();
          }
          this.mapFn = mapFn;
        }
      }
      const matches = /=>\s*(.*)/.test(this.mapFnString);
      this.includeDocsDefault = matches;
    } catch (e) {
      this.initError = e as Error;
    }
  }

  async query(opts: QueryOpts<K> = {}): Promise<{ rows: IndexRow<K, T>[] }> {
    // this._resetIndex()
    await this._updateIndex();
    await this._hydrateIndex();
    if (!this.byKey.root) {
      return await applyQuery<T, K>(this.crdt, { result: [] }, opts);
    }
    if (this.includeDocsDefault && opts.includeDocs === undefined) opts.includeDocs = true;
    if (opts.range) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      const { result, ...all } = await this.byKey.root.range(...encodeRange<K>(opts.range));
      return await applyQuery<T, K>(this.crdt, { result, ...all }, opts);
    }
    if (opts.key) {
      const encodedKey = encodeKey(opts.key);
      return await applyQuery<T, K>(this.crdt, await this.byKey.root.get(encodedKey), opts);
    }
    if (Array.isArray(opts.keys)) {
      const results = await Promise.all(
        opts.keys.map(async (key: DocFragment) => {
          const encodedKey = encodeKey(key);
          return (await applyQuery<T, K>(this.crdt, await this.byKey.root!.get(encodedKey), opts)).rows;
        }),
      );
      return { rows: results.flat() };
    }
    if (opts.prefix) {
      if (!Array.isArray(opts.prefix)) opts.prefix = [opts.prefix];
      // prefix should be always an array
      const start = [...opts.prefix, NaN];
      const end = [...opts.prefix, Infinity];
      const encodedR = encodeRange<K>([start, end]);
      return await applyQuery<T, K>(this.crdt, await this.byKey.root.range(...encodedR), opts);
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const { result, ...all } = await this.byKey.root.getAllEntries(); // funky return type
    return await applyQuery<T, K>(
      this.crdt,
      {
        result: result.map(({ key: [k, id], value }) => ({ key: k, id, value })),
        ...all,
      },
      opts,
    );
  }

  _resetIndex() {
    this.byId = new IndexTree();
    this.byKey = new IndexTree();
    this.indexHead = undefined;
  }

  async _hydrateIndex() {
    if (this.byId.root && this.byKey.root) return;
    if (!this.byId.cid || !this.byKey.cid) return;
    this.byId.root = await loadIndex(this.blockstore, this.byId.cid, byIdOpts);
    this.byKey.root = await loadIndex(this.blockstore, this.byKey.cid, byKeyOpts);
  }

  async _updateIndex(): Promise<TransactionMeta> {
    await this.ready;
    if (this.initError) throw this.initError;
    if (!this.mapFn) throw new Error("No map function defined");
    let result: DocUpdate<T, K>[], head: ClockHead;
    if (!this.indexHead || this.indexHead.length === 0) {
      ({ result, head } = await this.crdt.allDocs());
    } else {
      ({ result, head } = await this.crdt.changes(this.indexHead));
    }
    if (result.length === 0) {
      this.indexHead = head;
      return { byId: this.byId, byKey: this.byKey } as unknown as TransactionMeta;
    }
    let staleKeyIndexEntries: IndexUpdate<K>[] = [];
    let removeIdIndexEntries: IndexUpdate<K>[] = [];
    if (this.byId.root) {
      const removeIds = result.map(({ id: key }) => key);
      const { result: oldChangeEntries } = (await this.byId.root.getMany(removeIds)) as {
        result: Array<K | [K, K]>;
      };
      staleKeyIndexEntries = oldChangeEntries.map((key) => ({ key, del: true }));
      removeIdIndexEntries = oldChangeEntries.map((key) => ({ key: key[1], del: true }));
    }
    const indexEntries = indexEntriesForChanges<T, K>(result, this.mapFn); // use a getter to translate from string
    const byIdIndexEntries: IndexDoc<K>[] = indexEntries.map(({ key }) => ({
      key: key[1],
      value: key,
    }));
    const indexerMeta: IdxMetaMap = { indexes: new Map() };

    for (const [name, indexer] of this.crdt.indexers) {
      if (indexer.indexHead) {
        indexerMeta.indexes.set(name, {
          byId: indexer.byId.cid,
          byKey: indexer.byKey.cid,
          head: indexer.indexHead,
          map: indexer.mapFnString,
          name: indexer.name,
        } as IdxMeta);
      }
    }
    return await this.blockstore.transaction(async (tblocks): Promise<TransactionMeta> => {
      this.byId = await bulkIndex<T, K>(tblocks, this.byId, removeIdIndexEntries.concat(byIdIndexEntries), byIdOpts);
      this.byKey = await bulkIndex<T, K>(tblocks, this.byKey, staleKeyIndexEntries.concat(indexEntries), byKeyOpts);
      this.indexHead = head;
      const idxMeta = {
        byId: this.byId.cid,
        byKey: this.byKey.cid,
        head,
        map: this.mapFnString,
        name: this.name,
      } as IdxMeta;
      indexerMeta.indexes.set(this.name!, idxMeta); // should this move to after commit?
      return indexerMeta as unknown as TransactionMeta;
    });
  }
}
