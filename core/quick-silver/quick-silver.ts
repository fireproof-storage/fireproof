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
import {
  KeyedResolvOnce,
  Logger,
  OnFunc,
  Result,
  consumeStream,
  stream2uint8array,
  stripper,
  toSortedObject,
  uint8array2stream,
} from "@adviser/cement";
import {
  QSDocMeta,
  QSIdxValueMeta,
  QSFileMeta,
  isQSDocMeta,
  isQSEmitIdxValueMeta as isQSIdxValueMeta,
  isQSFileMeta,
} from "./envelope.js";
import { NotFoundError } from "@fireproof/core-types-base";
import { hashStringSync } from "@fireproof/core-runtime";
import { CIDStorageService } from "./cid-storage/service.js";
import { IdxService } from "./idx-service/service.js";
import { PrimaryKeyStrategy } from "./idx-service/primary-key-strategy.js";
import { IdxEntry, MetaEntry } from "./idx-service/types.js";
import { CIDGetResult, CIDStoreResult } from "./cid-storage/types.js";
import { type } from "arktype";

function secIdxName(field: string | MapFn<never>): string {
  return typeof field === "string" ? `_field_${field}` : `_map_${hashStringSync(field.toString())}`;
}

function compareKeys(a: IndexKeyType, b: IndexKeyType): number {
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const c = compareKeys(a[i], b[i]);
      if (c !== 0) return c;
    }
    return a.length - b.length;
  }
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export interface QuickSilverOpts {
  readonly sthis: SuperThis;
  readonly name: string;
  readonly cacheSize?: number;
}

export class QuickSilver implements Database {
  readonly name: string;
  readonly sthis: SuperThis;
  readonly logger: Logger;

  private readonly _docCache = new KeyedResolvOnce<DocWithId<DocTypes>>();
  private readonly _updateListeners = OnFunc<(docs: DocWithId<DocTypes>[]) => void>();
  private readonly _noUpdateListeners = OnFunc<() => void>();
  private readonly _primaryKeyStrategy: PrimaryKeyStrategy;

  get ledger(): Ledger {
    throw new Error("not implemented");
  }

  constructor(opts: QuickSilverOpts) {
    this.name = opts.name;
    this.sthis = opts.sthis;
    this.logger = opts.sthis.logger;
    const cacheSize = opts.cacheSize ?? 64;
    if (cacheSize > 0) {
      this._docCache.setParam({ lru: { maxEntries: cacheSize } });
    }
    this._primaryKeyStrategy = new PrimaryKeyStrategy({ sthis: opts.sthis });
  }

  readonly onClosed = OnFunc<() => void>();

  readonly ready = (): Promise<void> => Promise.resolve();

  async close(): Promise<void> {
    this.onClosed.invoke();
  }

  async destroy(): Promise<void> {
    await IdxService().destroyDb(this.name);
  }

  attach(_a: Attachable): Promise<Attached> {
    throw new Error("not implemented");
  }

  findQSDocMeta(meta: MetaEntry[] = []): QSDocMeta | undefined {
    return meta.find((m) => isQSDocMeta(m));
  }

  async get<T extends DocTypes>(id: string): Promise<DocWithId<T>> {
    return this._docCache.get(id).once(async () => {
      const rQ = await IdxService().query({ dbname: this.name, idxName: "_id", keys: [id] });
      if (rQ.isErr()) throw rQ.Err();

      const entries = await consumeStream(rQ.Ok(), (r) => r);
      if (entries.length === 0) throw new NotFoundError(`doc not found: ${id}`);
      const item = entries[0];
      const cids = await Promise.all([
        (async () => {
          const docMeta = this.findQSDocMeta(item.meta);
          if (!docMeta) return Result.Err(new Error(`no doc meta found for id: ${id}`));
          return CIDStorageService().get(docMeta.payload.url);
        })(),
        ...(item.meta ?? [])
          .filter((m) => isQSFileMeta(m))
          .map((m) =>
            CIDStorageService()
              .get(m.payload.url)
              .then((r) => {
                if (r.isErr()) return r;
                const getFile = r.Ok();
                if (!getFile.found) return { found: false };
                return Result.Ok({ meta: m, found: getFile.found, stream: getFile.stream });
              }),
          ),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const rData = cids.shift()! as Result<CIDGetResult>;
      if (rData.isErr()) throw rData.Err();
      const data = rData.Ok();
      if (!data.found) throw new NotFoundError(`doc content not found for id: ${id}`);

      const _files: Record<string, File> = {};
      for (const cidItem of cids as unknown as Result<CIDGetResult & { meta: QSFileMeta }>[]) {
        if (cidItem.isErr()) continue;
        const r = cidItem.Ok();
        if (r.found === false) continue;
        const qsMeta = QSFileMeta(r.meta);
        if (qsMeta instanceof type.errors) continue;
        const blob = await new Response(r.stream).blob();
        const file = new File([blob], qsMeta.payload.filename, {
          type: "application/octet-stream",
          lastModified: Date.parse(qsMeta.payload.created),
        });
        _files[qsMeta.payload.filename] = file;
      }

      const decoded = this.sthis.ende.cbor.decodeUint8<T>(await stream2uint8array(data.stream));
      if (decoded.isErr()) throw decoded.Err();
      return {
        _id: item.keys[0],
        _meta: item.meta,
        _files,
        ...decoded.Ok(),
      } as DocWithId<T>;
    }) as Promise<DocWithId<T>>;
  }

  async put<T extends DocTypes>(doc: DocSet<T>): Promise<DocResponse> {
    const { ids, clock, name } = await this.bulk([doc]);
    return { id: ids[0], clock, name };
  }

  qsFiles(files: Record<string, File>): Promise<Result<IdxEntry>[]> {
    return Promise.all(
      Object.values(files).map(async (file) => {
        const rFile = await CIDStorageService().store(file.stream());
        if (rFile.isErr()) return Result.Err(rFile);
        const rFileIdx = await IdxService().addToIdx({
          dbname: this.name,
          idxName: "_files",
          keys: [rFile.Ok().cid],
          meta: [
            {
              type: "qs.file.meta",
              key: rFile.Ok().cid,
              payload: {
                idxName: "_files",
                url: rFile.Ok().url,
                filename: file.name,
                size: rFile.Ok().size,
                created: new Date().toISOString(),
                cid: rFile.Ok().cid,
              },
            } satisfies QSFileMeta,
          ],
        });
        return rFileIdx;
      }),
    );
  }

  async bulk<T extends DocTypes>(docs: DocSet<T>[]): Promise<BulkResponse> {
    const writtenDocs: DocWithId<DocTypes>[] = [];

    // dexie abort transaction if something other is called
    await this._primaryKeyStrategy.deviceFingerPrint();

    const docAndFiles = await Promise.all(
      docs.map(async (doc): Promise<Result<{ doc: DocSet<T>; docResult: CIDStoreResult; files: IdxEntry[] }>> => {
        const raw = doc as DocSet<T> & { _files?: Record<string, File> };
        const data = toSortedObject(stripper(/(_id|_files|_publicFiles|_meta|_deleted)/, raw)) as object;
        const rData = await CIDStorageService().store(uint8array2stream(this.sthis.ende.cbor.encodeToUint8(data)));
        if (rData.isErr()) {
          return Result.Err(rData);
        }
        const qcFiles = await this.qsFiles(raw._files ?? {});
        if (qcFiles.some((f) => f.isErr())) {
          return Result.Err(new Error(`failed to store files for doc with id: ${raw._id ?? "unknown"}`));
        }
        return Result.Ok({ doc, docResult: rData.Ok(), files: qcFiles.map((i) => i.Ok()) });
      }),
    );
    if (docAndFiles.some((r) => r.isErr())) {
      throw new Error(`failed to store some docs/files: ${docAndFiles.map((r) => r.Err().message).join("\n ")}`);
    }
    await IdxService().transaction(this.name, async (tx) => {
      for (const rDoc of docAndFiles) {
        if (rDoc.isErr()) continue;
        const daf = rDoc.Ok();
        const id = daf.doc._id ?? this.sthis.timeOrderedNextId().str;

        const fileMeta = daf.files
          .filter((f) => !!f.meta)
          .map((f) => f.meta)
          .flat() as MetaEntry[];
        const docMeta: QSDocMeta = {
          type: "qs.doc.meta",
          key: id,
          payload: {
            idxName: "_id",
            primaryKey: id,
            cid: daf.docResult.cid,
            url: daf.docResult.url,
            created: new Date().toISOString(),
          },
        };
        const meta = [docMeta, ...fileMeta];
        const rIdx = await IdxService().addToIdx({
          tx,
          dbname: this.name,
          idxName: "_id",
          keys: [id],
          meta,
          strategy: this._primaryKeyStrategy,
        });
        if (rIdx.isErr()) {
          console.log("Failed to index doc with id:", id, "error:", rIdx.Err());
          continue;
        }
        this._docCache.delete(id);
        writtenDocs.push({
          ...(daf.doc as DocTypes),
          _id: id,
          _meta: meta,
        });
        // console.log("Doc indexed with id:", id, "meta:", docMeta, "file meta:", fileMeta);
      }
    });

    this._updateListeners.invoke(writtenDocs);
    this._noUpdateListeners.invoke();

    return { ids: writtenDocs.map((d) => d._id), clock: [], name: this.name };
  }

  async del(id: string): Promise<DocResponse> {
    const result = await IdxService().deleteFromIdx({ dbname: this.name, idxName: "_id", keys: [id] });
    if (result.isErr()) throw result.Err();
    this._docCache.delete(id);
    return { id, clock: [], name: this.name };
  }

  remove(id: string): Promise<DocResponse> {
    return this.del(id);
  }

  changes<T extends DocTypes>(_since?: ClockHead, _opts?: ChangesOptions): Promise<ChangesResponse<T>> {
    throw new Error("not implemented");
  }

  async allDocs<T extends DocTypes>(opts?: Partial<AllDocsQueryOpts>): Promise<AllDocsResponse<T>> {
    const rQ = await IdxService().query({
      dbname: this.name,
      idxName: "_id",
      keys: opts?.keys,
      includeDeleted: opts?.includeDeleted,
    });
    if (rQ.isErr()) throw rQ.Err();

    const entries = await consumeStream(rQ.Ok(), (r) => r);
    const rows = await Promise.all(
      entries.map(async (entry) => ({
        key: entry.keys[0],
        value: await this.get<T>(entry.keys[0]),
      })),
    );
    return { rows, clock: [], name: this.name };
  }

  allDocuments<T extends DocTypes>(opts?: Partial<AllDocsQueryOpts>): Promise<AllDocsResponse<T>> {
    return this.allDocs<T>(opts);
  }

  subscribe<T extends DocTypes>(listener: ListenerFn<T>, updates?: boolean): () => void {
    if (updates === false) {
      return this._noUpdateListeners(listener as () => void);
    }
    return this._updateListeners(listener as (docs: DocWithId<DocTypes>[]) => void);
  }

  async query<
    T extends DocTypes,
    K extends IndexKeyType = string,
    R extends DocFragment = T,
    O extends Partial<QueryOpts<K>> = Partial<QueryOpts<K>>,
  >(field: string | MapFn<T>, opts?: O): Promise<QueryResult<T, K, R, O>> {
    const idxName = secIdxName(field);

    // Build secondary index if empty
    const rCheck = await IdxService().query({ dbname: this.name, idxName });
    if (rCheck.isErr()) throw rCheck.Err();
    const checkReader = rCheck.Ok().getReader();
    let hasEntries = false;
    try {
      const { done } = await checkReader.read();
      hasEntries = !done;
    } finally {
      checkReader.releaseLock();
    }

    if (!hasEntries) {
      const rPrimary = await IdxService().query({ dbname: this.name, idxName: "_id" });
      if (rPrimary.isErr()) throw rPrimary.Err();
      const primaryReader = rPrimary.Ok().getReader();
      try {
        interface PendingEmit {
          k: IndexKeyType;
          v?: DocFragment;
        }
        while (true) {
          const { done, value: entry } = await primaryReader.read();
          if (done) break;

          let doc: DocWithId<T>;
          try {
            doc = await this.get<T>(entry.keys[0]);
          } catch {
            continue;
          }
          // const docId = entry.keys[0];
          const docMeta = this.findQSDocMeta(entry.meta);
          if (!docMeta) continue;

          const pending = new Map<string, PendingEmit[]>();
          if (typeof field === "string") {
            const key = (doc as unknown as Record<string, unknown>)[field];
            if (key !== undefined) pending.set(String(key), [{ k: key as IndexKeyType }]);
          } else {
            let called = 0;
            const emit = (k: IndexKeyType, v?: DocFragment) => {
              called++;
              const key = JSON.stringify(k);
              if (!pending.has(key)) pending.set(key, []);
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              pending.get(key)!.push({ k, v });
            };
            try {
              const ret = field(doc, emit);
              if (!called && ret !== undefined && ret !== null) {
                if (!pending.has(JSON.stringify(ret))) {
                  pending.set(JSON.stringify(ret), []);
                }
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                pending.get(JSON.stringify(ret))!.push({ k: ret as IndexKeyType });
              }
            } catch (e) {
              console.log("Error executing map function for doc with id:", doc._id, "error:", e);
            }
          }

          for (const [_sk, emits] of pending.entries()) {
            const meta: MetaEntry[] = [
              {
                type: "qs.doc.meta",
                key: doc._id,
                payload: {
                  primaryKey: doc._id,
                  idxName,
                  cid: docMeta.payload.cid,
                  url: docMeta.payload.url,
                  created: new Date().toISOString(),
                },
              } satisfies QSDocMeta,
              ...Array.from(emits).reduce((acc, emit) => {
                acc.push({
                  type: "qs.emit.value",
                  key: `${JSON.stringify(emit.k)}:${doc._id}`,
                  payload: {
                    keys: Array.isArray(emit.k) ? emit.k : [emit.k],
                    emitValue: emit.v,
                  },
                } satisfies QSIdxValueMeta);
                return acc;
              }, [] as MetaEntry[]),
            ];
            await IdxService().addToIdx({
              dbname: this.name,
              idxName,
              keys: Array.isArray(emits[0].k) ? emits[0].k.map(String) : [String(emits[0].k)],
              meta,
            });
          }
        }
      } finally {
        primaryReader.releaseLock();
      }
    }

    // Build select filter from opts
    const select = (() => {
      if (opts?.key !== undefined) {
        const s = JSON.stringify(opts.key);
        return (e: IdxEntry) => e.keys[0] === s;
      }
      if (opts?.keys && (opts.keys as unknown[]).length > 0) {
        const sset = new Set((opts.keys as unknown[]).map((k) => JSON.stringify(k)));
        return (e: IdxEntry) => sset.has(e.keys[0]);
      }
      if (opts?.range) {
        const [lo, hi] = opts.range as [K, K];
        return (e: IdxEntry) => {
          const k = JSON.parse(e.keys[0]) as K;
          return compareKeys(k, lo) >= 0 && compareKeys(k, hi) <= 0;
        };
      }
      if (opts?.prefix !== undefined) {
        const prefix = String(opts.prefix);
        return (e: IdxEntry) => String(JSON.parse(e.keys[0])).startsWith(prefix);
      }
      return undefined;
    })();

    const rQ = await IdxService().query({ dbname: this.name, idxName, select });
    if (rQ.isErr()) throw rQ.Err();

    interface EmittedRow {
      id: string;
      key: K;
      value: R;
      doc: DocWithId<T>;
    }
    const emitted: EmittedRow[] = [];
    const reader = rQ.Ok().getReader();
    try {
      while (true) {
        const { done, value: entry } = await reader.read();
        if (done) break;

        const docMeta = this.findQSDocMeta(entry.meta);
        if (!docMeta) continue;

        let doc: DocWithId<T>;
        try {
          doc = await this.get<T>(docMeta.payload.primaryKey);
        } catch {
          continue;
        }

        // const valueMeta = entry.meta?.find((m) => m.type === "qs.emit.value" && m.key === docId);
        // const value = (valueMeta ? valueMeta.payload : emittedKey) as unknown as R;

        const idxValues = entry.meta?.filter((m) => isQSIdxValueMeta(m));
        for (const idxValue of idxValues ?? []) {
          if (idxValue instanceof type.errors) continue;
          if (idxValue.payload.keys.length === 0) continue;
          let key: K;
          if (idxValue.payload.keys.length === 1) {
            key = idxValue.payload.keys[0] as K;
          } else {
            key = idxValue.payload.keys as unknown as K;
          }

          emitted.push({
            id: doc._id,
            key,
            value: {} as R,
            doc,
          });
        }
      }
    } finally {
      reader.releaseLock();
    }

    emitted.sort((a, b) => compareKeys(a.key, b.key));
    if (opts?.descending) emitted.reverse();
    const filtered = opts?.limit ? emitted.slice(0, opts.limit) : emitted;

    const rows = filtered.map(({ id, key, value, doc }) => ({
      id,
      key,
      value,
      doc: opts?.includeDocs !== false ? doc : undefined,
    }));

    if (opts?.includeDocs === false) {
      return { rows } as QueryResult<T, K, R, O>;
    }
    return { rows, docs: filtered.map((r) => r.doc) } as QueryResult<T, K, R, O>;
  }

  compact(): Promise<void> {
    return Promise.resolve();
  }
}
