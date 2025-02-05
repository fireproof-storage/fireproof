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
  type DocTypes,
  type IndexUpdateString,
  throwFalsy,
  IndexTransactionMeta,
  SuperThis,
  QueryResponse,
  ChangesOptions,
  QueryStreamMarker,
  DocWithId,
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
import { CRDT, HasCRDT } from "./crdt.js";
import { arrayFromAsyncIterable, ensureLogger } from "./utils.js";
import { Logger } from "@adviser/cement";
import { docUpdateToDocWithId } from "./crdt-helpers.js";

export function index<K extends IndexKeyType = string, T extends DocTypes = NonNullable<unknown>, R extends DocFragment = T>(
  refDb: HasCRDT<T>,
  name: string,
  mapFn?: MapFn<T>,
  meta?: IdxMeta,
): Index<K, T, R> {
  if (mapFn && meta) throw refDb.crdt.logger.Error().Msg("cannot provide both mapFn and meta").AsError();
  if (mapFn && mapFn.constructor.name !== "Function") throw refDb.crdt.logger.Error().Msg("mapFn must be a function").AsError();
  if (refDb.crdt.indexers.has(name)) {
    const idx = refDb.crdt.indexers.get(name) as unknown as Index<K, T>;
    idx.applyMapFn(name, mapFn, meta);
  } else {
    const idx = new Index<K, T>(refDb.crdt.sthis, refDb.crdt, name, mapFn, meta);
    refDb.crdt.indexers.set(name, idx as unknown as Index<K, NonNullable<unknown>, NonNullable<unknown>>);
  }
  return refDb.crdt.indexers.get(name) as unknown as Index<K, T, R>;
}

// interface ByIdIndexIten<K extends IndexKeyType> {
//   readonly key: K;
//   readonly value: [K, K];
// }

export class Index<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T> {
  readonly blockstore: BaseBlockstore;
  readonly crdt: CRDT<T>;
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

  constructor(sthis: SuperThis, crdt: CRDT<T> | CRDT<NonNullable<unknown>>, name: string, mapFn?: MapFn<T>, meta?: IdxMeta) {
    this.logger = ensureLogger(sthis, "Index");
    this.blockstore = crdt.indexBlockstore;
    this.crdt = crdt as CRDT<T>;
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

  query(qryOpts: QueryOpts<K> = {}, { waitFor }: { waitFor?: Promise<unknown> } = {}): QueryResponse<T> {
    const stream = this.#stream.bind(this);

    return {
      snapshot: (sinceOpts) => this.#snapshot(qryOpts, sinceOpts, { waitFor }),
      subscribe: (callback) => this.#subscribe(callback),
      toArray: (sinceOpts) => arrayFromAsyncIterable(this.#snapshot(qryOpts, sinceOpts, { waitFor })),

      live(opts?: { since?: ClockHead }) {
        return stream(qryOpts, { futureOnly: false, since: opts?.since }, { waitFor });
      },
      future() {
        return stream(qryOpts, { futureOnly: true }, { waitFor });
      },
    };
  }

  async #query(queryOptions: QueryOpts<K> = {}, sinceOptions: { since?: ClockHead } & ChangesOptions = {}) {
    const deps = { crdt: this.crdt, logger: this.logger };
    const qry = { ...queryOptions, since: sinceOptions.since, sinceOptions };

    if (!this.byKey.root) {
      return applyQuery<K, T, R>(deps, { result: [] }, qry);
    }

    if (qry.range) {
      const eRange = encodeRange(qry.range);
      return applyQuery<K, T, R>(deps, await throwFalsy(this.byKey.root).range(eRange[0], eRange[1]), qry);
    }

    if (qry.key) {
      const encodedKey = encodeKey(qry.key);
      return applyQuery<K, T, R>(deps, await throwFalsy(this.byKey.root).get(encodedKey), qry);
    }

    if (qry.prefix) {
      if (!Array.isArray(qry.prefix)) qry.prefix = [qry.prefix];
      // prefix should be always an array
      const start = [...qry.prefix, NaN];
      const end = [...qry.prefix, Infinity];
      const encodedR = encodeRange([start, end]);
      return applyQuery<K, T, R>(deps, await this.byKey.root.range(...encodedR), qry);
    }

    const all = await this.byKey.root.getAllEntries(); // funky return type

    return applyQuery<K, T, R>(
      deps,
      {
        // @ts-expect-error getAllEntries returns a different type than range
        result: all.result.map(({ key: [k, id], value }) => ({
          key: k,
          id,
          value,
        })),
      },
      qry,
    );
  }

  #snapshot(
    qryOpts: QueryOpts<K> = {},
    sinceOpts: { since?: ClockHead } & ChangesOptions = {},
    { waitFor }: { waitFor?: Promise<unknown> } = {},
  ) {
    const generator = async () => {
      await waitFor;
      await this.ready();
      await this._updateIndex();
      await this._hydrateIndex();

      return await this.#query(qryOpts, sinceOpts);
    };

    async function* docsWithId() {
      for await (const doc of await generator()) {
        if (doc) yield doc;
      }
    }

    return docsWithId();
  }

  #subscribe(callback: (doc: DocWithId<T>) => void) {
    const unsubscribe = this.crdt.clock.onTick((updates: DocUpdate<NonNullable<unknown>>[]) => {
      updates.forEach((update) => {
        callback(docUpdateToDocWithId(update as DocUpdate<T>));
      });
    });

    return unsubscribe;
  }

  #stream(
    qryOpts: QueryOpts<K> = {},
    sinceOpts: { futureOnly: boolean; since?: ClockHead } & ChangesOptions,
    { waitFor }: { waitFor?: Promise<unknown> } = {},
  ) {
    const hydrateIndex = this._hydrateIndex.bind(this);
    const query = this.#query.bind(this);
    const ready = this.ready.bind(this);
    const subscribe = this.#subscribe.bind(this);
    const updateIndex = this._updateIndex.bind(this);

    let unsubscribe: undefined | (() => void);
    let isClosed = false;

    return new ReadableStream<{ doc: DocWithId<T>; marker: QueryStreamMarker }>({
      async start(controller) {
        await waitFor;
        await ready();

        if (sinceOpts.futureOnly === false) {
          await updateIndex();
          await hydrateIndex();

          const it = await query(qryOpts, sinceOpts);

          async function iterate(prevValue: DocWithId<T>) {
            const { done, value } = await it.next();

            controller.enqueue({
              doc: prevValue,
              marker: { kind: "preexisting", done: done || false },
            });

            if (!done) await iterate(value);
          }

          const { value } = await it.next();
          if (value) await iterate(value);
        }

        unsubscribe = subscribe(async (doc) => {
          if (isClosed) return;
          await updateIndex();
          await hydrateIndex();

          controller.enqueue({ doc, marker: { kind: "new" } });
        });
      },

      cancel() {
        isClosed = true;
        unsubscribe?.();
      },
    });
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
    let result: DocUpdate<T>[];
    const head = [...this.crdt.clock.head];
    if (!this.indexHead || this.indexHead.length === 0) {
      result = await Array.fromAsync(this.crdt.all<T>());
      this.logger.Debug().Msg("enter crdt.all");
    } else {
      result = await Array.fromAsync(this.crdt.changes<T>(this.indexHead));
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
