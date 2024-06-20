import { ConnectREST } from "./connect-rest";
import { Connection, CarClockHead, Connectable, DbMetaEventBlock } from "./connection";
export { makeStores } from "./store-remote";
import { AnyLink, UploadDataFnParams, UploadMetaFnParams, DownloadDataFnParams, DownloadMetaFnParams } from "./types";

export { STORAGE_VERSION } from "./store";

interface RawConnectionParams {
  metaUpload: (bytes: Uint8Array, params: UploadMetaFnParams) => Promise<Uint8Array[] | undefined>;
  dataUpload: (bytes: Uint8Array, params: UploadDataFnParams) => Promise<void | AnyLink>;
  metaDownload: (params: DownloadMetaFnParams) => Promise<Uint8Array[] | undefined>;
  dataDownload: (params: DownloadDataFnParams) => Promise<Uint8Array | undefined>;
}

class ConnectRaw extends Connection {
  metaUpload(bytes: Uint8Array, params: UploadMetaFnParams): Promise<Uint8Array[] | undefined> {
    throw new Error("Method not implemented.");
  }
  dataUpload(
    bytes: Uint8Array,
    params: UploadDataFnParams,
    opts?: { public?: boolean | undefined } | undefined,
  ): Promise<void | AnyLink> {
    throw new Error("Method not implemented.");
  }
  metaDownload(params: DownloadMetaFnParams): Promise<Uint8Array[] | undefined> {
    throw new Error("Method not implemented.");
  }
  dataDownload(params: DownloadDataFnParams): Promise<Uint8Array | undefined> {
    throw new Error("Method not implemented.");
  }
  constructor({ metaUpload, metaDownload, dataUpload, dataDownload }: RawConnectionParams) {
    super();
    this.metaUpload = metaUpload;
    this.metaDownload = metaDownload;
    this.dataUpload = dataUpload;
    this.dataDownload = dataDownload;
  }
}

export const connect = {
  raw: ({ blockstore }: Connectable, params: RawConnectionParams) => {
    const connection = new ConnectRaw(params);
    connection.connect(blockstore);
    return connection;
  },
};

export function validateDataParams(params: DownloadDataFnParams | UploadDataFnParams) {
  const { type, name, car } = params;
  if (!name) throw new Error("name is required");
  if (!car) {
    throw new Error("car is required");
  }
  if (type !== "file" && type !== "data") {
    throw new Error("type must be file or data");
  }
}

export function validateMetaParams(params: DownloadMetaFnParams | UploadMetaFnParams) {
  const { name, branch } = params;
  if (!name) throw new Error("name is required");
  if (!branch) {
    throw new Error("branch is required");
  }
}

export { Connection, ConnectREST, CarClockHead, Connectable, DbMetaEventBlock };

export { EncryptedBlockstore, CompactionFetcher, BlockFetcher, CarTransaction } from "./transaction";
export { Loader, Loadable } from "./loader";
export { DataStore, MetaStore } from "./store";
export { RemoteWAL, WALState } from "./remote-wal";
export {
  DbMeta,
  AnyBlock,
  AnyLink,
  CryptoOpts,
  StoreOpts,
  CommitOpts,
  UploadDataFnParams,
  UploadMetaFnParams,
  DownloadDataFnParams,
  DownloadMetaFnParams,
  TransactionMeta,
} from "./types";
