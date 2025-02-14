import { BuildURI, KeyedResolvOnce, Logger, ResolveOnce, URI } from "@adviser/cement";

import { defaultWriteQueueOpts, writeQueue } from "./write-queue.js";
import type {
  DocUpdate,
  ConfigOpts,
  DocWithId,
  ListenerFn,
  DocTypes,
  SuperThis,
  Database,
  Ledger,
  WriteQueue,
  CRDT,
  LedgerOpts,
  Attachable,
  Attached,
} from "./types.js";
import { PARAM } from "./types.js";
import { StoreURIRuntime, StoreUrlsOpts } from "./blockstore/index.js";
import { ensureLogger, ensureSuperThis, ensureURIDefaults, toSortedArray } from "./utils.js";

import { decodeFile, encodeFile } from "./runtime/files.js";
import { defaultKeyBagOpts } from "./runtime/key-bag.js";
import { getDefaultURI } from "./blockstore/register-store-protocol.js";
import { DatabaseImpl } from "./database.js";
import { CRDTImpl } from "./crdt.js";
import { Context } from "./context.js";

const ledgers = new KeyedResolvOnce<Ledger>();

export function keyConfigOpts(sthis: SuperThis, name: string, opts?: ConfigOpts): string {
  return JSON.stringify(
    toSortedArray({
      name,
      stores: toSortedArray(JSON.parse(JSON.stringify(toStoreURIRuntime(sthis, name, opts?.storeUrls)))),
    }),
  );
}

export function isLedger(db: unknown): db is Ledger {
  return db instanceof LedgerImpl || db instanceof LedgerShell;
}

export function LedgerFactory(name: string, opts?: ConfigOpts): Ledger {
  const sthis = ensureSuperThis(opts);
  return new LedgerShell(
    ledgers.get(keyConfigOpts(sthis, name, opts)).once((key) => {
      const db = new LedgerImpl(sthis, {
        name,
        meta: opts?.meta,
        keyBag: defaultKeyBagOpts(sthis, opts?.keyBag),
        storeUrls: toStoreURIRuntime(sthis, name, opts?.storeUrls),
        gatewayInterceptor: opts?.gatewayInterceptor,
        writeQueue: defaultWriteQueueOpts(opts?.writeQueue),
        storeEnDe: {
          encodeFile,
          decodeFile,
          ...opts?.storeEnDe,
        },
      });
      db.onClosed(() => {
        ledgers.unget(key);
      });
      return db;
    }),
  );
}

export class LedgerShell implements Ledger {
  readonly ref: LedgerImpl;
  readonly writeQueue: WriteQueue<DocUpdate<DocTypes>>;
  readonly name: string;

  constructor(ref: LedgerImpl) {
    this.ref = ref;
    this.writeQueue = ref.writeQueue;
    this.name = ref.name;
    ref.addShell(this);
  }

  attach(a: Attachable): Promise<Attached> {
    return this.ref.attach(a);
  }

  get opts(): LedgerOpts {
    return this.ref.opts;
  }

  get context(): Context {
    return this.ref.context;
  }

  get id(): string {
    return this.ref.id;
  }
  get logger(): Logger {
    return this.ref.logger;
  }
  get sthis(): SuperThis {
    return this.ref.sthis;
  }
  get crdt(): CRDT {
    return this.ref.crdt;
  }

  onClosed(fn: () => void): () => void {
    return this.ref.onClosed(fn);
  }
  close(): Promise<void> {
    return this.ref.shellClose(this);
  }
  destroy(): Promise<void> {
    return this.ref.destroy();
  }
  ready(): Promise<void> {
    return this.ref.ready();
  }

  // asDB(): Database {
  //   return this.ref.asDB();
  // }

  subscribe<T extends DocTypes>(listener: ListenerFn<T>, updates?: boolean): () => void {
    return this.ref.subscribe(listener, updates);
  }
}

class LedgerImpl implements Ledger {
  // readonly name: string;
  readonly opts: LedgerOpts;

  _listening = false;
  readonly _listeners = new Set<ListenerFn<DocTypes>>();
  readonly _noupdate_listeners = new Set<ListenerFn<DocTypes>>();
  readonly crdt: CRDT;
  readonly writeQueue: WriteQueue<DocUpdate<DocTypes>>;
  // readonly blockstore: BaseBlockstore;

  readonly shells: Set<LedgerShell> = new Set<LedgerShell>();

  readonly context = new Context();

  get name(): string {
    return this.opts.name;
    // this.opts.storeUrls.data.data.getParam(PARAM.NAME) ?? "default";
  }

  addShell(shell: LedgerShell) {
    this.shells.add(shell);
  }

  readonly _onClosedFns = new Map<string, () => void>();
  onClosed(fn: () => void): () => void {
    const id = this.sthis.nextId().str;
    this._onClosedFns.set(id, fn);
    return () => {
      this._onClosedFns.delete(id);
    };
  }
  async close() {
    throw this.logger.Error().Str("db", this.name).Msg(`use shellClose`).AsError();
  }
  async shellClose(db: LedgerShell) {
    if (!this.shells.has(db)) {
      throw this.logger.Error().Str("db", this.name).Msg(`LedgerShell mismatch`).AsError();
    }
    this.shells.delete(db);
    if (this.shells.size === 0) {
      await this.ready();
      await this.crdt.close();
      await this.writeQueue.close();
      this._onClosedFns.forEach((fn) => fn());
    }
    // await this.blockstore.close();
  }

  async destroy() {
    await this.ready();
    await this.crdt.destroy();
    // await this.blockstore.destroy();
  }

  readonly _ready: ResolveOnce<void> = new ResolveOnce<void>();
  async ready(): Promise<void> {
    const ret = await this._ready.once(async () => {
      await this.sthis.start();
      await this.crdt.ready();
      // await this.blockstore.ready();
    });
    return ret;
  }

  readonly logger: Logger;
  readonly sthis: SuperThis;
  readonly id: string;

  constructor(sthis: SuperThis, opts: LedgerOpts) {
    this.opts = opts; // || this.opts;
    // this.name = opts.storeUrls.data.data.getParam(PARAM.NAME) || "default";
    this.sthis = sthis;
    this.id = sthis.timeOrderedNextId().str;
    this.logger = ensureLogger(this.sthis, "Ledger");
    this.crdt = new CRDTImpl(this.sthis, this.opts);
    this.writeQueue = writeQueue(
      this.sthis,
      async (updates: DocUpdate<DocTypes>[]) => this.crdt.bulk(updates),
      this.opts.writeQueue,
    );
    this.crdt.clock.onTock(() => this._no_update_notify());
  }

  async attach(a: Attachable): Promise<Attached> {
    await this.ready();
    return this.crdt.blockstore.loader.attach(a);
  }

  // readonly _asDb = new ResolveOnce<Database>();
  // asDB(): Database {
  //   return this._asDb.once(() => new DatabaseImpl(this));
  // }

  subscribe<T extends DocTypes>(listener: ListenerFn<T>, updates?: boolean): () => void {
    this.ready();
    this.logger.Debug().Bool("updates", updates).Msg("subscribe");
    if (updates) {
      if (!this._listening) {
        this._listening = true;
        this.crdt.clock.onTick((updates: DocUpdate<NonNullable<unknown>>[]) => {
          void this._notify(updates);
        });
      }
      this._listeners.add(listener as ListenerFn<NonNullable<unknown>>);
      return () => {
        this._listeners.delete(listener as ListenerFn<NonNullable<unknown>>);
      };
    } else {
      this._noupdate_listeners.add(listener as ListenerFn<NonNullable<unknown>>);
      return () => {
        this._noupdate_listeners.delete(listener as ListenerFn<NonNullable<unknown>>);
      };
    }
  }

  private async _notify(updates: DocUpdate<DocTypes>[]) {
    await this.ready();
    if (this._listeners.size) {
      const docs: DocWithId<DocTypes>[] = updates.map(({ id, value }) => ({ ...value, _id: id }));
      for (const listener of this._listeners) {
        await (async () => await listener(docs as DocWithId<DocTypes>[]))().catch((e: Error) => {
          this.logger.Error().Err(e).Msg("subscriber error");
        });
      }
    }
  }

  private async _no_update_notify() {
    await this.ready();
    if (this._noupdate_listeners.size) {
      for (const listener of this._noupdate_listeners) {
        await (async () => await listener([]))().catch((e: Error) => {
          this.logger.Error().Err(e).Msg("subscriber error");
        });
      }
    }
  }
}

export function toStoreURIRuntime(sthis: SuperThis, name: string, sopts?: StoreUrlsOpts): StoreURIRuntime {
  sopts = sopts || {};
  if (!sopts.base) {
    const fp_env = sthis.env.get("FP_STORAGE_URL");
    if (fp_env) {
      sopts = { ...sopts, base: BuildURI.from(fp_env).setParam(PARAM.URL_GEN, "fromEnv") };
    } else {
      sopts = { ...sopts, base: getDefaultURI(sthis).build().setParam(PARAM.URL_GEN, "default") };
    }
  }
  const base = URI.from(sopts.base);
  // bbase.setParam(PARAM.NAME, name);
  // const base = bbase.URI();
  // readonly public?: boolean;
  // readonly meta?: DbMeta;
  // readonly persistIndexes?: boolean;
  // readonly autoCompact?: number;
  // readonly threshold?: number;
  return {
    idx: {
      car: ensureURIDefaults(sthis, name, sopts.idx?.car ?? sopts.data?.car, base, "car", { idx: true }),
      file: ensureURIDefaults(sthis, name, sopts.idx?.file ?? sopts.idx?.car ?? sopts.data?.file ?? sopts.data?.car, base, "file", {
        file: true,
        idx: true,
      }),
      meta: ensureURIDefaults(sthis, name, sopts.idx?.meta ?? sopts.data?.meta, base, "meta", { idx: true }),
      wal: ensureURIDefaults(sthis, name, sopts.idx?.wal ?? sopts.data?.wal, base, "wal", { idx: true }),
    },
    data: {
      car: ensureURIDefaults(sthis, name, sopts.data?.car, base, "car"),
      file: ensureURIDefaults(sthis, name, sopts.data?.file ?? sopts.data?.car, base, "file", { file: true }),
      meta: ensureURIDefaults(sthis, name, sopts.data?.meta, base, "meta"),
      wal: ensureURIDefaults(sthis, name, sopts.data?.wal, base, "wal"),
    },
  };
}

export function fireproof(name: string, opts?: ConfigOpts): Database {
  return new DatabaseImpl(LedgerFactory(name, opts));
}
