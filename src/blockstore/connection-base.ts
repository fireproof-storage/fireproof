import { Logger, URI } from "@adviser/cement";

import { throwFalsy } from "../types.js";
import { TaskManager } from "./task-manager.js";
import type { BlockstoreRuntime, Connection, Loadable } from "./types.js";
import { type Loader } from "./loader.js";
import { RemoteDataStore, RemoteMetaStore } from "./store-remote.js";
import { getGatewayFromURL } from "./store-factory.js";
import { getKeyBag } from "../runtime/key-bag.js";

export interface Connectable {
  readonly blockstore: {
    readonly loader?: Loader;
    readonly ebOpts: BlockstoreRuntime;
  };
  readonly name?: string;
  // readonly sthis: SuperThis;
}

export abstract class ConnectionBase implements Connection {
  // readonly ready: Promise<unknown>;
  // todo move to LRU blockstore https://github.com/web3-storage/w3clock/blob/main/src/worker/block.js
  // readonly eventBlocks = new MemoryBlockstore();
  loader?: Loadable;
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

  async connect_X({ loader }: { readonly loader?: Loadable }) {
    if (!loader) throw this.logger.Error().Msg("loader is required").AsError();
    await this.connectMeta_X({ loader });
    await this.connectStorage_X({ loader });
  }

  async connectMeta_X({ loader }: { loader?: Loadable }) {
    if (!loader) throw this.logger.Error().Msg("connectMeta_X: loader is required").AsError();
    this.loader = loader;
    await this.onConnect();
    const metaUrl = this.url.build().defParam("store", "meta").URI();
    const gateway = await getGatewayFromURL(metaUrl, this.loader.sthis);
    if (!gateway) throw this.logger.Error().Url(metaUrl).Msg("connectMeta_X: gateway is required").AsError();
    const dbName = metaUrl.getParam("name");
    if (!dbName) throw this.logger.Error().Url(metaUrl).Msg("connectMeta_X: name is required").AsError();
    const remote = await RemoteMetaStore(loader.sthis, dbName, metaUrl, {
      gateway: gateway.gateway,
      keybag: () => getKeyBag(loader.sthis, loader.ebOpts.keyBag),
      loader,
    });
    this.loader.remoteMetaStore = remote;
    this.loaded = this.loader.ready().then(async () => {
      return remote.load().then(async () => {
        return (await throwFalsy(this.loader).WALStore()).process();
      });
    });
  }

  abstract onConnect(): Promise<void>;

  async connectStorage_X({ loader }: { loader?: Loadable }) {
    if (!loader) throw this.logger.Error().Msg("connectStorage_X: loader is required").AsError();
    this.loader = loader;
    // const dataUrl = this.url.build().defParam("store", "data").defParam("fragSize", "128000").URI();
    const dataUrl = this.url.build().defParam("store", "data").URI();
    const gateway = await getGatewayFromURL(dataUrl, this.loader.sthis);
    if (!gateway) throw this.logger.Error().Url(dataUrl).Msg("connectStorage_X: gateway is required").AsError();
    const name = dataUrl.getParam("name");
    if (!name) throw this.logger.Error().Url(dataUrl).Msg("connectStorage_X: name is required").AsError;
    loader.remoteCarStore = await RemoteDataStore(loader.sthis, name, this.url, {
      gateway: gateway.gateway,
      keybag: () => getKeyBag(loader.sthis, this.loader?.ebOpts.keyBag),
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
