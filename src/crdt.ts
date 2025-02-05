import { Block } from "multiformats";
import { Logger, ResolveOnce } from "@adviser/cement";
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
  allDocs<T extends DocTypes>({ waitFor }: { waitFor?: Promise<unknown> } = {}): QueryResponse<T> {
    const stream = this.#stream.bind(this);

    return {
      snapshot: (sinceOpts) => this.#snapshot<T>(sinceOpts, { waitFor }),
      subscribe: (callback) => this.#subscribe<T>(callback),
      toArray: (sinceOpts) => arrayFromAsyncIterable(this.#snapshot<T>(sinceOpts, { waitFor })),

      live(opts?: { since?: ClockHead } & ChangesOptions) {
        return stream<T>({ ...opts, futureOnly: false }, { waitFor });
      },
      future() {
        return stream<T>({ futureOnly: true }, { waitFor });
      },
    };
  }

  #currentDocs<T extends DocTypes>(since?: ClockHead, sinceOptions?: ChangesOptions) {
    return since ? this.changes<T>(since, sinceOptions) : this.all<T>();
  }

  #snapshot<T extends DocTypes>(
    opts: { since?: ClockHead } & ChangesOptions = {},
    { waitFor }: { waitFor?: Promise<unknown> } = {},
  ): AsyncGenerator<DocWithId<T>> {
    const currentDocs = this.#currentDocs.bind(this);
    const ready = this.ready.bind(this);

    async function* currentDocsWithId() {
      await waitFor;
      await ready();

      for await (const doc of currentDocs<T>(opts.since, opts)) {
        yield docUpdateToDocWithId(doc);
      }
    }

    return currentDocsWithId();
  }

  #subscribe<T extends DocTypes>(callback: (doc: DocWithId<T>) => void) {
    const unsubscribe = this.clock.onTick((updates: DocUpdate<NonNullable<unknown>>[]) => {
      updates.forEach((update) => {
        callback(docUpdateToDocWithId(update as DocUpdate<T>));
      });
    });

    return unsubscribe;
  }

  #stream<T extends DocTypes>(
    opts: { futureOnly: boolean; since?: ClockHead } & ChangesOptions,
    { waitFor }: { waitFor?: Promise<unknown> } = {},
  ) {
    const currentDocs = this.#currentDocs.bind(this);
    const ready = this.ready.bind(this);
    const subscribe = this.#subscribe.bind(this);

    let unsubscribe: undefined | (() => void);
    let isClosed = false;

    return new ReadableStream<{ doc: DocWithId<T>; marker: QueryStreamMarker }>({
      async start(controller) {
        await waitFor;
        await ready();

        if (opts.futureOnly === false) {
          const it = currentDocs<T>(opts.since, opts);

          async function iterate(prevValue: DocUpdate<T>) {
            const { done, value } = await it.next();

            controller.enqueue({
              doc: docUpdateToDocWithId(prevValue),
              marker: { kind: "preexisting", done: done || false },
            });

            if (!done) await iterate(value);
          }

          const { value } = await it.next();
          if (value) await iterate(value);
        }

        unsubscribe = subscribe<T>((doc) => {
          if (isClosed) return;
          controller.enqueue({ doc, marker: { kind: "new" } });
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

  all<T extends DocTypes>(): AsyncGenerator<DocUpdate<T>> {
    return getAllEntries<T>(this.blockstore, this.clock.head, this.logger);
  }

  changes<T extends DocTypes>(since: ClockHead = [], opts: ChangesOptions = {}): AsyncGenerator<DocUpdate<T>> {
    return clockUpdatesSince<T>(this.blockstore, this.clock.head, since, opts, this.logger);
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
