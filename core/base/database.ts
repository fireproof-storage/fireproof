import { Logger } from "@adviser/cement";
import { index } from "./indexer.js";
import {
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
  DocFragment,
  ChangesResponseRow,
  CRDTMeta,
  AllDocsQueryOpts,
  AllDocsResponse,
  SuperThis,
  Database,
  Ledger,
  Attachable,
  Attached,
  NotFoundError,
  QueryResult,
  isNotFoundError,
} from "@fireproof/core-types-base";
import { ensureLogger, makeName } from "@fireproof/core-runtime";

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
  // readonly id: string;

  constructor(ledger: Ledger) {
    this.sthis = ledger.sthis;
    this.ledger = ledger;
    // this.id = ledger.id;
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
    try {
      const got = await this.ledger.crdt.get(id);
      if (!got) throw new NotFoundError(`Not found: ${id}`);
      const { doc } = got;
      return { ...(doc as unknown as DocWithId<T>), _id: id };
    } catch (e) {
      if (isNotFoundError(e)) {
        throw e;
      }
      throw this.logger.Error().Err(e).Msg("unexpect error").AsError();
    }
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

  async remove(id: string): Promise<DocResponse> {
    return this.del(id);
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

  async allDocs<T extends DocTypes>(opts: Partial<AllDocsQueryOpts> = {}): Promise<AllDocsResponse<T>> {
    await this.ready();
    this.logger.Debug().Msg("allDocs");
    const { result, head } = await this.ledger.crdt.allDocs();

    // Map all docs to the expected format
    let rows = result.map(({ id: key, value, del }) => ({
      key,
      value: (del ? { _id: key, _deleted: true } : { _id: key, ...value }) as DocWithId<T>,
    }));

    // Filter out deleted documents unless includeDeleted is true
    if (!opts.includeDeleted) {
      rows = rows.filter((row) => !(row.value as DocWithId<T> & { _deleted?: boolean })._deleted);
    }

    // Apply limit if specified
    if (typeof opts.limit === "number" && opts.limit >= 0) {
      rows = rows.slice(0, opts.limit);
    }
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

  async query<
    T extends DocTypes,
    K extends IndexKeyType = string,
    R extends DocFragment = T,
    O extends Partial<QueryOpts<K>> = Partial<QueryOpts<K>>,
  >(field: string | MapFn<T>, iopts?: O): Promise<QueryResult<T, K, R, O>> {
    let opts: O;
    if (!iopts) {
      opts = {} as O;
    } else {
      opts = iopts;
    }

    await this.ready();
    this.logger.Debug().Any("field", field).Any("opts", opts).Msg("query");
    // const _crdt = this.ledger.crdt as unknown as CRDT<T>;
    const idx = typeof field === "string" ? index<T, K, R>(this, field) : index<T, K, R>(this, makeName(field.toString()), field);
    const result = await idx.query(opts);

    const docInc = typeof opts.includeDocs === "boolean" ? opts.includeDocs : true;
    if (docInc) {
      return {
        rows: result.rows,
        docs: result.rows.map((r) => r.doc).filter((r): r is DocWithId<T> => !!r),
      } as QueryResult<T, K, R, O>;
    }
    // Add docs property to match useLiveQuery behavior
    return {
      rows: result.rows,
    } as QueryResult<T, K, R, O>;
  }

  async compact() {
    await this.ready();
    await this.ledger.crdt.compact();
  }
}
