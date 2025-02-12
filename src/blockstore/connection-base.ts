// import { CoerceURI, exception2Result, Future, Logger, URI } from "@adviser/cement";

// import { PARAM, SuperThis, throwFalsy } from "../types.js";
// import { TaskManager } from "./task-manager.js";
// import type { Connection, DataStore, Loadable, MetaStore, RefBlockstore, RefLoadable, StoreFactoryItem } from "./types.js";
// import { RemoteDataStore, RemoteMetaStore } from "./store-remote.js";
// import { getStartedGateway, toStoreRuntime } from "./store-factory.js";
// import { Context } from "../context.js";
// import { ensureLogger } from "../utils.js";

// // export interface Connectable {
// //   // readonly blockstore: {
// //   //   readonly loader?: Loader;
// //   //   readonly ebOpts: BlockstoreRuntime;
// //   // };
// //   readonly name?: string;
// //   // readonly sthis: SuperThis;
// // }

// function coerceLoader(ref: RefLoadable | RefBlockstore): Loadable | undefined {
//   const refl = ref as RefLoadable;
//   if (refl.loader) {
//     return refl.loader;
//   }
//   const refb = ref as RefBlockstore;
//   if (refb.blockstore) {
//     return coerceLoader(refb.blockstore);
//   }
//   return undefined;
// }

// export abstract class ConnectionBase implements Connection {
//   // readonly ready: Promise<unknown>;
//   // todo move to LRU blockstore https://github.com/web3-storage/w3clock/blob/main/src/worker/block.js
//   // readonly eventBlocks = new MemoryBlockstore();
//   private loader?: Loadable;
//   taskManager?: TaskManager;
//   // loaded: Promise<void> = Promise.resolve();

//   readonly context = new Context();

//   readonly url: URI;

//   // abstract metaUpload(bytes: Uint8Array, params: UploadMetaFnParams): Promise<Uint8Array[] | Falsy>;
//   // abstract dataUpload(bytes: Uint8Array, params: UploadDataFnParams, opts?: { public?: boolean }): Promise<void>;
//   // abstract metaDownload(params: DownloadMetaFnParams): Promise<Uint8Array[] | Falsy>;
//   // abstract dataDownload(params: DownloadDataFnParams): Promise<Uint8Array | Falsy>;

//   readonly logger: Logger;
//   constructor(url: URI, logger: Logger) {
//     this.logger = logger;
//     this.url = url;
//   }

//   abstract onConnect(): Promise<void>;

//   private readonly _loaded = new Set<Future<void>>();
//   private _metaIsLoading = false;
//   loaded(): Future<void> {
//     const f = new Future<void>();
//     if (!this._metaIsLoading) {
//       f.resolve();
//     } else {
//       this._loaded.add(f);
//     }
//     return f;
//   }

//   async refresh() {
//     await this.loader?.attachedRemotes.metaStore().then((i) => i.load());
//     await throwFalsy(this.loader)
//       .WALStore()
//       .then((i) => i.process());
//   }

//   async connect(refl: RefLoadable | RefBlockstore) {
//     await this.connectMeta(refl);
//     await this.connectStorage(refl);
//   }

//   async connectMeta(refl: RefLoadable | RefBlockstore) {
//     const loader = coerceLoader(refl);
//     if (!loader) throw this.logger.Error().Msg("connectMeta: loader is required").AsError();
//     this.loader = loader;
//     await this.onConnect();
//     const metaUrl = this.url.build().defParam(PARAM.STORE, "meta").URI();
//     const rgateway = await getStartedGateway({ loader }, metaUrl);
//     if (rgateway.isErr())
//       throw this.logger.Error().Result("err", rgateway).Url(metaUrl).Msg("connectMeta: gateway is required").AsError();
//     // const name = metaUrl.toString();
//     const dbName = metaUrl.getParam(PARAM.NAME);
//     if (!dbName) {
//       throw this.logger.Error().Url(metaUrl).Msg("connectMeta: dbName is required").AsError();
//     }
//     const gateway = rgateway.Ok();
//     const remote = await RemoteMetaStore(loader.sthis, metaUrl, {
//       gateway: gateway.gateway,
//       loader,
//     });
//     this.loader.xremoteMetaStore = remote;

//     this._metaIsLoading = true;
//     this.loader.ready().then(async () => {
//       return remote.load().then(async () => {
//         const res = await exception2Result(async () => {
//           return throwFalsy(this.loader)
//             .WALStore()
//             .then((i) => i.process());
//         });
//         this._metaIsLoading = false;
//         for (const f of this._loaded) {
//           if (res.isErr()) {
//             f.reject(res.Err());
//           } else {
//             f.resolve();
//           }
//         }
//         this._loaded.clear();
//       });
//     });
//   }

//   async connectStorage(refl: RefLoadable | RefBlockstore) {
//     const loader = coerceLoader(refl);
//     if (!loader) throw this.logger.Error().Msg("connectStorage: loader is required").AsError();
//     this.loader = loader;
//     const dataUrl = this.url.build().defParam(PARAM.STORE, "data").URI();
//     const rgateway = await getStartedGateway({ loader }, dataUrl);
//     if (rgateway.isErr())
//       throw this.logger.Error().Result("err", rgateway).Url(dataUrl).Msg("connectStorage: gateway is required").AsError();
//     const name = dataUrl.getParam(PARAM.NAME);
//     if (!name) throw this.logger.Error().Url(dataUrl).Msg("connectStorage: name is required").AsError;
//     loader.xremoteCarStore = await RemoteDataStore(loader.sthis, this.url, {
//       gateway: rgateway.Ok().gateway,
//       loader,
//     });
//     // @jchris why we have a differention between remoteCarStore and remoteFileStore?
//     // file store is for on-demand attachment loading
//     // for now we don't have any difference but in superthis car store and
//     // file store could have different urls/gateways
//     loader.xremoteFileStore = loader.xremoteCarStore;
//   }
// }

// export class ConnectionFromStore extends ConnectionBase {
//   stores?: {
//     readonly data: DataStore;
//     readonly meta: MetaStore;
//   } = undefined;

//   // readonly urlData: URI;
//   // readonly urlMeta: URI;

//   readonly sthis: SuperThis;
//   constructor(sthis: SuperThis, url: URI) {
//     const logger = ensureLogger(sthis, "ConnectionFromStore", {
//       url: () => url.toString(),
//       this: 1,
//       log: 1,
//     });
//     super(url, logger);
//     this.sthis = sthis;
//     // this.urlData = url;
//     // this.urlMeta = url;
//   }
//   async onConnect(): Promise<void> {
//     this.logger.Debug().Msg("onConnect-start");
//     // const stores = {
//     //   base: this.url,
//     //   // data: this.urlData,
//     //   // meta: this.urlMeta,
//     // };
//     const rName = this.url.getParamResult("name");
//     if (rName.isErr()) {
//       throw this.logger.Error().Err(rName).Msg("missing Parameter").AsError();
//     }
//     const storeRuntime = toStoreRuntime(this.sthis);
//     const loader: StoreFactoryItem = {
//       url: this.url,
//       loader: {
//         ebOpts: {
//           logger: this.logger,
//           storeUrls: {
//             data: this.url,
//             meta: this.url,
//             file: this.url,
//             wal: this.url,
//           },
//           // store: { stores },
//           storeRuntime,
//         } as Loadable["ebOpts"],
//         sthis: this.sthis,
//       } as Loadable,
//     };

//     this.stores = {
//       data: await storeRuntime.makeDataStore(loader),
//       meta: await storeRuntime.makeMetaStore(loader),
//     };
//     // await this.stores.data.start();
//     // await this.stores.meta.start();
//     this.logger.Debug().Msg("onConnect-done");
//     return;
//   }
// }

// export function connectionFactory(sthis: SuperThis, iurl: CoerceURI): ConnectionBase {
//   return new ConnectionFromStore(sthis, URI.from(iurl));
// }
