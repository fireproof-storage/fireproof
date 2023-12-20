import { RemoteDataStore, RemoteMetaStore } from './store-remote'
import type {
  UploadMetaFnParams,
  UploadDataFnParams,
  DownloadMetaFnParams,
  DownloadDataFnParams
} from './types'
import type { AnyLink, Loader, DataStore } from '@fireproof/core'

import { EventBlock, EventView, decodeEventBlock } from '@alanshaw/pail/clock'
import { MemoryBlockstore } from '@alanshaw/pail/block'
import type { BlockView, Link } from 'multiformats'

interface DbLoader extends Loader {
  name: string
  fileStore?: DataStore
  remoteFileStore?: RemoteDataStore
}
function isDbLoader(loader: Loader): loader is DbLoader {
  return (loader as DbLoader).fileStore !== undefined
}
export type CarClockHead = Link<EventView<{ dbMeta: Uint8Array }>, number, number, 1>[]

export abstract class Connection {
  ready: Promise<any>
  loaded: Promise<any>
  // todo move to LRU blockstore https://github.com/web3-storage/w3clock/blob/main/src/worker/block.js
  eventBlocks = new MemoryBlockstore()
  parents: CarClockHead = []
  loader?: Loader | null

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

  connect(loader: Loader) {
    this.connectStorage(loader)
    this.connectMeta(loader)
  }

  connectMeta(loader: Loader) {
    this.loader = loader
    const remote = new RemoteMetaStore(loader.name, this)
    remote.onLoad('main', async metas => {
      if (metas) {
        await loader.handleDbMetasFromStore(metas)
      }
    })
    loader.remoteMetaStore = remote
    this.loaded = loader.ready.then(async () => {
      loader.remoteMetaLoading = remote!.load('main').then(() => {})
      loader.remoteMetaLoading.then(() => {
        void this.loader!.remoteWAL?._process()
      })
    })
  }

  connectStorage(loader: Loader) {
    this.loader = loader
    loader.remoteCarStore = new RemoteDataStore(loader.name, this)
    if (isDbLoader(loader)) {
      loader.remoteFileStore = new RemoteDataStore(loader.name, this, 'file')
    }
  }

  async createEventBlock(bytes: Uint8Array): Promise<
    BlockView<
      EventView<{
        dbMeta: Uint8Array
      }>,
      number,
      number,
      1
    >
  > {
    const data = {
      dbMeta: bytes
    }
    const event = await EventBlock.create(data, this.parents)
    // const eventBlocks = new MemoryBlockstore()
    await this.eventBlocks.put(event.cid, event.bytes)
    // await eventBlocks.put(event.cid, event.bytes)
    return event
  }

  async decodeEventBlock(bytes: Uint8Array): Promise<
    BlockView<
      EventView<{
        dbMeta: Uint8Array
      }>,
      number,
      number,
      1
    >
  > {
    const event = await decodeEventBlock<{ dbMeta: Uint8Array }>(bytes)
    return event
  }
}
