import { EventBlock, decodeEventBlock } from "@web3-storage/pail/clock";
import { EventView } from "@web3-storage/pail/clock/api";
import { MemoryBlockstore } from "@web3-storage/pail/block";
import type { Link, Version } from "multiformats";
import { Logger } from "@adviser/cement";

import { throwFalsy } from "../types.js";
import { TaskManager } from "./task-manager.js";
import type { BlockstoreRuntime, Connection, Loadable } from "./types.js";
import { type Loader } from "./loader.js";
import { RemoteDataStore, RemoteMetaStore } from "./store-remote.js";
import { getGatewayFromURL } from "./store-factory.js";
import { getKeyBag } from "../runtime/key-bag.js";
// import { ensureLogger } from "../utils.js";

export type CarClockHead = Link<DbMetaEventBlock, number, number, Version>[];

export interface Connectable {
  readonly blockstore: {
    readonly loader?: Loader;
    readonly ebOpts: BlockstoreRuntime;
  };
  readonly name?: string;
}

export abstract class ConnectionBase implements Connection {
  // readonly ready: Promise<unknown>;
  // todo move to LRU blockstore https://github.com/web3-storage/w3clock/blob/main/src/worker/block.js
  readonly eventBlocks = new MemoryBlockstore();
  parents: CarClockHead = [];
  loader?: Loadable;
  taskManager?: TaskManager;
  loaded: Promise<void> = Promise.resolve();

  readonly url: URL;

  // abstract metaUpload(bytes: Uint8Array, params: UploadMetaFnParams): Promise<Uint8Array[] | Falsy>;
  // abstract dataUpload(bytes: Uint8Array, params: UploadDataFnParams, opts?: { public?: boolean }): Promise<void>;
  // abstract metaDownload(params: DownloadMetaFnParams): Promise<Uint8Array[] | Falsy>;
  // abstract dataDownload(params: DownloadDataFnParams): Promise<Uint8Array | Falsy>;

  readonly logger: Logger;
  constructor(url: URL, logger: Logger) {
    this.logger = logger;
    this.url = url;
  }

  async refresh() {
    await throwFalsy(throwFalsy(this.loader).remoteMetaStore).load("main");
    await (await throwFalsy(this.loader).WALStore()).process();
  }

  async connect_X({ loader }: { readonly loader?: Loader }) {
    if (!loader) throw this.logger.Error().Msg("loader is required").AsError();
    await this.connectMeta_X({ loader });
    await this.connectStorage_X({ loader });
  }

  async connectMeta_X({ loader }: { loader?: Loadable }) {
    if (!loader) throw this.logger.Error().Msg("connectMeta_X: loader is required").AsError();
    this.loader = loader;
    this.taskManager = new TaskManager(loader);
    await this.onConnect();
    const metaUrl = new URL(this.url.toString());
    metaUrl.searchParams.set("store", metaUrl.searchParams.get("store") || "meta");
    const gateway = await getGatewayFromURL(metaUrl, this.logger);
    if (!gateway) throw this.logger.Error().Url(metaUrl).Msg("connectMeta_X: gateway is required").AsError();
    const name = metaUrl.toString();
    const remote = await RemoteMetaStore(name, metaUrl, {
      logger: this.logger,
      gateway,
      keybag: () => getKeyBag(this.loader?.ebOpts.keyBag),
    });
    remote.onLoad("main", async (metas) => {
      if (metas) {
        this.logger.Debug().Any("metas", metas).Bool("loader", this.loader).Msg("connectMeta_X: handleDbMetasFromStore pre");
        await throwFalsy(this.loader).handleDbMetasFromStore(metas);
        this.logger.Debug().Any("metas", metas).Msg("connectMeta_X: handleDbMetasFromStore post");
      }
    });
    this.loader.remoteMetaStore = remote;
    this.loaded = this.loader.ready().then(async () => {
      remote.load("main").then(async () => {
        (await throwFalsy(this.loader).WALStore()).process();
      });
    });
  }

  abstract onConnect(): Promise<void>;

  async connectStorage_X({ loader }: { loader?: Loadable }) {
    if (!loader) throw this.logger.Error().Msg("connectStorage_X: loader is required").AsError();
    this.loader = loader;
    const dataUrl = new URL(this.url.toString());
    dataUrl.searchParams.set("store", dataUrl.searchParams.get("store") || "data");
    const gateway = await getGatewayFromURL(dataUrl, this.logger);
    if (!gateway) throw this.logger.Error().Url(dataUrl).Msg("connectStorage_X: gateway is required").AsError();
    const name = dataUrl.toString();
    loader.remoteCarStore = await RemoteDataStore(name, this.url, {
      logger: this.logger,
      gateway,
      keybag: () => getKeyBag(this.loader?.ebOpts.keyBag),
    });
    // @jchris why we have a differention between remoteCarStore and remoteFileStore?
    loader.remoteFileStore = loader.remoteCarStore;
  }

  async createEventBlock(bytes: Uint8Array): Promise<DbMetaEventBlock> {
    const data = {
      dbMeta: bytes,
    };
    const event = await EventBlock.create(
      data,
      this.parents as unknown as Link<EventView<{ dbMeta: Uint8Array }>, number, number, 1>[],
    );
    await this.eventBlocks.put(event.cid, event.bytes);
    return event as EventBlock<{ dbMeta: Uint8Array }>; // todo test these `as` casts
  }

  async decodeEventBlock(bytes: Uint8Array): Promise<DbMetaEventBlock> {
    const event = await decodeEventBlock<{ dbMeta: Uint8Array }>(bytes);
    return event as EventBlock<{ dbMeta: Uint8Array }>; // todo test these `as` casts
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

export type DbMetaEventBlock = EventBlock<{ dbMeta: Uint8Array }>;
