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
  type IndexTransactionMeta,
  type SuperThis,
  type BaseBlockstore,
  type CRDT,
  type HasCRDT,
  type HasLogger,
  type HasSuperThis,
  type RefLedger,
} from "./types.js";
// import { BaseBlockstore } from "./blockstore/index.js";

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
import { ensureLogger } from "./utils.js";
import { Logger } from "@adviser/cement";

function refLedger(u: HasCRDT | RefLedger): u is RefLedger {
  return !!(u as RefLedger).ledger;
}

export function index<K extends IndexKeyType = string, T extends DocTypes = NonNullable<unknown>, R extends DocFragment = T>(
  refDb: HasLogger & HasSuperThis & (HasCRDT | RefLedger),
  name: string,
  mapFn?: MapFn<T>,
  meta?: IdxMeta,
): Index<K, T, R> {
  const crdt = refLedger(refDb) ? refDb.ledger.crdt : refDb.crdt;

  if (mapFn && meta) throw refDb.logger.Error().Msg("cannot provide both mapFn and meta").AsError();
  if (mapFn && mapFn.constructor.name !== "Function") throw refDb.logger.Error().Msg("mapFn must be a function").AsError();
  if (crdt.indexers.has(name)) {
    const idx = crdt.indexers.get(name) as unknown as Index<K, T>;
    idx.applyMapFn(name, mapFn, meta);
  } else {
    const idx = new Index<K, T>(refDb.sthis, crdt, name, mapFn, meta);
    crdt.indexers.set(name, idx as unknown as Index<K, NonNullable<unknown>, NonNullable<unknown>>);
  }
  return crdt.indexers.get(name) as unknown as Index<K, T, R>;
}

// interface ByIdIndexIten<K extends IndexKeyType> {
//   readonly key: K;
//   readonly value: [K, K];
// }

export class Index<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T> {
  readonly blockstore: BaseBlockstore;
  readonly crdt: CRDT;
  readonly name: string;
  mapFn?: MapFn<T>;
  mapFnString = "";
  byKey: IndexTree<K, R> = new IndexTree<K, R>();
  byId: IndexTree<K, R> = new IndexTree<K, R>();
  indexHead?: ClockHead;
  includeDocsDefault = false;
  initError?: Error;

  ready(): Promise<void> {
    return Promise.all([this.blockstore.ready(), this.crdt.ready()]).then(() => {
      /* noop */
    });
  }

  // close(): Promise<void> {
  //   return Promise.all([this.blockstore.close(), this.crdt.close()]).then(() => {
  //     /* noop */
  //   });
  // }
  // destroy(): Promise<void> {
  //   return Promise.all([this.blockstore.destroy(), this.crdt.destroy()]).then(() => {
  //     /* noop */
  //   });
  // }

  readonly logger: Logger;

  constructor(sthis: SuperThis, crdt: CRDT, name: string, mapFn?: MapFn<T>, meta?: IdxMeta) {
    this.logger = ensureLogger(sthis, "Index");
    this.blockstore = crdt.indexBlockstore;
    this.crdt = crdt as CRDT;
    this.applyMapFn(name, mapFn, meta);
    this.name = name;
    if (!(this.mapFnString || this.initError)) throw this.logger.Error().Msg("missing mapFnString").AsError();
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
    if (mapFn && meta) throw this.logger.Error().Msg("cannot provide both mapFn and meta").AsError();
    if (this.name && this.name !== name) throw this.logger.Error().Msg("cannot change name").AsError();
    // this.name = name;
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
              throw this.logger
                .Error()
                .Str("mapFnString", this.mapFnString)
                .Str("mapFn", mapFn.toString())
                .Msg("cannot apply different mapFn app")
                .AsError();
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
    this.logger.Debug().Msg("enter query");
    await this.ready();
    // this._resetIndex();
    this.logger.Debug().Msg("post ready query");
    await this._updateIndex();
    this.logger.Debug().Msg("post _updateIndex query");
    await this._hydrateIndex();
    this.logger.Debug().Msg("post _hydrateIndex query");
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
    this.logger.Debug().Msg("enter _updateIndex");
    if (this.initError) throw this.initError;
    if (!this.mapFn) throw this.logger.Error().Msg("No map function defined").AsError();
    let result: DocUpdate<T>[], head: ClockHead;
    if (!this.indexHead || this.indexHead.length === 0) {
      ({ result, head } = await this.crdt.allDocs<T>());
      this.logger.Debug().Msg("enter crdt.allDocs");
    } else {
      ({ result, head } = await this.crdt.changes<T>(this.indexHead));
      this.logger.Debug().Msg("enter crdt.changes");
    }
    if (result.length === 0) {
      this.indexHead = head;
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
    const byIdIndexEntries: IndexDocString[] = indexEntries.map(({ key }) => ({
      key: key[1],
      value: key,
    }));
    const indexerMeta: IdxMetaMap = { indexes: new Map() };

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
    if (result.length === 0) {
      return indexerMeta as unknown as IndexTransactionMeta;
    }
    this.logger.Debug().Msg("pre this.blockstore.transaction");
    const { meta } = await this.blockstore.transaction<IndexTransactionMeta>(async (tblocks): Promise<IndexTransactionMeta> => {
      this.byId = await bulkIndex<K, R, K>(
        this.logger,
        tblocks,
        this.byId,
        removeIdIndexEntries.concat(byIdIndexEntries),
        byIdOpts,
      );
      this.byKey = await bulkIndex<K, R, CompareKey>(
        this.logger,
        tblocks,
        this.byKey,
        staleKeyIndexEntries.concat(indexEntries),
        byKeyOpts,
      );
      this.indexHead = head;
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
      this.logger.Debug().Any("indexerMeta", new Array(indexerMeta.indexes?.entries())).Msg("exit this.blockstore.transaction fn");
      return indexerMeta as unknown as IndexTransactionMeta;
    });
    this.logger.Debug().Msg("post this.blockstore.transaction");
    return meta;
  }
}
