import { DataStoreImpl, MetaStoreImpl, StoreOpts } from "./store.js";

// export type LoadHandler = (dbMetas: DbMeta[]) => Promise<void>;
// export function validateDataParams(params: DownloadDataFnParams | UploadDataFnParams, logger: Logger) {
//   const { type, name, car } = params;
//   if (!name) throw logger.Error().Msg("name is required").AsError();
//   if (!car) {
//     throw logger.Error().Msg("car is required").AsError();
//   }
//   if (type !== "file" && type !== "data") {
//     throw logger.Error().Msg("type must be file or data").AsError();
//   }
// }

// export function validateMetaParams(params: DownloadMetaFnParams | UploadMetaFnParams, logger: Logger) {
//   const { name, branch } = params;
//   if (!name) throw logger.Error().Msg("name is required").AsError();
//   if (!branch) {
//     throw logger.Error().Msg("branch is required").AsError();
//   }
// }

// export class RemoteDataStore extends DataStoreImpl {
//   // just for explaining the concept
// }

// export class RemoteMetaStore extends MetaStoreImpl {
//   // just for explaining the concept
// }

export async function RemoteDataStore(name: string, url: URL, opts: StoreOpts) {
  const ds = new DataStoreImpl(name, url, opts);
  await ds.start();
  return ds;
}
export async function RemoteMetaStore(name: string, url: URL, opts: StoreOpts) {
  const ms = new MetaStoreImpl(name, url, opts);
  await ms.start();
  return ms;
}

// export class RemoteWALStore extends WALStoreImpl {
//   // basicly do nothing write the WAL into memory
//   constructor(loader: Loadable) {

//     //import { FileWALGateway } from "../runtime/gateways/file/gateway.js";
//     // super(loader, new URL("file:///dummy?fs=mem"), loader.logger, new FileWALGateway(loader.logger));
//   }

// }
