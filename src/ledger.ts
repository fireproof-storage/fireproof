import { BuildURI, CoerceURI, KeyedResolvOnce, Logger, ResolveOnce, URI } from "@adviser/cement";

import { WriteQueue, writeQueue } from "./write-queue.js";
import { CRDT, HasCRDT } from "./crdt.js";
import { index } from "./indexer.js";
import {
  type DocUpdate,
  type ConfigOpts,
  type MapFn,
  type QueryOpts,
  type DocSet,
  type DocWithId,
  type IndexKeyType,
  type DocResponse,
  type DocTypes,
  type IndexRows,
  type DocFragment,
  type CRDTMeta,
  type SuperThis,
  PARAM,
  QueryResponse,
} from "./types.js";
import { DbMeta, StoreEnDeFile, StoreURIRuntime, StoreUrlsOpts, getDefaultURI, GatewayInterceptor } from "./blockstore/index.js";
import { ensureLogger, ensureSuperThis, NotFoundError, toSortedArray } from "./utils.js";

import { decodeFile, encodeFile } from "./runtime/files.js";
import { defaultKeyBagOpts, KeyBagRuntime } from "./runtime/key-bag.js";

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
  readonly gatewayInterceptor?: GatewayInterceptor;
  // readonly factoryUnreg?: () => void;
  // readonly persistIndexes?: boolean;
  // readonly autoCompact?: number;
  readonly storeUrls: StoreURIRuntime;
  readonly storeEnDe: StoreEnDeFile;
  readonly keyBag: KeyBagRuntime;
  // readonly threshold?: number;
}

export interface Ledger<DT extends DocTypes = NonNullable<unknown>> extends HasCRDT<DT> {
  // readonly name: string;
  readonly logger: Logger;
  readonly sthis: SuperThis;
  readonly id: string;

  readonly name: string;

  onClosed(fn: () => void): void;

  close(): Promise<void>;
  destroy(): Promise<void>;
  ready(): Promise<void>;

  get<T extends DocTypes>(id: string): Promise<DocWithId<T>>;
  put<T extends DocTypes>(doc: DocSet<T>): Promise<DocResponse>;
  del(id: string): Promise<DocResponse>;
  allDocs<T extends DocTypes>(): QueryResponse<T>;
  allDocuments<T extends DocTypes>(): QueryResponse<T>;

  query<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T>(
    field: string | MapFn<T>,
    opts?: QueryOpts<K>,
  ): Promise<IndexRows<K, T, R>>;
  compact(): Promise<void>;
}

export function isLedger<T extends DocTypes = NonNullable<unknown>>(db: unknown): db is Ledger<T> {
  return db instanceof LedgerImpl || db instanceof LedgerShell;
}

export function LedgerFactory<T extends DocTypes = NonNullable<unknown>>(name: string | undefined, opts?: ConfigOpts): Ledger<T> {
  const sthis = ensureSuperThis(opts);
  return new LedgerShell<T>(
    ledgers.get(keyConfigOpts(sthis, name, opts)).once((key) => {
      const db = new LedgerImpl<T>(sthis, {
        name,
        meta: opts?.meta,
        keyBag: defaultKeyBagOpts(sthis, opts?.keyBag),
        storeUrls: toStoreURIRuntime(sthis, name, opts?.storeUrls),
        gatewayInterceptor: opts?.gatewayInterceptor,
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

export class LedgerShell<DT extends DocTypes = NonNullable<unknown>> implements Ledger<DT> {
  readonly ref: LedgerImpl<DT>;
  constructor(ref: LedgerImpl<DT>) {
    this.ref = ref;
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
  get crdt(): CRDT<DT> {
    return this.ref.crdt;
  }
  get name(): string {
    return this.ref.name;
  }
  onClosed(fn: () => void): void {
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
  get<T extends DocTypes>(id: string): Promise<DocWithId<T>> {
    return this.ref.get(id);
  }
  put<T extends DocTypes>(doc: DocSet<T>): Promise<DocResponse> {
    return this.ref.put(doc);
  }
  del(id: string): Promise<DocResponse> {
    return this.ref.del(id);
  }
  allDocs<T extends DocTypes>(): QueryResponse<T> {
    return this.ref.allDocs();
  }
  allDocuments<T extends DocTypes>(): QueryResponse<T> {
    return this.ref.allDocuments();
  }
  query<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T>(
    field: string | MapFn<T>,
    opts?: QueryOpts<K>,
  ): Promise<IndexRows<K, T, R>> {
    return this.ref.query(field, opts);
  }
  compact(): Promise<void> {
    return this.ref.compact();
  }
}

class LedgerImpl<DT extends DocTypes = NonNullable<unknown>> implements Ledger<DT> {
  // readonly name: string;
  readonly opts: LedgerOpts;

  readonly crdt: CRDT<DT>;
  readonly _writeQueue: WriteQueue<DT>;
  // readonly blockstore: BaseBlockstore;

  readonly shells: Set<LedgerShell<DT>> = new Set<LedgerShell<DT>>();

  addShell(shell: LedgerShell<DT>) {
    this.shells.add(shell);
  }

  readonly _onClosedFns = new Set<() => void>();
  onClosed(fn: () => void) {
    this._onClosedFns.add(fn);
  }
  async close() {
    throw this.logger.Error().Str("db", this.name).Msg(`use shellClose`).AsError();
  }
  async shellClose(db: LedgerShell<DT>) {
    if (!this.shells.has(db)) {
      throw this.logger.Error().Str("db", this.name).Msg(`LedgerShell mismatch`).AsError();
    }
    this.shells.delete(db);
    if (this.shells.size === 0) {
      await this.ready();
      await this.crdt.close();
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
    // this.logger.SetDebug("Ledger")
    this.crdt = new CRDT(this.sthis, this.opts);
    // this.blockstore = this._crdt.blockstore; // for connector compatibility
    this._writeQueue = writeQueue(async (updates: DocUpdate<DT>[]) => {
      return await this.crdt.bulk(updates);
    }); //, Infinity)
  }

  get name(): string {
    return this.opts.storeUrls.data.data.getParam(PARAM.NAME) || "default";
  }

  async get<T extends DocTypes>(id: string): Promise<DocWithId<T>> {
    if (!id) throw this.logger.Error().Str("db", this.name).Msg(`Doc id is required`).AsError();

    await this.ready();
    this.logger.Debug().Str("id", id).Msg("get");
    const got = await this.crdt.get(id).catch((e) => {
      throw new NotFoundError(`Not found: ${id} - ${e.message}`);
    });
    if (!got) throw new NotFoundError(`Not found: ${id}`);
    const { doc } = got;
    return { ...(doc as unknown as DocWithId<T>), _id: id };
  }

  async put<T extends DocTypes>(doc: DocSet<T>): Promise<DocResponse> {
    await this.ready();
    this.logger.Debug().Str("id", doc._id).Msg("put");
    const { _id, ...value } = doc;
    const docId = _id || this.sthis.timeOrderedNextId().str;
    const result = (await this._writeQueue.push({
      id: docId,
      value: {
        ...(value as unknown as DocSet<DT>),
        _id: docId,
      },
    })) as CRDTMeta;
    return { id: docId, clock: result?.head, name: this.name } as DocResponse;
  }

  async del(id: string): Promise<DocResponse> {
    await this.ready();
    this.logger.Debug().Str("id", id).Msg("del");
    const result = (await this._writeQueue.push({ id: id, del: true })) as CRDTMeta;
    return { id, clock: result?.head, name: this.name } as DocResponse;
  }

  allDocs<T extends DocTypes>(): QueryResponse<T> {
    this.logger.Debug().Msg("allDocs");
    return this.crdt.allDocs({ waitFor: this.ready() });
  }

  allDocuments<T extends DocTypes>(): QueryResponse<T> {
    return this.allDocs<T>();
  }

  // todo if we add this onto dbs in fireproof.ts then we can make index.ts a separate package
  async query<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T>(
    field: string | MapFn<T>,
    opts: QueryOpts<K> = {},
  ): Promise<IndexRows<K, T, R>> {
    await this.ready();
    this.logger.Debug().Any("field", field).Any("opts", opts).Msg("query");
    const _crdt = this.crdt as unknown as CRDT<T>;
    const idx =
      typeof field === "string"
        ? index<K, T, R>({ crdt: _crdt }, field)
        : index<K, T, R>({ crdt: _crdt }, makeName(field.toString()), field);
    return await idx.query(opts);
  }

  async compact() {
    await this.ready();
    await this.crdt.compact();
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

export function fireproof(name: string, opts?: ConfigOpts): Ledger {
  return LedgerFactory(name, opts);
}

function makeName(fnString: string) {
  const regex = /\(([^,()]+,\s*[^,()]+|\[[^\]]+\],\s*[^,()]+)\)/g;
  let found: RegExpExecArray | null = null;
  const matches = Array.from(fnString.matchAll(regex), (match) => match[1].trim());
  if (matches.length === 0) {
    found = /=>\s*{?\s*([^{}]+)\s*}?/.exec(fnString);
    if (found && found[1].includes("return")) {
      found = null;
    }
  }
  if (!found) {
    return fnString;
  } else {
    // it's a consise arrow function, match everything after the arrow
    return found[1];
  }
}
