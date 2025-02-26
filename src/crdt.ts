import { Block } from "multiformats";
import { Logger, ResolveOnce } from "@adviser/cement";

// @ts-expect-error "charwise" has no types
import charwise from "charwise";

import {
  EncryptedBlockstore,
  type TransactionMeta,
  type CarTransaction,
  BaseBlockstore,
  CompactFetcher,
  toStoreRuntime,
} from "./blockstore/index.js";
import {
  applyBulkUpdateToCrdt,
  getValueFromCrdt,
  readFiles,
  clockVis,
  getBlock,
  doCompact,
  docUpdateToDocWithId,
  getAllEntries,
  clockUpdatesSince,
  getAllEntriesWithDoc,
  clockUpdatesSinceWithDoc,
  docValues,
} from "./crdt-helpers.js";
import type {
  DocUpdate,
  CRDTMeta,
  ClockHead,
  DocValue,
  IndexKeyType,
  DocWithId,
  DocTypes,
  Falsy,
  SuperThis,
  IndexTransactionMeta,
  QueryResponse,
  ListenerFn,
  QueryStreamMarker,
  ChangesOptions,
  DocFragment,
  Row,
  DocumentRow,
} from "./types.js";
import { index, type Index } from "./indexer.js";
import { CRDTClock } from "./crdt-clock.js";
// import { blockstoreFactory } from "./blockstore/transaction.js";
import { arrayFromAsyncIterable, ensureLogger } from "./utils.js";
import { LedgerOpts } from "./ledger.js";

export interface HasCRDT<T extends DocTypes> {
  readonly crdt: CRDT<T> | CRDT<NonNullable<unknown>>;
}

export class CRDT<T extends DocTypes> {
  readonly opts: LedgerOpts;

  readonly blockstore: BaseBlockstore;
  readonly indexBlockstore: BaseBlockstore;
  readonly indexers: Map<string, Index<IndexKeyType, NonNullable<unknown>>> = new Map<
    string,
    Index<IndexKeyType, NonNullable<unknown>>
  >();
  readonly clock: CRDTClock<T>;

  readonly logger: Logger;
  readonly sthis: SuperThis;

  // Subscriptions
  _listening = false;
  readonly _listeners = new Set<ListenerFn<T>>();
  readonly _noupdate_listeners = new Set<ListenerFn<T>>();

  constructor(sthis: SuperThis, opts: LedgerOpts) {
    this.sthis = sthis;
    this.logger = ensureLogger(sthis, "CRDT");
    this.opts = opts;
    this.blockstore = new EncryptedBlockstore(sthis, {
      applyMeta: async (meta: TransactionMeta) => {
        const crdtMeta = meta as CRDTMeta;
        if (!crdtMeta.head) throw this.logger.Error().Msg("missing head").AsError();
        await this.clock.applyHead(crdtMeta.head, []);
      },
      compact: async (blocks: CompactFetcher) => {
        await doCompact(blocks, this.clock.head, this.logger);
        return { head: this.clock.head } as TransactionMeta;
      },
      gatewayInterceptor: opts.gatewayInterceptor,
      // autoCompact: this.opts.autoCompact || 100,
      storeRuntime: toStoreRuntime(this.sthis, this.opts.storeEnDe),
      storeUrls: this.opts.storeUrls.data,
      keyBag: this.opts.keyBag,
      // public: this.opts.public,
      meta: this.opts.meta,
      // threshold: this.opts.threshold,
    });
    this.indexBlockstore = new EncryptedBlockstore(sthis, {
      // name: opts.name,
      applyMeta: async (meta: TransactionMeta) => {
        const idxCarMeta = meta as IndexTransactionMeta;
        if (!idxCarMeta.indexes) throw this.logger.Error().Msg("missing indexes").AsError();
        for (const [name, idx] of Object.entries(idxCarMeta.indexes)) {
          index({ crdt: this }, name, undefined, idx);
        }
      },
      gatewayInterceptor: opts.gatewayInterceptor,
      storeRuntime: toStoreRuntime(this.sthis, this.opts.storeEnDe),
      storeUrls: this.opts.storeUrls.idx,
      keyBag: this.opts.keyBag,
      // public: this.opts.public,
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
      const { head } = await applyBulkUpdateToCrdt<T>(
        this.blockstore.ebOpts.storeRuntime,
        blocks,
        this.clock.head,
        updates,
        this.logger,
      );
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

  readonly onceReady: ResolveOnce<void> = new ResolveOnce<void>();
  async ready(): Promise<void> {
    return this.onceReady.once(async () => {
      try {
        // await this.blockstore.ready();
        // await this.indexBlockstore.ready();
        // await this.clock.ready();
        await Promise.all([this.blockstore.ready(), this.indexBlockstore.ready(), this.clock.ready()]);
      } catch (e) {
        throw this.logger.Error().Err(e).Msg(`CRDT is not ready`).AsError();
      }
    });
  }

  async close(): Promise<void> {
    // await this.blockstore.close();
    // await this.indexBlockstore.close();
    // await this.clock.close();
    await Promise.all([this.blockstore.close(), this.indexBlockstore.close(), this.clock.close()]);
  }

  async destroy(): Promise<void> {
    await Promise.all([this.blockstore.destroy(), this.indexBlockstore.destroy()]);
  }

  // if (snap) await this.clock.applyHead(crdtMeta.head, this.clock.head)

  /**
   * Retrieve the current set of documents.
   */
  allDocs<K extends IndexKeyType, T extends DocTypes, R extends DocFragment>({
    waitFor,
  }: { waitFor?: Promise<unknown> } = {}): QueryResponse<K, T, R> {
    const stream = this.#stream.bind(this);

    return {
      snapshot: (sinceOpts) => this.#snapshot<K, T, R>(sinceOpts, { waitFor }),
      subscribe: (callback) => this.#subscribe<K, T, R>(callback),
      toArray: (sinceOpts) => arrayFromAsyncIterable(this.#snapshot<K, T, R>(sinceOpts, { waitFor })),

      live(opts?: { since?: ClockHead } & ChangesOptions) {
        return stream<K, T, R>({ ...opts, futureOnly: false }, { waitFor });
      },
      future() {
        return stream<K, T, R>({ futureOnly: true }, { waitFor });
      },
    };
  }

  #currentDocs<K extends IndexKeyType, T extends DocTypes, R extends DocFragment>(
    since?: ClockHead,
    sinceOptions?: ChangesOptions,
  ) {
    return since ? this.changes<K, T, R>(since, sinceOptions) : this.all<K, T, R>();
  }

  #snapshot<K extends IndexKeyType, T extends DocTypes, R extends DocFragment>(
    opts: { since?: ClockHead } & ChangesOptions = {},
    { waitFor }: { waitFor?: Promise<unknown> } = {},
  ): AsyncGenerator<DocumentRow<K, T, R>> {
    const currentDocs = this.#currentDocs.bind(this);
    const ready = this.ready.bind(this);

    async function* currentRows() {
      await waitFor;
      await ready();

      for await (const row of currentDocs<K, T, R>(opts.since, opts)) {
        yield row;
      }
    }

    return currentRows();
  }

  #subscribe<K extends IndexKeyType, T extends DocTypes, R extends DocFragment>(callback: (row: DocumentRow<K, T, R>) => void) {
    const unsubscribe = this.clock.onTick((updates: DocUpdate<NonNullable<unknown>>[]) => {
      updates.forEach((update) => {
        const doc = docUpdateToDocWithId<T>(update as DocUpdate<T>);
        callback({
          id: doc._id,
          key: [charwise.encode(doc._id) as K, doc._id],
          value: docValues<T, R>(doc) as R,
          doc,
        });
      });
    });

    return unsubscribe;
  }

  #stream<K extends IndexKeyType, T extends DocTypes, R extends DocFragment>(
    opts: { futureOnly: boolean; since?: ClockHead } & ChangesOptions,
    { waitFor }: { waitFor?: Promise<unknown> } = {},
  ) {
    const currentDocs = this.#currentDocs.bind(this);
    const ready = this.ready.bind(this);
    const subscribe = this.#subscribe.bind(this);

    let unsubscribe: undefined | (() => void);
    let isClosed = false;

    return new ReadableStream<{ row: DocumentRow<K, T, R>; marker: QueryStreamMarker }>({
      async start(controller) {
        await waitFor;
        await ready();

        if (opts.futureOnly === false) {
          const it = currentDocs<K, T, R>(opts.since, opts);

          async function iterate(prevValue: DocumentRow<K, T, R>) {
            const { done, value } = await it.next();

            controller.enqueue({
              row: prevValue,
              marker: { kind: "preexisting", done: done || false },
            });

            if (!done) await iterate(value);
          }

          const { value } = await it.next();
          if (value) await iterate(value);
        }

        unsubscribe = subscribe<K, T, R>((row) => {
          if (isClosed) return;
          controller.enqueue({ row, marker: { kind: "new" } });
        });
      },

      cancel() {
        isClosed = true;
        unsubscribe?.();
      },
    });
  }

  async vis(): Promise<string> {
    await this.ready();
    const txt: string[] = [];
    for await (const line of clockVis(this.blockstore, this.clock.head)) {
      txt.push(line);
    }
    return txt.join("\n");
  }

  all<K extends IndexKeyType, R extends DocFragment>(withDocs: false): AsyncGenerator<Row<K, R>>;
  all<K extends IndexKeyType, T extends DocTypes, R extends DocFragment>(withDocs?: true): AsyncGenerator<DocumentRow<K, T, R>>;
  all<K extends IndexKeyType, T extends DocTypes, R extends DocFragment>(
    withDocs?: boolean,
  ): AsyncGenerator<Row<K, R>> | AsyncGenerator<DocumentRow<K, T, R>> {
    if (withDocs === undefined || withDocs) {
      return getAllEntriesWithDoc<K, T, R>(this.blockstore, this.clock.head, this.logger);
    }

    return getAllEntries<K, T, R>(this.blockstore, this.clock.head, this.logger);
  }

  changes<K extends IndexKeyType, R extends DocFragment>(
    since: ClockHead,
    opts?: ChangesOptions & { withDocs: false },
  ): AsyncGenerator<Row<K, R>>;
  changes<K extends IndexKeyType, T extends DocTypes, R extends DocFragment>(
    since: ClockHead,
    opts?: ChangesOptions & { withDocs?: true },
  ): AsyncGenerator<DocumentRow<K, T, R>>;
  changes<K extends IndexKeyType, T extends DocTypes, R extends DocFragment>(
    since: ClockHead = [],
    opts?: ChangesOptions & { withDocs?: boolean },
  ): AsyncGenerator<Row<K, R>> | AsyncGenerator<DocumentRow<K, T, R>> {
    if (opts?.withDocs === undefined || opts?.withDocs) {
      return clockUpdatesSinceWithDoc<K, T, R>(this.blockstore, this.clock.head, since, opts, this.logger);
    }

    return clockUpdatesSince<K, T, R>(this.blockstore, this.clock.head, since, opts, this.logger);
  }

  async getBlock(cidString: string): Promise<Block> {
    await this.ready();
    return await getBlock(this.blockstore, cidString);
  }

  async get(key: string): Promise<DocValue<T> | Falsy> {
    await this.ready();
    const result = await getValueFromCrdt<T>(this.blockstore, this.clock.head, key, this.logger);
    if (result.del) return undefined;
    return result;
  }

  async compact(): Promise<void> {
    const blocks = this.blockstore as EncryptedBlockstore;
    return await blocks.compact();
  }
}
