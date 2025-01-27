// import { Logger } from "@adviser/cement";
// import { Falsy } from "../types.js";
// import { ConnectionBase, Connectable } from "./connection-base.js";
// import { UploadMetaFnParams, UploadDataFnParams, DownloadMetaFnParams, DownloadDataFnParams } from "./types.js";
// import { ensureLogger } from "../utils.js";

// interface RawConnectionParams {
//   readonly logger: Logger;
//   metaUpload: (bytes: Uint8Array, params: UploadMetaFnParams) => Promise<Uint8Array[] | Falsy>;
//   dataUpload: (bytes: Uint8Array, params: UploadDataFnParams) => Promise<void>;
//   metaDownload: (params: DownloadMetaFnParams) => Promise<Uint8Array[] | Falsy>;
//   dataDownload: (params: DownloadDataFnParams) => Promise<Uint8Array | Falsy>;
// }

// class ConnectRaw extends ConnectionBase {
//   // eslint-disable-next-line @typescript-eslint/no-unused-vars
//   metaUpload(bytes: Uint8Array, params: UploadMetaFnParams): Promise<Uint8Array[] | Falsy> {
//     throw this.logger.Error().Msg("dataDownload:Method not implemented.").AsError();
//   }

//   // eslint-disable-next-line @typescript-eslint/no-unused-vars
//   dataUpload(bytes: Uint8Array, params: UploadDataFnParams, opts?: { public?: boolean }): Promise<void> {
//     throw this.logger.Error().Msg("dataDownload:Method not implemented.").AsError();
//   }

//   // eslint-disable-next-line @typescript-eslint/no-unused-vars
//   metaDownload(params: DownloadMetaFnParams): Promise<Uint8Array[] | Falsy> {
//     throw this.logger.Error().Msg("dataDownload:Method not implemented.").AsError();
//   }
//   // eslint-disable-next-line @typescript-eslint/no-unused-vars
//   dataDownload(params: DownloadDataFnParams): Promise<Uint8Array | Falsy> {
//     throw this.logger.Error().Msg("dataDownload:Method not implemented.").AsError();
//   }
//   constructor({ logger: ilogger, metaUpload, metaDownload, dataUpload, dataDownload }: RawConnectionParams) {
//     const logger = ensureLogger(ilogger, "ConnectRaw");
//     super(logger);
//     this.metaUpload = metaUpload;
//     this.metaDownload = metaDownload;
//     this.dataUpload = dataUpload;
//     this.dataDownload = dataDownload;
//   }
// }

// export const connect = {
//   raw: ({ blockstore }: Connectable, params: RawConnectionParams) => {
//     const connection = new ConnectRaw(params);
//     connection.connect(blockstore);
//     return connection;
//   },
// };
