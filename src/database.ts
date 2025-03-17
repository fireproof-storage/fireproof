import { Logger } from "@adviser/cement";
import { index } from "./indexer.js";
import type {
  ClockHead,
  MapFn,
  QueryOpts,
  ChangesOptions,
  DocSet,
  DocWithId,
  IndexKeyType,
  ListenerFn,
  DocResponse,
  BulkResponse,
  ChangesResponse,
  DocTypes,
  IndexRows,
  DocFragment,
  CRDTMeta,
  AllDocsQueryOpts,
  AllDocsResponse,
  SuperThis,
  Database,
  Ledger,
  Attachable,
  Attached,
  QueryResponse,
  InquiryResponse,
} from "./types.js";
import { ensureLogger, makeName, NotFoundError } from "./utils.js";

export function isDatabase(db: unknown): db is Database {
  return db instanceof DatabaseImpl;
}

export class DatabaseImpl implements Database {
  onClosed(fn: () => void) {
    this.ledger.onClosed(fn);
  }
  close() {
    return this.ledger.close();
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

  attach(a: Attachable): Promise<Attached> {
    return this.ledger.attach(a);
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
          ...(doc as unknown as DocSet<T>),
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
    this.logger.Debug().Any("since", since).Any("opts", opts).Msg("changes");

    const qry = this.select<IndexKeyType, T>();

    // FIXME: row must have `clock` property
    const rows = (await qry.toArray({ ...opts, since }))
      .map((row) => ({
        key: row.key[1],
        value: row.doc,
      }))
      .reverse();

    return { rows, clock: this.ledger.clock, name: this.name };
  }

  async allDocs<T extends DocTypes>(opts: AllDocsQueryOpts = {}): Promise<AllDocsResponse<T>> {
    this.logger.Debug().Msg("allDocs");

    // FIXME: Passing opts doesn't actually do anything yet
    const qry = this.select<IndexKeyType, T>(opts);
    const rows = (await qry.toArray()).map((row) => ({ key: row.key[1], value: row.doc }));

    return { rows, clock: this.ledger.clock, name: this.name };
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

  get clock() {
    return this.ledger.clock;
  }

  subscribe<T extends DocTypes>(listener: ListenerFn<T>): () => void {
    return this.select<IndexKeyType, T>().subscribe((row) => {
      listener([row.doc]);
    });
  }

  // todo if we add this onto dbs in fireproof.ts then we can make index.ts a separate package
  async query<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T>(
    field: string | MapFn<T, R>,
    opts: QueryOpts<K> = {},
  ): Promise<IndexRows<K, T, R>> {
    this.logger.Debug().Any("field", field).Any("opts", opts).Msg("query");
    const qry = this.select<K, T, R>(field, opts);
    const arr = await qry.toArray();
    const rows = arr;

    return { rows };
  }

  select<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T>(
    opts: QueryOpts<K> & { excludeDocs: true },
  ): InquiryResponse<K, R>;
  select<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T>(opts?: QueryOpts<K>): QueryResponse<K, T, R>;
  select<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T>(
    field: string | MapFn<T, R>,
    opts: QueryOpts<K> & { excludeDocs: true },
  ): InquiryResponse<K, R>;
  select<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T>(
    field: string | MapFn<T, R>,
    opts?: QueryOpts<K>,
  ): QueryResponse<K, T, R>;
  select<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T>(
    a?: string | MapFn<T, R> | QueryOpts<K>,
    b?: QueryOpts<K>,
  ): InquiryResponse<K, R> | QueryResponse<K, T, R> {
    const field = typeof a === "string" || typeof a === "function" ? a : undefined;
    const opts = b ? b : typeof a === "object" ? a : {};

    if (!field) {
      return this.ledger.crdt.allDocs<K, T, R>(opts, { waitFor: this.ready() });
    }

    const idx = typeof field === "string" ? index<K, T, R>(this, field) : index<K, T, R>(this, makeName(field.toString()), field);
    return idx.query(opts, { waitFor: this.ready() });
  }

  async compact() {
    await this.ready();
    await this.ledger.crdt.compact();
  }
}
