import { ConnectREST } from "./connect-rest";
import { Connection, type CarClockHead, type Connectable, type DbMetaEventBlock } from "./connection";
export { makeStores } from "./store-remote";
import { type AnyBlock, type AnyLink, type UploadDataFnParams, type UploadMetaFnParams, type DownloadDataFnParams, type DownloadMetaFnParams, type DbMeta, type CommitOpts, type CryptoOpts, type StoreOpts, type TransactionMeta } from "./types";

export { STORAGE_VERSION } from "./store";

interface RawConnectionParams {
  metaUpload: (bytes: Uint8Array, params: UploadMetaFnParams) => Promise<Uint8Array[] | undefined>;
  dataUpload: (bytes: Uint8Array, params: UploadDataFnParams) => Promise<AnyLink>;
  metaDownload: (params: DownloadMetaFnParams) => Promise<Uint8Array[] | undefined>;
  dataDownload: (params: DownloadDataFnParams) => Promise<Uint8Array | undefined>;
}


class ConnectRaw extends Connection {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  metaUpload(bytes: Uint8Array, params: UploadMetaFnParams): Promise<Uint8Array[] | undefined> {
    throw new Error("Method not implemented.");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  dataUpload(bytes: Uint8Array, params: UploadDataFnParams, opts?: { public?: boolean | undefined } | undefined): Promise<AnyLink> {
    throw new Error("Method not implemented.");
  }


  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  metaDownload(params: DownloadMetaFnParams): Promise<Uint8Array[] | undefined> {
    throw new Error("Method not implemented.");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

export { EncryptedBlockstore, CompactionFetcher, type BlockFetcher, CarTransaction } from "./transaction";
export { Loader, Loadable } from "./loader";
export { DataStore, MetaStore } from "./store";
export { RemoteWAL, type WALState } from "./remote-wal";
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
} // from "./types";
