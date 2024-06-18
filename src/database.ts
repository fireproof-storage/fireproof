import { uuidv7 } from "uuidv7";

import { WriteQueue, writeQueue } from "./write-queue";
import { CRDT } from "./crdt";
import { index } from "./index";
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
} from "./types";
import { DbResponse, ChangesResponse } from "./types";
import { Connectable, EncryptedBlockstore } from "./storage-engine";

export class Database implements Connectable {
  static databases: Map<string, Database> = new Map();

  readonly name?: string;
  readonly opts: ConfigOpts = {};

  _listening = false;
  readonly _listeners: Set<ListenerFn<unknown>> = new Set();
  readonly _noupdate_listeners: Set<ListenerFn<unknown>> = new Set();
  readonly _crdt: CRDT<unknown>;
  readonly _writeQueue: WriteQueue<unknown>;
  readonly blockstore: EncryptedBlockstore;

  constructor(name?: string, opts?: ConfigOpts) {
    this.name = name;
    this.opts = opts || this.opts;
    this._crdt = new CRDT(name, this.opts);
    this.blockstore = this._crdt.blockstore; // for connector compatibility
    this._writeQueue = writeQueue(async (updates: DocUpdate<unknown>[]) => {
      return await this._crdt.bulk(updates);
    }); //, Infinity)
    this._crdt.clock.onTock(() => {
      this._no_update_notify();
    });
  }

  async get<T>(id: string): Promise<DocWithId<T>> {
    const got = await this._crdt.get(id).catch((e) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      e.message = `Not found: ${id} - ` + e.message;
      throw e;
    });
    if (!got) throw new Error(`Not found: ${id}`);
    const { doc } = got;
    return { ...doc, _id: id } as DocWithId<T>;
  }

  async put<T>(doc: DocSet<T>): Promise<DbResponse> {
    const { _id, ...value } = doc;
    const docId = _id || uuidv7();
    const result: CRDTMeta = await this._writeQueue.push({
      id: docId,
      value: {
        ...value,
        _id: docId,
      }
    });
    return { id: docId, clock: result?.head };
  }

  async del(id: string): Promise<DbResponse> {
    const result = await this._writeQueue.push({ key: id, del: true });
    return { id, clock: result?.head } as DbResponse;
  }

  async changes<T>(since: ClockHead = [], opts: ChangesOptions = {}): Promise<ChangesResponse<T>> {
    const { result, head } = await this._crdt.changes(since, opts);
    const rows = result.map(({ id: key, value, del, clock }) => ({
      key,
      value: (del ? { _id: key, _deleted: true } : { _id: key, ...value }) as DocWithId<T>,
      clock,
    }));
    return { rows, clock: head };
  }

  async allDocs<T>(): Promise<{
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

  async allDocuments<T>(): Promise<{
    rows: {
      key: string;
      value: DocWithId<T>;
    }[];
    clock: ClockHead;
  }> {
    return this.allDocs<T>();
  }

  subscribe<T>(listener: ListenerFn<T>, updates?: boolean): () => void {
    if (updates) {
      if (!this._listening) {
        this._listening = true;
        this._crdt.clock.onTick((updates: DocUpdate<unknown>[]) => {
          void this._notify(updates);
        });
      }
      this._listeners.add(listener);
      return () => {
        this._listeners.delete(listener);
      };
    } else {
      this._noupdate_listeners.add(listener);
      return () => {
        this._noupdate_listeners.delete(listener);
      };
    }
  }

  // todo if we add this onto dbs in fireproof.ts then we can make index.ts a separate package
  async query<K extends IndexKeyType, T>(
    field: string | MapFn<T>,
    opts: QueryOpts<K> = {},
  ): Promise<{
    rows: IndexRow<K, T>[];
  }> {
    const idx =
      typeof field === "string"
        ? index({ _crdt: this._crdt }, field)
        : index({ _crdt: this._crdt }, makeName(field.toString()), field);
    return await idx.query(opts) as { rows: IndexRow<K, T>[] };
  }

  async compact() {
    await this._crdt.compact();
  }

  async _notify(updates: DocUpdate<unknown>[]) {
    if (this._listeners.size) {
      const docs: DocWithId<unknown>[] = updates.map(({ id, value }) => ({ _id: id, ...value }));
      for (const listener of this._listeners) {
        await (async () => await listener(docs))().catch((e: Error) => {
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

type UpdateListenerFn<T> = (docs: DocWithId<T>[]) => Promise<void> | void;
type NoUpdateListenerFn = () => Promise<void> | void;
type ListenerFn<T> = UpdateListenerFn<T> | NoUpdateListenerFn;

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
