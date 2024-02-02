import { RemoteDataStore, RemoteMetaStore } from './store-remote'
import type {
  UploadMetaFnParams,
  UploadDataFnParams,
  DownloadMetaFnParams,
  DownloadDataFnParams
} from './types'
import type { AnyLink, Loader } from '@fireproof/encrypted-blockstore'

import { EventBlock, EventView, decodeEventBlock } from '@alanshaw/pail/clock'
import { MemoryBlockstore } from '@alanshaw/pail/block'
import type { Link } from 'multiformats'
import { TaskManager } from './task-manager'

export type CarClockHead = Link<DbMetaEventBlock>[]

export type Connectable = {
  blockstore: { loader: Loader }
  name: string
}

export abstract class Connection {
  ready: Promise<any>
  loaded: Promise<any>
  // todo move to LRU blockstore https://github.com/web3-storage/w3clock/blob/main/src/worker/block.js
  eventBlocks = new MemoryBlockstore()
  parents: CarClockHead = []
  loader?: Loader
  taskManager?: TaskManager

  abstract metaUpload(bytes: Uint8Array, params: UploadMetaFnParams): Promise<Uint8Array[] | null>
  abstract dataUpload(
    bytes: Uint8Array,
    params: UploadDataFnParams,
    opts?: { public?: boolean }
  ): Promise<void | AnyLink>
  abstract metaDownload(params: DownloadMetaFnParams): Promise<Uint8Array[] | null>
  abstract dataDownload(params: DownloadDataFnParams): Promise<Uint8Array | null>

  constructor() {
    this.ready = Promise.resolve()
    this.loaded = Promise.resolve()
  }

  async refresh() {
    await this.loader!.remoteMetaStore!.load('main')
    await this.loader!.remoteWAL?._process()
  }

  connect({ loader }: { loader: Loader }) {
    this.connectStorage({ loader })
    this.connectMeta({ loader })
  }

  connectMeta({ loader }: { loader: Loader }) {
    this.loader = loader
    this.taskManager = new TaskManager(loader)
    this.onConnect()
    const remote = new RemoteMetaStore(this.loader!.name, this)
    remote.onLoad('main', async metas => {
      if (metas) {
        await this.loader!.handleDbMetasFromStore(metas)
      }
    })
    this.loader!.remoteMetaStore = remote
    this.loaded = this.loader!.ready.then(async () => {
      remote!.load('main').then(() => {
        void this.loader!.remoteWAL?._process()
      })
    })
  }

  async onConnect() {  }

  connectStorage({ loader }: { loader: Loader }) {
    // todo move this to use factory
    loader!.remoteCarStore = new RemoteDataStore(this.loader!.name, this)
    loader!.remoteFileStore = new RemoteDataStore(this.loader!.name, this, 'file')
  }

  async createEventBlock(bytes: Uint8Array): Promise<DbMetaEventBlock> {
    const data = {
      dbMeta: bytes
    }
    const event = await EventBlock.create(data, this.parents as unknown as Link<EventView<{ dbMeta: Uint8Array; }>, number, number, 1>[])
    await this.eventBlocks.put(event.cid, event.bytes)
    return event as EventBlock<{ dbMeta: Uint8Array }> // todo test these `as` casts
  }

  async decodeEventBlock(bytes: Uint8Array): Promise<DbMetaEventBlock> {
    const event = await decodeEventBlock<{ dbMeta: Uint8Array }>(bytes)
    return event as EventBlock<{ dbMeta: Uint8Array }> // todo test these `as` casts
  }

  // move this stuff to connect
  async getDashboardURL(compact = true) {
    const baseUrl = 'https://dashboard.fireproof.storage/'
    if (!this.loader?.remoteCarStore) return new URL('/howto', baseUrl)
    // if (compact) {
    //   await this.compact()
    // }
    const currents = await this.loader?.metaStore?.load()
    if (!currents) throw new Error("Can't sync empty database: save data first")
    if (currents.length > 1)
      throw new Error("Can't sync database with split heads: make an update first")
    const current = currents[0]
    const params = {
      car: current.car.toString()
    }
    if (current.key) {
      // @ts-ignore
      params.key = current.key.toString()
    }
    // @ts-ignore
    if (this.name) {
      // @ts-ignore
      params.name = this.name
    }
    const url = new URL('/import#' + new URLSearchParams(params).toString(), baseUrl)
    console.log('Import to dashboard: ' + url.toString())
    return url
  }

  openDashboard() {
    void this.getDashboardURL().then(url => {
      if (url) window.open(url.toString(), '_blank')
    })
  }
}

export type DbMetaEventBlock = EventBlock<{ dbMeta: Uint8Array }>
