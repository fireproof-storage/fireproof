import { URI } from "@adviser/cement";
import { DataStoreImpl, MetaStoreImpl, StoreOpts } from "./store.js";
import { SuperThis } from "../types.js";

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

export async function RemoteDataStore(sthis: SuperThis, name: string, url: URI, opts: StoreOpts) {
  const ds = new DataStoreImpl(sthis, name, url, opts);
  await ds.start();
  return ds;
}
export async function RemoteMetaStore(sthis: SuperThis, name: string, url: URI, opts: StoreOpts) {
  const ms = new MetaStoreImpl(sthis, name, url, opts);
  await ms.start();
  return ms;
}
