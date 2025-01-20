import { BuildURI, CoerceURI, KeyedResolvOnce, Logger, ResolveOnce, URI } from "@adviser/cement";

import { defaultWriteQueueOpts, writeQueue, WriteQueueParams } from "./write-queue.js";
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
} from "./types.js";
import { PARAM } from "./types.js";
import { DbMeta, SerdeGatewayInterceptor, StoreEnDeFile, StoreURIRuntime, StoreUrlsOpts } from "./blockstore/index.js";
import { ensureLogger, ensureSuperThis, toSortedArray } from "./utils.js";

import { decodeFile, encodeFile } from "./runtime/files.js";
import { defaultKeyBagOpts, KeyBagRuntime } from "./runtime/key-bag.js";
import { getDefaultURI } from "./blockstore/register-store-protocol.js";
import { DatabaseImpl } from "./database.js";
import { CRDTImpl } from "./crdt.js";

const ledgers = new KeyedResolvOnce<Ledger>();

export function keyConfigOpts(sthis: SuperThis, name?: string, opts?: ConfigOpts): string {
  return JSON.stringify(
    toSortedArray({
      name,
      stores: toSortedArray(JSON.parse(JSON.stringify(toStoreURIRuntime(sthis, name, opts?.storeUrls)))),
    }),
  );
}

export interface LedgerOpts {
  readonly name?: string;
  // readonly public?: boolean;
  readonly meta?: DbMeta;
  readonly gatewayInterceptor?: SerdeGatewayInterceptor;

  readonly writeQueue: WriteQueueParams;
  // readonly factoryUnreg?: () => void;
  // readonly persistIndexes?: boolean;
  // readonly autoCompact?: number;
  readonly storeUrls: StoreURIRuntime;
  readonly storeEnDe: StoreEnDeFile;
  readonly keyBag: KeyBagRuntime;
  // readonly threshold?: number;
}

export function isLedger(db: unknown): db is Ledger {
  return db instanceof LedgerImpl || db instanceof LedgerShell;
}

export function LedgerFactory(name: string | undefined, opts?: ConfigOpts): Ledger {
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

  get name(): string {
    return this.opts.storeUrls.data.data.getParam(PARAM.NAME) || "default";
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

  // readonly _asDb = new ResolveOnce<Database>();
  // asDB(): Database {
  //   return this._asDb.once(() => new DatabaseImpl(this));
  // }

  subscribe<T extends DocTypes>(listener: ListenerFn<T>, updates?: boolean): () => void {
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

function defaultURI(
  sthis: SuperThis,
  curi: CoerceURI | undefined,
  uri: URI,
  store: "data" | "meta" | "wal",
  ctx?: Partial<{
    readonly idx: boolean;
    readonly file: boolean;
  }>,
): URI {
  ctx = ctx || {};
  const ret = (curi ? URI.from(curi) : uri).build().setParam(PARAM.STORE, store);
  if (!ret.hasParam(PARAM.NAME)) {
    const name = sthis.pathOps.basename(ret.URI().pathname);
    if (!name) {
      throw sthis.logger.Error().Url(ret).Any("ctx", ctx).Msg("Ledger name is required").AsError();
    }
    ret.setParam(PARAM.NAME, name);
  }
  if (ctx.idx) {
    ret.defParam(PARAM.INDEX, "idx");
    ret.defParam(PARAM.STORE_KEY, `@${ret.getParam(PARAM.NAME)}-${store}-idx@`);
  } else {
    ret.defParam(PARAM.STORE_KEY, `@${ret.getParam(PARAM.NAME)}-${store}@`);
  }
  if (store === "data") {
    if (ctx.file) {
      // ret.defParam(PARAM.SUFFIX, "");
    } else {
      ret.defParam(PARAM.SUFFIX, ".car");
    }
  }
  return ret.URI();
}

export function toStoreURIRuntime(sthis: SuperThis, name?: string, sopts?: StoreUrlsOpts): StoreURIRuntime {
  sopts = sopts || {};
  if (!sopts.base) {
    const fp_env = sthis.env.get("FP_STORAGE_URL");
    if (fp_env) {
      sopts = { ...sopts, base: BuildURI.from(fp_env).setParam(PARAM.URL_GEN, "fromEnv") };
    } else {
      sopts = { ...sopts, base: getDefaultURI(sthis).build().setParam(PARAM.URL_GEN, "default") };
    }
  }
  const bbase = BuildURI.from(sopts.base);
  if (name) {
    bbase.setParam(PARAM.NAME, name);
  }
  const base = bbase.URI();
  // readonly public?: boolean;
  // readonly meta?: DbMeta;
  // readonly persistIndexes?: boolean;
  // readonly autoCompact?: number;
  // readonly threshold?: number;
  return {
    idx: {
      data: defaultURI(sthis, sopts.idx?.data, base, "data", { idx: true }),
      file: defaultURI(sthis, sopts.idx?.data, base, "data", { file: true, idx: true }),
      meta: defaultURI(sthis, sopts.idx?.meta, base, "meta", { idx: true }),
      wal: defaultURI(sthis, sopts.idx?.wal, base, "wal", { idx: true }),
    },
    data: {
      data: defaultURI(sthis, sopts.data?.data, base, "data"),
      file: defaultURI(sthis, sopts.data?.data, base, "data", { file: true }),
      meta: defaultURI(sthis, sopts.data?.meta, base, "meta"),
      wal: defaultURI(sthis, sopts.data?.wal, base, "wal"),
    },
  };
}

class Fireproof {
  Ledger(name: string, opts?: ConfigOpts): Ledger {
    return LedgerFactory(name, opts);
  }
  DB(name: string, opts?: ConfigOpts): Database {
    return new DatabaseImpl(this.Ledger(name, opts));
  }
}

export const fireproof = new Fireproof();
