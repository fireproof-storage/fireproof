import {
  type ClockHead,
  type DocUpdate,
  type MapFn,
  type IndexUpdate,
  type QueryOpts,
  type IdxMeta,
  type DocFragment,
  type IdxMetaMap,
  type IndexKeyType,
  type IndexRows,
  type DocTypes,
  type IndexUpdateString,
  throwFalsy,
  IndexTransactionMeta,
} from "./types.js";
import { BaseBlockstore } from "./blockstore/index.js";

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
  IndexDocString,
  CompareKey,
} from "./indexer-helpers.js";
import { CRDT } from "./crdt.js";
import { ensureLogger } from "./utils.js";
import { Logger } from "@adviser/cement";

export function index<K extends IndexKeyType = string, T extends DocTypes = NonNullable<unknown>, R extends DocFragment = T>(
  { _crdt }: { _crdt: CRDT<T> | CRDT<NonNullable<unknown>> },
  name: string,
  mapFn?: MapFn<T>,
  meta?: IdxMeta,
): Index<K, T, R> {
  if (mapFn && meta) throw new Error("cannot provide both mapFn and meta");
  if (mapFn && mapFn.constructor.name !== "Function") throw new Error("mapFn must be a function");
  if (_crdt.indexers.has(name)) {
    const idx = _crdt.indexers.get(name) as unknown as Index<K, T>;
    idx.applyMapFn(name, mapFn, meta);
  } else {
    const idx = new Index<K, T>(_crdt, name, mapFn, meta);
    _crdt.indexers.set(name, idx as unknown as Index<K, NonNullable<unknown>, NonNullable<unknown>>);
  }
  return _crdt.indexers.get(name) as unknown as Index<K, T, R>;
}

// interface ByIdIndexIten<K extends IndexKeyType> {
//   readonly key: K;
//   readonly value: [K, K];
// }

export class Index<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T> {
  readonly blockstore: BaseBlockstore;
  readonly crdt: CRDT<T>;
  name: string;
  mapFn?: MapFn<T>;
  mapFnString = "";
  byKey = new IndexTree<K, R>();
  byId = new IndexTree<K, R>();
  indexHead?: ClockHead;
  includeDocsDefault = false;
  initError?: Error;

  ready(): Promise<void> {
    return this.blockstore.ready();
  }

  readonly logger: Logger;

  constructor(crdt: CRDT<T> | CRDT<NonNullable<unknown>>, name: string, mapFn?: MapFn<T>, meta?: IdxMeta) {
    this.logger = ensureLogger(crdt.logger, "Index");
    this.blockstore = crdt.indexBlockstore;
    this.crdt = crdt as CRDT<T>;
    this.applyMapFn(name, mapFn, meta);
    this.name = name;
    if (!(this.mapFnString || this.initError)) throw new Error("missing mapFnString");
    // this.ready = this.blockstore.ready.then(() => {
    //   return;
    // });
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
          throw this.logger.Error().Msg("cannot apply different head meta").AsError();
        }

        if (this.mapFnString) {
          // we already initialized from application code
          if (this.mapFnString !== meta.map) {
            this.logger
              .Warn()
              .Msg(`cannot apply different mapFn meta: old mapFnString ${this.mapFnString} new mapFnString ${meta.map}`);
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
            if (this.mapFn.toString() !== mapFn.toString()) {
              throw this.logger.Error().Msg("cannot apply different mapFn app2").AsError();
            }
          }
        } else {
          // application code is creating an index
          if (!mapFn) {
            mapFn = ((doc) => (doc as unknown as Record<string, unknown>)[name] ?? undefined) as MapFn<T>;
          }
          if (this.mapFnString) {
            // we already loaded from a header
            if (this.mapFnString !== mapFn.toString()) {
              throw this.logger.Error().Msg("cannot apply different mapFn app").AsError();
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

  async query(opts: QueryOpts<K> = {}): Promise<IndexRows<K, T, R>> {
    // this._resetIndex();
    await this._updateIndex();
    await this._hydrateIndex();
    if (!this.byKey.root) {
      return await applyQuery<K, T, R>(this.crdt, { result: [] }, opts);
    }
    if (this.includeDocsDefault && opts.includeDocs === undefined) opts.includeDocs = true;
    if (opts.range) {
      const eRange = encodeRange(opts.range);
      return await applyQuery<K, T, R>(this.crdt, await throwFalsy(this.byKey.root).range(eRange[0], eRange[1]), opts);
    }
    if (opts.key) {
      const encodedKey = encodeKey(opts.key);
      return await applyQuery<K, T, R>(this.crdt, await throwFalsy(this.byKey.root).get(encodedKey), opts);
    }
    if (Array.isArray(opts.keys)) {
      const results = await Promise.all(
        opts.keys.map(async (key: DocFragment) => {
          const encodedKey = encodeKey(key);
          return (await applyQuery<K, T, R>(this.crdt, await throwFalsy(this.byKey.root).get(encodedKey), opts)).rows;
        }),
      );
      return { rows: results.flat() };
    }
    if (opts.prefix) {
      if (!Array.isArray(opts.prefix)) opts.prefix = [opts.prefix];
      // prefix should be always an array
      const start = [...opts.prefix, NaN];
      const end = [...opts.prefix, Infinity];
      const encodedR = encodeRange([start, end]);
      return await applyQuery<K, T, R>(this.crdt, await this.byKey.root.range(...encodedR), opts);
    }
    const all = await this.byKey.root.getAllEntries(); // funky return type
    return await applyQuery<K, T, R>(
      this.crdt,
      {
        // @ts-expect-error getAllEntries returns a different type than range
        result: all.result.map(({ key: [k, id], value }) => ({
          key: k,
          id,
          value,
        })),
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
    this.byId.root = await loadIndex<K, R, K>(this.blockstore, this.byId.cid, byIdOpts);
    this.byKey.root = await loadIndex<K, R, CompareKey>(this.blockstore, this.byKey.cid, byKeyOpts);
  }

  async _updateIndex(): Promise<IndexTransactionMeta> {
    await this.ready();
    if (this.initError) throw this.initError;
    if (!this.mapFn) throw new Error("No map function defined");
    let result: DocUpdate<T>[], head: ClockHead;
    if (!this.indexHead || this.indexHead.length === 0) {
      ({ result, head } = await this.crdt.allDocs());
    } else {
      ({ result, head } = await this.crdt.changes(this.indexHead));
    }
    if (result.length === 0) {
      this.indexHead = head;
      console.log("_updateIndex: no changes");
      // return { byId: this.byId, byKey: this.byKey } as IndexTransactionMeta;
    }
    let staleKeyIndexEntries: IndexUpdate<K>[] = [];
    let removeIdIndexEntries: IndexUpdateString[] = [];
    if (this.byId.root) {
      const removeIds = result.map(({ id: key }) => key);
      const { result: oldChangeEntries } = await this.byId.root.getMany(removeIds);
      staleKeyIndexEntries = oldChangeEntries.map((key) => ({ key, del: true }));
      removeIdIndexEntries = oldChangeEntries.map((key) => ({ key: key[1], del: true }));
    }
    const indexEntries = indexEntriesForChanges<T, K>(result, this.mapFn); // use a getter to translate from string
    console.log("indexEntries", indexEntries);
    const byIdIndexEntries: IndexDocString[] = indexEntries.map(({ key }) => ({
      key: key[1],
      value: key,
    }));
    const indexerMeta: IdxMetaMap = { indexes: new Map() };
    console.log("indexEntries-1");

    for (const [name, indexer] of this.crdt.indexers) {
      if (indexer.indexHead) {
        indexerMeta.indexes?.set(name, {
          byId: indexer.byId.cid,
          byKey: indexer.byKey.cid,
          head: indexer.indexHead,
          map: indexer.mapFnString,
          name: indexer.name,
        } as IdxMeta);
      }
    }
    console.log("indexEntries-2");
    if (result.length === 0) {
      console.log("indexEntries-3");
      return indexerMeta as unknown as IndexTransactionMeta;
    }
    console.log("indexEntries-4");
    const { meta } = await this.blockstore.transaction<IndexTransactionMeta>(async (tblocks): Promise<IndexTransactionMeta> => {
      console.log("indexEntries-4.1");
      this.byId = await bulkIndex<K, R, K>(tblocks, this.byId, removeIdIndexEntries.concat(byIdIndexEntries), byIdOpts);
      this.byKey = await bulkIndex<K, R, CompareKey>(tblocks, this.byKey, staleKeyIndexEntries.concat(indexEntries), byKeyOpts);
      this.indexHead = head;
      console.log("indexEntries-4.2", this.byId.cid ? "ok" : "fail", this.byKey.cid ? "ok" : "fail");
      if (this.byId.cid && this.byKey.cid) {
        const idxMeta = {
          byId: this.byId.cid,
          byKey: this.byKey.cid,
          head,
          map: this.mapFnString,
          name: this.name,
        } as IdxMeta;
        indexerMeta.indexes?.set(this.name, idxMeta);
      }
      return indexerMeta as unknown as IndexTransactionMeta;
    });
    console.log("indexEntries-5");
    return meta;
  }
}
