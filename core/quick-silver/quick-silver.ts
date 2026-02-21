import type {
  Database,
  Ledger,
  SuperThis,
  DocTypes,
  DocWithId,
  DocSet,
  DocResponse,
  BulkResponse,
  ClockHead,
  ChangesOptions,
  ChangesResponse,
  AllDocsQueryOpts,
  AllDocsResponse,
  ListenerFn,
  MapFn,
  IndexKeyType,
  DocFragment,
  QueryOpts,
  QueryResult,
  Attachable,
  Attached,
} from "@fireproof/core-types-base";
import { BuildURI, Lazy, Logger, OnFunc, URI } from "@adviser/cement";
import { GatewayImpl as IndexedDBGateway } from "@fireproof/core-gateways-indexeddb";
import { PARAM } from "@fireproof/core-types-base";
import { QCDoc, QCFile, isQCDoc } from "./envelope.js";
import { NotFoundError } from "@fireproof/core-types-base";

export interface QuickSilverOpts {
  readonly sthis: SuperThis;
  readonly name: string;
}

export class QuickSilver implements Database {
  readonly name: string;
  readonly sthis: SuperThis;
  readonly logger: Logger;

  private readonly _gateway = new IndexedDBGateway();
  private readonly _updateListeners = OnFunc<(docs: DocWithId<DocTypes>[]) => void>();
  private readonly _noUpdateListeners = OnFunc<() => void>();

  get ledger(): Ledger {
    throw new Error("not implemented");
  }

  constructor(opts: QuickSilverOpts) {
    this.name = opts.name;
    this.sthis = opts.sthis;
    this.logger = opts.sthis.logger;
  }

  readonly _baseURL = Lazy(() => BuildURI.from("indexeddb://fp").setParam(PARAM.NAME, this.name).URI());

  readonly ready = Lazy(async () => {
    const result = await this._gateway.start(BuildURI.from(this._baseURL()).setParam(PARAM.STORE, "file").URI(), this.sthis);
    if (result.isErr()) throw result.Err();
    return result.Ok();
  });

  async close(): Promise<void> {
    return this.ready().then(() => this._gateway.close(this._baseURL(), this.sthis));
  }

  async destroy(): Promise<void> {
    return this.ready().then(() => this._gateway.destroy(this._baseURL(), this.sthis));
  }

  onClosed(_fn: () => void): void {
    throw new Error("not implemented");
  }

  attach(_a: Attachable): Promise<Attached> {
    throw new Error("not implemented");
  }

  async get<T extends DocTypes>(id: string): Promise<DocWithId<T>> {
    await this.ready();
    const url = BuildURI.from(this._baseURL()).setParam(PARAM.STORE, "file").setParam(PARAM.KEY, id).URI();
    const result = await this._gateway.get(url, this.sthis);
    if (result.isErr()) throw result.Err();
    const decoded = this.sthis.ende.cbor.decodeUint8<QCDoc>(result.Ok());
    if (decoded.isErr()) throw decoded.Err();
    const envelope = decoded.Ok();
    if (!isQCDoc(envelope)) {
      throw new NotFoundError(`not a doc: ${id}`);
    }
    return { _id: envelope.id, ...(envelope.payload as T) } as DocWithId<T>;
  }

  async put<T extends DocTypes>(doc: DocSet<T>): Promise<DocResponse> {
    const { ids, clock, name } = await this.bulk([doc]);
    return { id: ids[0], clock, name };
  }

  async bulk<T extends DocTypes>(docs: DocSet<T>[]): Promise<BulkResponse> {
    await this.ready();

    const envelopes = docs.flatMap((doc) => {
      const { _id, _files, ...payload } = doc as DocSet<T> & { _files?: Record<string, File> };
      const id = _id ?? this.sthis.timeOrderedNextId().str;

      const qcFiles: QCFile[] = Object.entries(_files ?? {}).map(([filename, _file]) => ({
        type: "qc.file" as const,
        cid: this.sthis.timeOrderedNextId().str,
        filename,
        synced: [],
        payload: new Uint8Array(), // TODO: read file bytes
      }));

      const qcDoc: QCDoc = {
        type: "qc.doc",
        id,
        fileRefs: qcFiles.map((f) => f.cid),
        synced: [],
        payload,
      };

      return [...qcFiles, qcDoc];
    });

    const results = await Promise.allSettled(
      envelopes.map((envelope) => {
        const key = isQCDoc(envelope) ? envelope.id : envelope.cid;
        const url = BuildURI.from(this._baseURL()).setParam(PARAM.STORE, "file").setParam(PARAM.KEY, key).URI();
        const bytes = this.sthis.ende.cbor.encodeToUint8(envelope);
        return this._gateway.put(url, bytes, this.sthis);
      }),
    );

    const errors = results.flatMap((r) => {
      if (r.status === "rejected") return [r.reason];
      if (r.value.isErr()) return [r.value.Err()];
      return [];
    });
    if (errors.length) {
      throw this.logger.Error().Any("errors", errors).Msg("bulk put failed").AsError();
    }

    const writtenDocs = envelopes.filter(isQCDoc).map((e) => ({ _id: e.id, ...(e.payload as DocTypes) }) as DocWithId<DocTypes>);

    this._updateListeners.invoke(writtenDocs);
    this._noUpdateListeners.invoke();

    return { ids: writtenDocs.map((d) => d._id), clock: [], name: this.name };
  }

  del(_id: string): Promise<DocResponse> {
    throw new Error("not implemented");
  }

  remove(_id: string): Promise<DocResponse> {
    throw new Error("not implemented");
  }

  changes<T extends DocTypes>(_since?: ClockHead, _opts?: ChangesOptions): Promise<ChangesResponse<T>> {
    throw new Error("not implemented");
  }

  allDocs<T extends DocTypes>(_opts?: Partial<AllDocsQueryOpts>): Promise<AllDocsResponse<T>> {
    throw new Error("not implemented");
  }

  allDocuments<T extends DocTypes>(_opts?: Partial<AllDocsQueryOpts>): Promise<AllDocsResponse<T>> {
    throw new Error("not implemented");
  }

  subscribe<T extends DocTypes>(listener: ListenerFn<T>, updates?: boolean): () => void {
    if (updates === false) {
      return this._noUpdateListeners(listener as () => void);
    }
    return this._updateListeners(listener as (docs: DocWithId<DocTypes>[]) => void);
  }

  query<
    T extends DocTypes,
    K extends IndexKeyType = string,
    R extends DocFragment = T,
    O extends Partial<QueryOpts<K>> = Partial<QueryOpts<K>>,
  >(_field: string | MapFn<T>, _opts?: O): Promise<QueryResult<T, K, R, O>> {
    throw new Error("not implemented");
  }

  compact(): Promise<void> {
    throw new Error("not implemented");
  }
}
