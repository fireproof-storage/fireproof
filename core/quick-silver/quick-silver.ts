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
import { BuildURI, Lazy, Logger, OnFunc, URI, stripper } from "@adviser/cement";
import { GatewayImpl as IndexedDBGateway } from "@fireproof/core-gateways-indexeddb";
import { hashObjectCID, hashBlobAsync } from "@fireproof/core-runtime";
import { PARAM } from "@fireproof/core-types-base";
import { QCDoc, QCFile, isQCDoc, isQCFile } from "./envelope.js";
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

  readonly _baseURL = Lazy(() =>
    BuildURI.from("indexeddb://fp").setParam(PARAM.NAME, this.name).setParam(PARAM.STORE, "file").URI(),
  );

  readonly ready = Lazy(async () => {
    const result = await this._gateway.start(BuildURI.from(this._baseURL()).URI(), this.sthis);
    if (result.isErr()) throw result.Err();
    return result.Ok();
  });

  async close(): Promise<void> {
    const url = BuildURI.from(this._baseURL()).URI();
    return this.ready()
      .then(() => this._gateway.close(url, this.sthis))
      .then(() => this.onClosed.invoke());
  }

  async destroy(): Promise<void> {
    const url = BuildURI.from(this._baseURL()).URI();
    return this.ready().then(() => this._gateway.destroy(url, this.sthis));
  }

  readonly onClosed = OnFunc<() => void>();

  attach(_a: Attachable): Promise<Attached> {
    throw new Error("not implemented");
  }

  async get<T extends DocTypes>(id: string): Promise<DocWithId<T>> {
    await this.ready();
    const url = BuildURI.from(this._baseURL()).setParam(PARAM.KEY, id).URI();
    const result = await this._gateway.get(url, this.sthis);
    if (result.isErr()) throw result.Err();
    const decoded = this.sthis.ende.cbor.decodeUint8<QCDoc | QCFile>(result.Ok());
    if (decoded.isErr()) throw decoded.Err();
    const envelope = decoded.Ok();
    if (isQCFile(envelope)) {
      return { _id: envelope._.cid, _: envelope._, payload: envelope.payload } as DocWithId<T>;
    }
    if (!isQCDoc(envelope)) {
      throw new NotFoundError(`not a doc: ${id}`);
    }
    const docFile = await Promise.all(
      envelope._.fileRefs.map(async (cid) => {
        const fileUrl = BuildURI.from(this._baseURL()).setParam(PARAM.KEY, cid).URI();
        const fileResult = await this._gateway.get(fileUrl, this.sthis);
        if (fileResult.isErr()) throw fileResult.Err();
        const fileDecoded = this.sthis.ende.cbor.decodeUint8<QCFile>(fileResult.Ok());
        if (fileDecoded.isErr()) throw fileDecoded.Err();
        const fileEnvelope = fileDecoded.Ok();
        if (!isQCFile(fileEnvelope)) throw new NotFoundError(`not a file: ${cid}`);
        return fileEnvelope._;
      }),
    );
    return { _id: envelope._.id, ...(envelope.data as T), _: { ...envelope._, fileRefs: docFile } } as DocWithId<T>;
  }

  async put<T extends DocTypes>(doc: DocSet<T>): Promise<DocResponse> {
    const { ids, clock, name } = await this.bulk([doc]);
    return { id: ids[0], clock, name };
  }

  async bulk<T extends DocTypes>(docs: DocSet<T>[]): Promise<BulkResponse> {
    await this.ready();

    const envelopes = await Promise.all(
      docs.map(async (doc) => {
        const raw = doc as DocSet<T> & { _files?: Record<string, File> };
        const id = raw._id ?? this.sthis.timeOrderedNextId().str;
        const data = stripper(/(_id|_files)/, raw);

        const { cid } = await hashObjectCID(data);

        const qcFiles: QCFile[] = await Promise.all(
          Object.entries(raw._files ?? {}).map(async ([filename, file]) => {
            const payload = new Uint8Array(await file.arrayBuffer());
            const cid = await hashBlobAsync(file);
            return {
              type: "qc.file" as const,
              _: { type: "file" as const, filename: file.name, cid, synced: [] },
              payload,
            };
          }),
        );

        const qcDoc: QCDoc = {
          type: "qc.doc",
          _: { type: "doc" as const, id, cid: cid.toString(), fileRefs: qcFiles.map((f) => f._.cid), synced: [] },
          data,
        };

        return [...qcFiles, qcDoc];
      }),
    );
    const flatEnvelopes = envelopes.flat();

    const results = await Promise.allSettled(
      flatEnvelopes.map((envelope) => {
        const key = isQCDoc(envelope) ? envelope._.id : envelope._.cid;
        const url = BuildURI.from(this._baseURL()).setParam(PARAM.KEY, key).URI();
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

    const writtenDocs = flatEnvelopes.filter(isQCDoc).map((e) => ({ _id: e._.id, ...(e.data as DocTypes) }) as DocWithId<DocTypes>);

    this._updateListeners.invoke(writtenDocs);
    this._noUpdateListeners.invoke();

    return { ids: writtenDocs.map((d) => d._id), clock: [], name: this.name };
  }

  async del(id: string): Promise<DocResponse> {
    await this.ready();
    const url = BuildURI.from(this._baseURL()).setParam(PARAM.KEY, id).URI();
    const result = await this._gateway.delete(url, this.sthis);
    if (result.isErr()) throw result.Err();
    return { id, clock: [], name: this.name };
  }

  remove(id: string): Promise<DocResponse> {
    return this.del(id);
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
    return Promise.resolve();
  }
}
