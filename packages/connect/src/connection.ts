import { RemoteDataStore, RemoteMetaStore } from './store-remote'
import type {
  UploadMetaFnParams,
  UploadDataFnParams,
  DownloadMetaFnParams,
  DownloadDataFnParams
} from './types'
import type { AnyLink, Loader } from '@fireproof/core'

import { EventBlock, decodeEventBlock } from '@alanshaw/pail/clock'
import { MemoryBlockstore } from '@alanshaw/pail/block'
import type { Link } from 'multiformats'
import { TaskManager } from './task-manager'

export type CarClockHead = Link<DbMetaEventBlock>[]

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

  setLoader(loader: Loader) {
    this.loader = loader
    this.taskManager = new TaskManager(loader)
  }

  async refresh() {
    await this.loader!.remoteMetaStore!.load('main')
    await this.loader!.remoteWAL?._process()
  }

  connect(loader: Loader) {
    this.connectStorage(loader)
    this.connectMeta(loader)
  }

  connectMeta(loader: Loader) {
    this.setLoader(loader)

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

  connectStorage(loader: Loader) {
    this.setLoader(loader)
    this.loader!.remoteCarStore = new RemoteDataStore(this.loader!.name, this)
    this.loader!.remoteFileStore = new RemoteDataStore(this.loader!.name, this, 'file')
  }

  async createEventBlock(bytes: Uint8Array): Promise<DbMetaEventBlock> {
    const data = {
      dbMeta: bytes
    }
    const event = await EventBlock.create(data, this.parents)
    await this.eventBlocks.put(event.cid, event.bytes)
    return event as EventBlock<{ dbMeta: Uint8Array }> // todo test these `as` casts
  }

  async decodeEventBlock(bytes: Uint8Array): Promise<DbMetaEventBlock> {
    const event = await decodeEventBlock<{ dbMeta: Uint8Array }>(bytes)
    return event as EventBlock<{ dbMeta: Uint8Array }> // todo test these `as` casts
  }
}

export type DbMetaEventBlock = EventBlock<{ dbMeta: Uint8Array }>
