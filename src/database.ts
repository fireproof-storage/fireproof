import { uuidv7 } from "uuidv7";
import { Logger, ResolveOnce } from "@adviser/cement";

import { WriteQueue, writeQueue } from "./write-queue.js";
import { CRDT } from "./crdt.js";
import { index } from "./indexer.js";
import type {
  DocUpdate,
  ClockHead,
  ConfigOpts,
  MapFn,
  QueryOpts,
  ChangesOptions,
  DocSet,
  DocWithId,
  IndexKeyType,
  ListenerFn,
  DbResponse,
  ChangesResponse,
  DocTypes,
  IndexRows,
  DocFragment,
  ChangesResponseRow,
  CRDTMeta,
  AllDocsQueryOpts,
} from "./types.js";
import { BaseBlockstore, Connectable } from "./blockstore/index.js";
import { SysContainer } from "./runtime/sys-container.js";
import { ensureLogger } from "./utils.js";
import { NotFoundError } from "./blockstore/gateway.js";

export class Database<DT extends DocTypes = NonNullable<unknown>> implements Connectable {
  static databases = new Map<string, Database>();

  readonly name?: string;
  readonly opts: ConfigOpts = {};

  _listening = false;
  readonly _listeners = new Set<ListenerFn<DT>>();
  readonly _noupdate_listeners = new Set<ListenerFn<DT>>();
  readonly _crdt: CRDT<DT>;
  readonly _writeQueue: WriteQueue<DT>;
  readonly blockstore: BaseBlockstore;

  async close() {
    await this.ready();
    await this._crdt.close();
    await this.blockstore.close();
  }

  async destroy() {
    await this.ready();
    await this._crdt.destroy();
    await this.blockstore.destroy();
  }

  readonly _ready = new ResolveOnce<void>();
  async ready() {
    return this._ready.once(async () => {
      await SysContainer.start();
      await this._crdt.ready();
      await this.blockstore.ready();
    });
  }

  readonly logger: Logger;

  constructor(name?: string, opts?: ConfigOpts) {
    this.name = name;
    this.opts = opts || this.opts;
    this.logger = ensureLogger(this.opts, "Database");
    this._crdt = new CRDT(name, this.opts);
    this.blockstore = this._crdt.blockstore; // for connector compatibility
    this._writeQueue = writeQueue(async (updates: DocUpdate<DT>[]) => {
      return await this._crdt.bulk(updates);
    }); //, Infinity)
    this._crdt.clock.onTock(() => {
      this._no_update_notify();
    });
  }

  async get<T extends DocTypes>(id: string): Promise<DocWithId<T>> {
    this.logger.Debug().Str("id", id).Msg("get-pre-ready");
    await this.ready();
    this.logger.Debug().Str("id", id).Msg("get-post-ready");
    const got = await this._crdt.get(id).catch((e) => {
      throw new NotFoundError(`Not found: ${id} - ${e.message}`);
    });
    if (!got) throw new NotFoundError(`Not found: ${id}`);
    const { doc } = got;
    return { ...(doc as unknown as DocWithId<T>), _id: id };
  }

  async put<T extends DocTypes>(doc: DocSet<T>): Promise<DbResponse> {
    this.logger.Debug().Str("id", doc._id).Msg("put-pre-ready");
    await this.ready();
    this.logger.Debug().Str("id", doc._id).Msg("put-post-ready");
    const { _id, ...value } = doc;
    const docId = _id || uuidv7();
    const result = (await this._writeQueue.push({
      id: docId,
      value: {
        ...(value as unknown as DocSet<DT>),
        _id: docId,
      },
    })) as CRDTMeta;
    return { id: docId, clock: result?.head };
  }

  async del(id: string): Promise<DbResponse> {
    await this.ready();
    const result = (await this._writeQueue.push({ id: id, del: true })) as CRDTMeta;
    return { id, clock: result?.head } as DbResponse;
  }

  async changes<T extends DocTypes>(since: ClockHead = [], opts: ChangesOptions = {}): Promise<ChangesResponse<T>> {
    await this.ready();
    const { result, head } = await this._crdt.changes(since, opts);
    const rows: ChangesResponseRow<T>[] = result.map(({ id: key, value, del, clock }) => ({
      key,
      value: (del ? { _id: key, _deleted: true } : { _id: key, ...value }) as DocWithId<T>,
      clock,
    }));
    return { rows, clock: head };
  }

  async allDocs<T extends DocTypes>(
    opts: AllDocsQueryOpts = {},
  ): Promise<{
    rows: {
      key: string;
      value: DocWithId<T>;
    }[];
    clock: ClockHead;
  }> {
    await this.ready();
    void opts;
    const { result, head } = await this._crdt.allDocs();
    const rows = result.map(({ id: key, value, del }) => ({
      key,
      value: (del ? { _id: key, _deleted: true } : { _id: key, ...value }) as DocWithId<T>,
    }));
    return { rows, clock: head };
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
    if (updates) {
      if (!this._listening) {
        this._listening = true;
        this._crdt.clock.onTick((updates: DocUpdate<NonNullable<unknown>>[]) => {
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
    const _crdt = this._crdt as unknown as CRDT<T>;
    const idx =
      typeof field === "string" ? index<K, T, R>({ _crdt }, field) : index<K, T, R>({ _crdt }, makeName(field.toString()), field);
    return await idx.query(opts);
  }

  async compact() {
    await this.ready();
    await this._crdt.compact();
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

function toSortedArray(set?: Record<string, unknown>): Record<string, unknown>[] {
  if (!set) return [];
  return Object.entries(set)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => ({ [k]: v }));
}

export function fireproof(name: string, opts?: ConfigOpts): Database {
  const key = JSON.stringify(
    toSortedArray({
      name,
      stores: toSortedArray(opts?.store?.stores),

      makeMetaStore: !!opts?.store?.makeMetaStore,
      makeDataStore: !!opts?.store?.makeDataStore,
      makeRemoteWAL: !!opts?.store?.makeRemoteWAL,

      encodeFile: !!opts?.store?.encodeFile,
      decodeFile: !!opts?.store?.decodeFile,
    }),
  );
  let db = Database.databases.get(key);
  if (!db) {
    db = new Database(name, opts);
    Database.databases.set(key, db);
  }
  return db;
}

function makeName(fnString: string) {
  const regex = /\(([^,()]+,\s*[^,()]+|\[[^\]]+\],\s*[^,()]+)\)/g;
  let found: RegExpExecArray | null = null;
  const matches = Array.from(fnString.matchAll(regex), (match) => match[1].trim());
  if (matches.length === 0) {
    found = /=>\s*(.*)/.exec(fnString);
  }
  if (!found) {
    return fnString;
  } else {
    // it's a consise arrow function, match everything after the arrow
    return found[1];
  }
}
