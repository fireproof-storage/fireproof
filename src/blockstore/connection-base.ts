import { exception2Result, Future, Logger, URI } from "@adviser/cement";

import { PARAM, throwFalsy } from "../types.js";
import { TaskManager } from "./task-manager.js";
import type { Connection, Loadable, RefBlockstore, RefLoadable } from "./types.js";
import { RemoteDataStore, RemoteMetaStore } from "./store-remote.js";
import { getStartedGateway } from "./store-factory.js";
import { Context } from "../context.js";

// export interface Connectable {
//   // readonly blockstore: {
//   //   readonly loader?: Loader;
//   //   readonly ebOpts: BlockstoreRuntime;
//   // };
//   readonly name?: string;
//   // readonly sthis: SuperThis;
// }

function coerceLoader(ref: RefLoadable | RefBlockstore): Loadable | undefined {
  const refl = ref as RefLoadable;
  if (refl.loader) {
    return refl.loader;
  }
  const refb = ref as RefBlockstore;
  if (refb.blockstore) {
    return coerceLoader(refb.blockstore);
  }
  return undefined;
}

export abstract class ConnectionBase implements Connection {
  // readonly ready: Promise<unknown>;
  // todo move to LRU blockstore https://github.com/web3-storage/w3clock/blob/main/src/worker/block.js
  // readonly eventBlocks = new MemoryBlockstore();
  private loader?: Loadable;
  taskManager?: TaskManager;
  // loaded: Promise<void> = Promise.resolve();

  readonly context = new Context();

  readonly url: URI;

  // abstract metaUpload(bytes: Uint8Array, params: UploadMetaFnParams): Promise<Uint8Array[] | Falsy>;
  // abstract dataUpload(bytes: Uint8Array, params: UploadDataFnParams, opts?: { public?: boolean }): Promise<void>;
  // abstract metaDownload(params: DownloadMetaFnParams): Promise<Uint8Array[] | Falsy>;
  // abstract dataDownload(params: DownloadDataFnParams): Promise<Uint8Array | Falsy>;

  readonly logger: Logger;
  constructor(url: URI, logger: Logger) {
    this.logger = logger;
    this.url = url;
  }

  private readonly _loaded = new Set<Future<void>>();
  private _metaIsLoading = false;
  loaded(): Future<void> {
    const f = new Future<void>();
    if (!this._metaIsLoading) {
      f.resolve();
    } else {
      this._loaded.add(f);
    }
    return f;
  }

  async refresh() {
    await throwFalsy(throwFalsy(this.loader).remoteMetaStore).load();
    await (await throwFalsy(this.loader).WALStore()).process();
  }

  async connect(refl: RefLoadable | RefBlockstore) {
    await this.connectMeta(refl);
    await this.connectStorage(refl);
  }

  async connectMeta(refl: RefLoadable | RefBlockstore) {
    const loader = coerceLoader(refl);
    if (!loader) throw this.logger.Error().Msg("connectMeta: loader is required").AsError();
    this.loader = loader;
    await this.onConnect();
    const metaUrl = this.url.build().defParam(PARAM.STORE, "meta").URI();
    const rgateway = await getStartedGateway(loader.sthis, metaUrl);
    if (rgateway.isErr())
      throw this.logger.Error().Result("err", rgateway).Url(metaUrl).Msg("connectMeta: gateway is required").AsError();
    // const name = metaUrl.toString();
    const dbName = metaUrl.getParam(PARAM.NAME);
    if (!dbName) {
      throw this.logger.Error().Url(metaUrl).Msg("connectMeta: dbName is required").AsError();
    }
    const gateway = rgateway.Ok();
    const remote = await RemoteMetaStore(loader.sthis, metaUrl, {
      gateway: gateway.gateway,
      loader,
    });
    this.loader.remoteMetaStore = remote;

    this._metaIsLoading = true;
    this.loader.ready().then(async () => {
      return remote.load().then(async () => {
        const res = await exception2Result(async () => {
          return await (await throwFalsy(this.loader).WALStore()).process();
        });
        this._metaIsLoading = false;
        for (const f of this._loaded) {
          if (res.isErr()) {
            f.reject(res.Err());
          } else {
            f.resolve();
          }
        }
        this._loaded.clear();
      });
    });
  }

  abstract onConnect(): Promise<void>;

  async connectStorage(refl: RefLoadable | RefBlockstore) {
    const loader = coerceLoader(refl);
    if (!loader) throw this.logger.Error().Msg("connectStorage: loader is required").AsError();
    this.loader = loader;
    const dataUrl = this.url.build().defParam(PARAM.STORE, "data").URI();
    const rgateway = await getStartedGateway(loader.sthis, dataUrl);
    if (rgateway.isErr())
      throw this.logger.Error().Result("err", rgateway).Url(dataUrl).Msg("connectStorage: gateway is required").AsError();
    const name = dataUrl.getParam(PARAM.NAME);
    if (!name) throw this.logger.Error().Url(dataUrl).Msg("connectStorage: name is required").AsError;
    loader.remoteCarStore = await RemoteDataStore(loader.sthis, this.url, {
      gateway: rgateway.Ok().gateway,
      loader,
    });
    // @jchris why we have a differention between remoteCarStore and remoteFileStore?
    // file store is for on-demand attachment loading
    // for now we don't have any difference but in superthis car store and
    // file store could have different urls/gateways
    loader.remoteFileStore = loader.remoteCarStore;
  }

  // move this stuff to connect
  // async getDashboardURL(compact = true) {
  //   const baseUrl = 'https://dashboard.fireproof.storage/'
  //   if (!this.loader?.remoteCarStore) return new URL('/howto', baseUrl)
  //   // if (compact) {
  //   //   await this.compact()
  //   // }
  //   const currents = await this.loader?.metaStore?.load()
  //   if (!currents) throw new Error("Can't sync empty ledger: save data first")
  //   if (currents.length > 1)
  //     throw new Error("Can't sync ledger with split heads: make an update first")
  //   const current = currents[0]
  //   const params = {
  //     car: current.car.toString()
  //   }
  //   if (current.key) {
  //     // @ts-ignore
  //     params.key = current.key.toString()
  //   }
  //   // @ts-ignore
  //   if (this.name) {
  //     // @ts-ignore
  //     params.name = this.name
  //   }
  //   const url = new URL('/import#' + new URLSearchParams(params).toString(), baseUrl)
  //   console.log('Import to dashboard: ' + url.toString())
  //   return url
  // }

  // openDashboard() {
  //   void this.getDashboardURL().then(url => {
  //     if (url) window.open(url.toString(), '_blank')
  //   })
  // }
}
