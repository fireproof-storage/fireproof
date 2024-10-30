import { Logger, URI } from "@adviser/cement";

import { PARAM, throwFalsy } from "../types.js";
import { TaskManager } from "./task-manager.js";
import type { Connection, Loadable } from "./types.js";
import { RemoteDataStore, RemoteMetaStore } from "./store-remote.js";
import { getStartedGateway } from "./store-factory.js";

// export interface Connectable {
//   // readonly blockstore: {
//   //   readonly loader?: Loader;
//   //   readonly ebOpts: BlockstoreRuntime;
//   // };
//   readonly name?: string;
//   // readonly sthis: SuperThis;
// }

export abstract class ConnectionBase implements Connection {
  // readonly ready: Promise<unknown>;
  // todo move to LRU blockstore https://github.com/web3-storage/w3clock/blob/main/src/worker/block.js
  // readonly eventBlocks = new MemoryBlockstore();
  private loader?: Loadable;
  taskManager?: TaskManager;
  loaded: Promise<void> = Promise.resolve();

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

  async refresh() {
    await throwFalsy(throwFalsy(this.loader).remoteMetaStore).load();
    await (await throwFalsy(this.loader).WALStore()).process();
  }

  async connect({ loader }: { readonly loader: Loadable }) {
    if (!loader) throw this.logger.Error().Msg("loader is required").AsError();
    await this.connectMeta({ loader });
    await this.connectStorage({ loader });
  }

  async connectMeta({ loader }: { loader: Loadable }) {
    if (!loader) throw this.logger.Error().Msg("connectMeta_X: loader is required").AsError();
    this.loader = loader;
    await this.onConnect();
    const metaUrl = this.url.build().defParam(PARAM.STORE, "meta").URI();
    const rgateway = await getStartedGateway(loader.sthis, metaUrl);
    if (rgateway.isErr())
      throw this.logger.Error().Result("err", rgateway).Url(metaUrl).Msg("connectMeta_X: gateway is required").AsError();
    // const name = metaUrl.toString();
    const dbName = metaUrl.getParam(PARAM.NAME);
    if (!dbName) {
      throw this.logger.Error().Url(metaUrl).Msg("connectMeta_X: dbName is required").AsError();
    }
    const gateway = rgateway.Ok();
    const remote = await RemoteMetaStore(loader.sthis, metaUrl, {
      gateway: gateway.gateway,
      loader,
    });
    this.loader.remoteMetaStore = remote;
    this.loaded = this.loader.ready().then(async () => {
      remote.load().then(async () => {
        (await throwFalsy(this.loader).WALStore()).process();
      });
    });
  }

  abstract onConnect(): Promise<void>;

  async connectStorage({ loader }: { readonly loader: Loadable }) {
    if (!loader) throw this.logger.Error().Msg("connectStorage_X: loader is required").AsError();
    this.loader = loader;
    const dataUrl = this.url.build().defParam(PARAM.STORE, "data").URI();
    const rgateway = await getStartedGateway(loader.sthis, dataUrl);
    if (rgateway.isErr())
      throw this.logger.Error().Result("err", rgateway).Url(dataUrl).Msg("connectStorage_X: gateway is required").AsError();
    const name = dataUrl.getParam(PARAM.NAME);
    if (!name) throw this.logger.Error().Url(dataUrl).Msg("connectStorage_X: name is required").AsError;
    loader.remoteCarStore = await RemoteDataStore(loader.sthis, this.url, {
      gateway: rgateway.Ok().gateway,
      loader,
    });
    // @jchris why we have a differention between remoteCarStore and remoteFileStore? -- file store is for on-demand attachment loading
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
  //   if (!currents) throw new Error("Can't sync empty database: save data first")
  //   if (currents.length > 1)
  //     throw new Error("Can't sync database with split heads: make an update first")
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
