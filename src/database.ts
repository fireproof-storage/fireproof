import { BuildURI, CoerceURI, KeyedResolvOnce, Logger, ResolveOnce, URI } from "@adviser/cement";

import { defaultWriteQueueOpts, WriteQueue, writeQueue, WriteQueueParams } from "./write-queue.js";
import { CRDT, HasCRDT } from "./crdt.js";
import { index } from "./indexer.js";
import {
  type DocUpdate,
  type ClockHead,
  type ConfigOpts,
  type MapFn,
  type QueryOpts,
  type ChangesOptions,
  type DocSet,
  type DocWithId,
  type IndexKeyType,
  type ListenerFn,
  type DocResponse,
  type BulkResponse,
  type ChangesResponse,
  type DocTypes,
  type IndexRows,
  type DocFragment,
  type ChangesResponseRow,
  type CRDTMeta,
  type AllDocsQueryOpts,
  type AllDocsResponse,
  type SuperThis,
  PARAM,
} from "./types.js";
import { DbMeta, SerdeGatewayInterceptor, StoreEnDeFile, StoreURIRuntime, StoreUrlsOpts } from "./blockstore/index.js";
import { ensureLogger, ensureSuperThis, NotFoundError, toSortedArray } from "./utils.js";

import { decodeFile, encodeFile } from "./runtime/files.js";
import { defaultKeyBagOpts, KeyBagRuntime } from "./runtime/key-bag.js";
import { getDefaultURI } from "./blockstore/register-store-protocol.js";

const databases = new KeyedResolvOnce<Database>();

export function keyConfigOpts(sthis: SuperThis, name?: string, opts?: ConfigOpts): string {
  return JSON.stringify(
    toSortedArray({
      name,
      stores: toSortedArray(JSON.parse(JSON.stringify(toStoreURIRuntime(sthis, name, opts?.storeUrls)))),
    }),
  );
}

export interface DatabaseOpts {
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

export interface Database<DT extends DocTypes = NonNullable<unknown>> extends HasCRDT<DT> {
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
  bulk<T extends DocTypes>(docs: DocSet<T>[]): Promise<BulkResponse>;
  del(id: string): Promise<DocResponse>;
  changes<T extends DocTypes>(since?: ClockHead, opts?: ChangesOptions): Promise<ChangesResponse<T>>;
  allDocs<T extends DocTypes>(opts?: AllDocsQueryOpts): Promise<AllDocsResponse<T>>;
  allDocuments<T extends DocTypes>(): Promise<{
    rows: {
      key: string;
      value: DocWithId<T>;
    }[];
    clock: ClockHead;
  }>;
  subscribe<T extends DocTypes>(listener: ListenerFn<T>, updates?: boolean): () => void;

  query<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T>(
    field: string | MapFn<T>,
    opts?: QueryOpts<K>,
  ): Promise<IndexRows<K, T, R>>;
  compact(): Promise<void>;
}

export function isDatabase<T extends DocTypes = NonNullable<unknown>>(db: unknown): db is Database<T> {
  return db instanceof DatabaseImpl || db instanceof DatabaseShell;
}

export function DatabaseFactory<T extends DocTypes = NonNullable<unknown>>(name: string | undefined, opts?: ConfigOpts): Database<T> {
  const sthis = ensureSuperThis(opts);
  return new DatabaseShell<T>(
    databases.get(keyConfigOpts(sthis, name, opts)).once((key) => {
      const db = new DatabaseImpl<T>(sthis, {
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
        databases.unget(key);
      });
      return db;
    }),
  );
}

export class DatabaseShell<DT extends DocTypes = NonNullable<unknown>> implements Database<DT> {
  readonly ref: DatabaseImpl<DT>;
  constructor(ref: DatabaseImpl<DT>) {
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
  bulk<T extends DocTypes>(docs: DocSet<T>[]): Promise<BulkResponse> {
    return this.ref.bulk(docs);
  }
  del(id: string): Promise<DocResponse> {
    return this.ref.del(id);
  }
  changes<T extends DocTypes>(since?: ClockHead, opts?: ChangesOptions): Promise<ChangesResponse<T>> {
    return this.ref.changes(since, opts);
  }
  allDocs<T extends DocTypes>(opts?: AllDocsQueryOpts): Promise<AllDocsResponse<T>> {
    return this.ref.allDocs(opts);
  }
  allDocuments<T extends DocTypes>(): Promise<{
    rows: {
      key: string;
      value: DocWithId<T>;
    }[];
    clock: ClockHead;
  }> {
    return this.ref.allDocuments();
  }
  subscribe<T extends DocTypes>(listener: ListenerFn<T>, updates?: boolean): () => void {
    return this.ref.subscribe(listener, updates);
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

class DatabaseImpl<DT extends DocTypes = NonNullable<unknown>> implements Database<DT> {
  // readonly name: string;
  readonly opts: DatabaseOpts;

  _listening = false;
  readonly _listeners = new Set<ListenerFn<DT>>();
  readonly _noupdate_listeners = new Set<ListenerFn<DT>>();
  readonly crdt: CRDT<DT>;
  readonly _writeQueue: WriteQueue<DT>;
  // readonly blockstore: BaseBlockstore;

  readonly shells: Set<DatabaseShell<DT>> = new Set<DatabaseShell<DT>>();

  addShell(shell: DatabaseShell<DT>) {
    this.shells.add(shell);
  }

  readonly _onClosedFns = new Set<() => void>();
  onClosed(fn: () => void) {
    this._onClosedFns.add(fn);
  }
  async close() {
    throw this.logger.Error().Str("db", this.name).Msg(`use shellClose`).AsError();
  }
  async shellClose(db: DatabaseShell<DT>) {
    if (!this.shells.has(db)) {
      throw this.logger.Error().Str("db", this.name).Msg(`DatabaseShell mismatch`).AsError();
    }
    this.shells.delete(db);
    if (this.shells.size === 0) {
      await this.ready();
      await this.crdt.close();
      await this._writeQueue.close();
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

  constructor(sthis: SuperThis, opts: DatabaseOpts) {
    this.opts = opts; // || this.opts;
    // this.name = opts.storeUrls.data.data.getParam(PARAM.NAME) || "default";
    this.sthis = sthis;
    this.id = sthis.timeOrderedNextId().str;
    this.logger = ensureLogger(this.sthis, "Database");
    this.crdt = new CRDT(this.sthis, this.opts);
    this._writeQueue = writeQueue(this.sthis, async (updates: DocUpdate<DT>[]) => this.crdt.bulk(updates), this.opts.writeQueue);
    this.crdt.clock.onTock(() => this._no_update_notify());
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

  async bulk<T extends DocTypes>(docs: DocSet<T>[]): Promise<BulkResponse> {
    await this.ready();

    const updates = docs.map((doc) => {
      const id = doc._id || this.sthis.timeOrderedNextId().str;
      return {
        id,
        value: {
          ...(doc as unknown as DocSet<DT>),
          _id: id,
        },
      };
    });
    const result = (await this._writeQueue.bulk(updates)) as CRDTMeta;
    return { ids: updates.map((u) => u.id), clock: result.head, name: this.name } as BulkResponse;
  }

  async del(id: string): Promise<DocResponse> {
    await this.ready();
    this.logger.Debug().Str("id", id).Msg("del");
    const result = (await this._writeQueue.push({ id: id, del: true })) as CRDTMeta;
    return { id, clock: result?.head, name: this.name } as DocResponse;
  }

  async changes<T extends DocTypes>(since: ClockHead = [], opts: ChangesOptions = {}): Promise<ChangesResponse<T>> {
    await this.ready();
    this.logger.Debug().Any("since", since).Any("opts", opts).Msg("changes");
    const { result, head } = await this.crdt.changes(since, opts);
    const rows: ChangesResponseRow<T>[] = result.map(({ id: key, value, del, clock }) => ({
      key,
      value: (del ? { _id: key, _deleted: true } : { _id: key, ...value }) as DocWithId<T>,
      clock,
    }));
    return { rows, clock: head, name: this.name };
  }

  async allDocs<T extends DocTypes>(opts: AllDocsQueryOpts = {}): Promise<AllDocsResponse<T>> {
    await this.ready();
    void opts;
    this.logger.Debug().Msg("allDocs");
    const { result, head } = await this.crdt.allDocs();
    const rows = result.map(({ id: key, value, del }) => ({
      key,
      value: (del ? { _id: key, _deleted: true } : { _id: key, ...value }) as DocWithId<T>,
    }));
    return { rows, clock: head, name: this.name };
  }

  async allDocuments<T extends DocTypes>(): Promise<{
    rows: {
      key: string;
      value: DocWithId<T>;
    }[];
    clock: ClockHead;
  }> {
    return this.allDocs<T>();
  }

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

  async _notify(updates: DocUpdate<NonNullable<unknown>>[]) {
    await this.ready();
    if (this._listeners.size) {
      const docs: DocWithId<NonNullable<unknown>>[] = updates.map(({ id, value }) => ({ ...value, _id: id }));
      for (const listener of this._listeners) {
        await (async () => await listener(docs as DocWithId<DT>[]))().catch((e: Error) => {
          this.logger.Error().Err(e).Msg("subscriber error");
        });
      }
    }
  }

  async _no_update_notify() {
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
      throw sthis.logger.Error().Url(ret).Any("ctx", ctx).Msg("Database name is required").AsError();
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

export function fireproof(name: string, opts?: ConfigOpts): Database {
  return DatabaseFactory(name, opts);
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
