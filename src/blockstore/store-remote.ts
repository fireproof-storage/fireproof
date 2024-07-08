import { UploadDataFnParams } from "./types.js";
import type {
  AnyBlock,
  AnyLink,
  Connection,
  DbMeta,
  DownloadDataFnParams,
  DownloadMetaFnParams,
  FnParamTypes,
  UploadMetaFnParams,
} from "./types.js";
import { type Loadable } from "./loader.js";
import { DataStore, MetaStore } from "./store.js";
import { RemoteWAL, WALState } from "./remote-wal.js";
// import { Connectable, Connection } from "./connection.js";
import { format, parse, ToString } from "@ipld/dag-json";
import { Falsy } from "../types.js";
import { Logger } from "@adviser/cement";
import { ensureLogger } from "../utils.js";

export type LoadHandler = (dbMetas: DbMeta[]) => Promise<void>;

export function validateDataParams(params: DownloadDataFnParams | UploadDataFnParams, logger: Logger) {
  const { type, name, car } = params;
  if (!name) throw logger.Error().Msg("name is required").AsError();
  if (!car) {
    throw logger.Error().Msg("car is required").AsError();
  }
  if (type !== "file" && type !== "data") {
    throw logger.Error().Msg("type must be file or data").AsError();
  }
}

export function validateMetaParams(params: DownloadMetaFnParams | UploadMetaFnParams, logger: Logger) {
  const { name, branch } = params;
  if (!name) throw logger.Error().Msg("name is required").AsError();
  if (!branch) {
    throw logger.Error().Msg("branch is required").AsError();
  }
}

// export function makeStores(storage: Connection, meta: Connection) {
//   return {
//     makeDataStore: (name: string) => new RemoteDataStore(name, storage),
//     makeMetaStore: (loader: Loader) => {
//       meta.connectMeta({ loader });
//       return loader.remoteMetaStore as RemoteMetaStore;
//     },
//     makeRemoteWAL: (loader: Loadable) => new RemoteWAL(loader),
//   };
// }

export class RemoteDataStore extends DataStore {
  readonly tag: string = "remote-data";
  readonly connection: Connection;
  readonly type: FnParamTypes;

  constructor(url: URL, name: string, connection: Connection, logger: Logger, type: FnParamTypes = "data") {
    super(name, url, ensureLogger(logger, "RemoteDataStore", { name, url }));
    this.connection = connection;
    this.type = type;
  }

  prefix() {
    return `fp.${this.name}`;
  }

  async start() {
    // no-op
  }

  async load(carCid: AnyLink): Promise<AnyBlock> {
    const params = {
      type: this.type,
      name: this.prefix(),
      car: carCid.toString(),
    };
    validateDataParams(params, this.logger);
    const bytes = await this.connection.dataDownload(params);
    if (!bytes) throw this.logger.Error().Str("cid", carCid.toString()).Msg(`missing remote car`).AsError();
    return { cid: carCid, bytes };
  }

  async save(car: AnyBlock, opts?: { public?: boolean }) {
    const uploadParams: UploadDataFnParams = {
      type: this.type,
      name: this.prefix(),
      car: car.cid.toString(),
      size: car.bytes.length.toString(),
    };
    validateDataParams(uploadParams, this.logger);
    return await this.connection.dataUpload(car.bytes, uploadParams, opts);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async remove(cid: AnyLink): Promise<void> {
    throw this.logger.Error().Msg("remove not implemented").AsError();
  }
  async close() {
    // no-op
  }
  async destroy() {
    // no-op
  }
}

export class RemoteMetaStore extends MetaStore {
  readonly STORAGE_VERSION: string = "do-not-use";
  readonly tag: string = "remote-meta";
  readonly connection: Connection;
  readonly subscribers = new Map<string, LoadHandler[]>();

  constructor(url: URL, name: string, connection: Connection, logger: Logger) {
    super(name, url, logger);
    this.connection = connection;
  }

  async start(): Promise<void> {
    // no-op
  }

  onLoad(branch: string, loadHandler: LoadHandler): () => void {
    const subscribers = this.subscribers.get(branch) || [];
    subscribers.push(loadHandler);
    this.subscribers.set(branch, subscribers);
    return () => {
      const subscribers = this.subscribers.get(branch) || [];
      const idx = subscribers.indexOf(loadHandler);
      if (idx > -1) subscribers.splice(idx, 1);
    };
  }

  prefix() {
    return `fp.${this.name}`; //.${this.STORAGE_VERSION}`;
  }

  async handleByteHeads(byteHeads: Uint8Array[], branch = "main") {
    const dbMetas = this.dbMetasForByteHeads(byteHeads);
    const subscribers = this.subscribers.get(branch) || [];
    for (const subscriber of subscribers) {
      await subscriber(dbMetas);
    }
    return dbMetas;
  }

  async load(branch = "main"): Promise<DbMeta[] | Falsy> {
    const params = {
      name: this.prefix(),
      branch,
    };
    validateMetaParams(params, this.logger);
    const byteHeads = await this.connection.metaDownload(params);
    if (!byteHeads) return null;
    return this.handleByteHeads(byteHeads, branch);
  }

  async save(meta: DbMeta, branch = "main") {
    const bytes = new TextEncoder().encode(this.makeHeader(meta));
    const params = { name: this.prefix(), branch };
    validateMetaParams(params, this.logger);
    const byteHeads = await this.connection.metaUpload(bytes, params);
    if (!byteHeads) return null;
    return this.handleByteHeads(byteHeads, branch);
  }

  dbMetasForByteHeads(byteHeads: Uint8Array[]) {
    return byteHeads.map((bytes) => {
      const txt = new TextDecoder().decode(bytes);
      return this.parseHeader(txt);
    });
  }
  async close() {
    // no-op
  }
  async destroy() {
    // no-op
  }
}

export class RemoteWALStore extends RemoteWAL {
  readonly STORAGE_VERSION: string = "do-not-use";
  readonly tag: string = "wal-mem";
  readonly store: Map<string, string>;

  constructor(url: URL, loader: Loadable) {
    super(loader, url, ensureLogger(loader.logger, "RemoteWALStore", { name: loader.name }));
    this.store = new Map<string, string>();
  }

  headerKey(branch: string) {
    return `fp.wal.${this.loader.name}.${branch}`;
  }

  async start(): Promise<void> {
    // no-op
  }

  async _load(branch = "main"): Promise<WALState | null> {
    const bytesString = this.store.get(this.headerKey(branch));
    if (!bytesString) return null;
    return parse<WALState>(bytesString);
  }
  async _save(state: WALState, branch = "main"): Promise<void> {
    const encoded: ToString<WALState> = format(state);
    this.store.set(this.headerKey(branch), encoded);
  }
  async _close() {
    // no-op
  }
  async _destroy(): Promise<void> {
    // no-op
  }
}
