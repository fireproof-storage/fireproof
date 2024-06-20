import { uuidv7 } from "uuidv7";

import { WriteQueue, writeQueue } from "./write-queue";
import { CRDT } from "./crdt";
import { index } from "./indexer";
import type {
  CRDTMeta,
  DocUpdate,
  ClockHead,
  ConfigOpts,
  MapFn,
  QueryOpts,
  ChangesOptions,
  IndexRow,
  DocSet,
  DocWithId,
  IndexKeyType,
  ListenerFn,
  DbResponse, ChangesResponse, DocRecord,
  DocTypes,
  DocObject,
  IndexRows,
  DocFragment,
  ChangesResponseRow
} from "./types";
import { Connectable, EncryptedBlockstore } from "./storage-engine";

export class Database<DT extends DocTypes = {}> implements Connectable {
  static databases = new Map<string, Database>();

  readonly name?: string;
  readonly opts: ConfigOpts = {};

  _listening = false;
  readonly _listeners = new Set<ListenerFn<DT>>();
  readonly _noupdate_listeners = new Set<ListenerFn<DT>>();
  readonly _crdt: CRDT<DT>;
  readonly _writeQueue: WriteQueue<DT>;
  readonly blockstore: EncryptedBlockstore;

  constructor(name?: string, opts?: ConfigOpts) {
    this.name = name;
    this.opts = opts || this.opts;
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
    const got = await this._crdt.get(id).catch((e) => {

      e.message = `Not found: ${id} - ` + e.message;
      throw e;
    });
    if (!got) throw new Error(`Not found: ${id}`);
    const { doc } = got;
    return { ...(doc as unknown as DocWithId<T>), _id: id }
  }

  async put<T extends DocTypes>(doc: DocSet<T>): Promise<DbResponse> {
    const { _id, ...value } = doc;
    const docId = _id || uuidv7();
    const result: CRDTMeta = await this._writeQueue.push({
      id: docId,
      value: {
        ...value as unknown as DocSet<DT>,
        _id: docId,
      }
    });
    return { id: docId, clock: result?.head };
  }

  async del(id: string): Promise<DbResponse> {
    const result = await this._writeQueue.push({ id: id, del: true });
    return { id, clock: result?.head } as DbResponse;
  }

  async changes<T extends DocTypes>(since: ClockHead = [], opts: ChangesOptions = {}): Promise<ChangesResponse<T>> {
    const { result, head } = await this._crdt.changes(since, opts);
    const rows: ChangesResponseRow<T>[] = result.map(({ id: key, value, del, clock }) => ({
      key,
      value: (del ? { _id: key, _deleted: true } : { _id: key, ...value }) as DocWithId<T>,
      clock,
    }));
    return { rows, clock: head };
  }

  async allDocs<T extends DocTypes>(): Promise<{
    rows: {
      key: string;
      value: DocWithId<T>;
    }[];
    clock: ClockHead;
  }> {
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
        this._crdt.clock.onTick((updates: DocUpdate<{}>[]) => {
          void this._notify(updates);
        });
      }
      this._listeners.add(listener as ListenerFn<{}>);
      return () => {
        this._listeners.delete(listener as ListenerFn<{}>);
      };
    } else {
      this._noupdate_listeners.add(listener as ListenerFn<{}>);
      return () => {
        this._noupdate_listeners.delete(listener as ListenerFn<{}>);
      };
    }
  }

  // todo if we add this onto dbs in fireproof.ts then we can make index.ts a separate package
  async query<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T>(
    field: string | MapFn<T>,
    opts: QueryOpts<K> = {},
  ): Promise<IndexRows<K, T, R>> {
    const _crdt = this._crdt as unknown as CRDT<T>;
    const idx =
      typeof field === "string"
        ? index<K, T, R>({ _crdt }, field)
        : index<K, T, R>({ _crdt }, makeName(field.toString()), field);
    return await idx.query(opts)
  }

  async compact() {
    await this._crdt.compact();
  }

  async _notify(updates: DocUpdate<{}>[]) {
    if (this._listeners.size) {
      const docs: DocWithId<{}>[] = updates.map(({ id, value }) => ({ ...value, _id: id }));
      for (const listener of this._listeners) {
        await (async () => await listener(docs as DocWithId<DT>[]))().catch((e: Error) => {
          console.error("subscriber error", e);
        });
      }
    }
  }

  async _no_update_notify() {
    if (this._noupdate_listeners.size) {
      for (const listener of this._noupdate_listeners) {
        await (async () => await listener([]))().catch((e: Error) => {
          console.error("subscriber error", e);
        });
      }
    }
  }
}


export function fireproof(name: string, opts?: ConfigOpts): Database {
  if (!Database.databases.has(name)) {
    Database.databases.set(name, new Database(name, opts));
  }
  return Database.databases.get(name)!;
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
