import { EventBlock, decodeEventBlock } from "@web3-storage/pail/clock";
import { EventView } from "@web3-storage/pail/clock/api";
import { MemoryBlockstore } from "@web3-storage/pail/block";
import type { Link, Version } from "multiformats";

import { Falsy, throwFalsy } from "../types.js";
import { TaskManager } from "./task-manager.js";
import type { BlockstoreOpts } from "./transaction.js";
import type { UploadMetaFnParams, UploadDataFnParams, DownloadMetaFnParams, DownloadDataFnParams, Connection } from "./types.js";
import { Loadable, type Loader } from "./loader.js";

import { RemoteDataStore, RemoteMetaStore } from "./store-remote.js";

export type CarClockHead = Link<DbMetaEventBlock, number, number, Version>[];

export interface Connectable {
  readonly blockstore: {
    readonly loader?: Loader;
    readonly ebOpts: BlockstoreOpts;
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

  abstract metaUpload(bytes: Uint8Array, params: UploadMetaFnParams): Promise<Uint8Array[] | Falsy>;
  abstract dataUpload(bytes: Uint8Array, params: UploadDataFnParams, opts?: { public?: boolean }): Promise<void>;
  abstract metaDownload(params: DownloadMetaFnParams): Promise<Uint8Array[] | Falsy>;
  abstract dataDownload(params: DownloadDataFnParams): Promise<Uint8Array | Falsy>;

  // constructor() {
  //   this.ready = Promise.resolve();
  // }

  async refresh() {
    await throwFalsy(throwFalsy(this.loader).remoteMetaStore).load("main");
    await (await throwFalsy(this.loader).remoteWAL())._process();
  }

  connect({ loader }: { loader?: Loader }) {
    if (!loader) throw new Error("loader is required");
    this.connectMeta({ loader });
    this.connectStorage({ loader });
  }

  connectMeta({ loader }: { loader?: Loader }) {
    if (!loader) throw new Error("loader is required");
    this.loader = loader;
    this.taskManager = new TaskManager(loader);
    this.onConnect();
    const remote = new RemoteMetaStore(new URL(`remote://connectMeta`), this.loader.name, this);
    remote.onLoad("main", async (metas) => {
      if (metas) {
        await throwFalsy(this.loader).handleDbMetasFromStore(metas);
      }
    });
    this.loader.remoteMetaStore = remote;
    this.loaded = this.loader.xready().then(async () => {
      remote.load("main").then(async () => {
        (await throwFalsy(this.loader).remoteWAL())._process();
      });
    });
  }

  async onConnect() {
    return;
  }

  connectStorage({ loader }: { loader?: Loader }) {
    if (!loader) throw new Error("loader is required");
    this.loader = loader;
    loader.remoteCarStore = new RemoteDataStore(new URL(`remote://remoteCarStore`), this.loader.name, this);
    loader.remoteFileStore = new RemoteDataStore(new URL(`remote://remoteFileStore`), this.loader.name, this);
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
