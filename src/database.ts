import { Logger } from "@adviser/cement";
import { index } from "./indexer.js";
import {
  type ClockHead,
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
} from "./types.js";
import { ensureLogger, NotFoundError } from "./utils.js";

import { Ledger, makeName } from "./ledger.js";

export interface Database /* <DT extends DocTypes = NonNullable<unknown>> extends HasCRDT<DT>*/ {
  // readonly name: string;
  readonly ledger: Ledger;
  readonly logger: Logger;
  readonly sthis: SuperThis;
  readonly id: string;

  // readonly name: string;

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

export function isDatabase(db: unknown): db is Database {
  return db instanceof DatabaseImpl;
}

export class DatabaseImpl<DT extends DocTypes = NonNullable<unknown>> implements Database {
  onClosed(fn: () => void) {
    this.ledger.onClosed(fn);
  }
  close() {
    return (
      this.ledger as unknown as {
        shellClose: (db: Ledger) => Promise<void>;
      }
    ).shellClose(this.ledger);
  }

  destroy() {
    return this.ledger.destroy();
  }

  ready(): Promise<void> {
    return this.ledger.ready();
  }

  readonly ledger: Ledger;
  readonly logger: Logger;
  readonly sthis: SuperThis;
  readonly id: string;

  constructor(ledger: Ledger) {
    this.sthis = ledger.sthis;
    this.ledger = ledger;
    this.id = ledger.id;
    this.logger = ensureLogger(this.sthis, "Database");
  }

  get name() {
    return this.ledger.name;
  }

  async get<T extends DocTypes>(id: string): Promise<DocWithId<T>> {
    if (!id) throw this.logger.Error().Str("db", this.name).Msg(`Doc id is required`).AsError();

    await this.ready();
    this.logger.Debug().Str("id", id).Msg("get");
    const got = await this.ledger.crdt.get(id).catch((e) => {
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
    const result = (await this.ledger.writeQueue.push({
      id: docId,
      value: {
        ...(value as unknown as DocSet<T>),
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
    const result = (await this.ledger.writeQueue.bulk(updates)) as CRDTMeta;
    return { ids: updates.map((u) => u.id), clock: result.head, name: this.name } as BulkResponse;
  }

  async del(id: string): Promise<DocResponse> {
    await this.ready();
    this.logger.Debug().Str("id", id).Msg("del");
    const result = (await this.ledger.writeQueue.push({ id: id, del: true })) as CRDTMeta;
    return { id, clock: result?.head, name: this.name } as DocResponse;
  }

  async changes<T extends DocTypes>(since: ClockHead = [], opts: ChangesOptions = {}): Promise<ChangesResponse<T>> {
    await this.ready();
    this.logger.Debug().Any("since", since).Any("opts", opts).Msg("changes");
    const { result, head } = await this.ledger.crdt.changes(since, opts);
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
    const { result, head } = await this.ledger.crdt.allDocs();
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
    return this.ledger.subscribe(listener, updates);
  }

  // todo if we add this onto dbs in fireproof.ts then we can make index.ts a separate package
  async query<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T>(
    field: string | MapFn<T>,
    opts: QueryOpts<K> = {},
  ): Promise<IndexRows<K, T, R>> {
    await this.ready();
    this.logger.Debug().Any("field", field).Any("opts", opts).Msg("query");
    // const _crdt = this.ledger.crdt as unknown as CRDT<T>;
    const idx = typeof field === "string" ? index<K, T, R>(this, field) : index<K, T, R>(this, makeName(field.toString()), field);
    return await idx.query(opts);
  }

  async compact() {
    await this.ready();
    await this.ledger.crdt.compact();
  }
}
