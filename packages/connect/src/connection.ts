import { RemoteDataStore, RemoteMetaStore } from './store-remote'
import type { UploadMetaFnParams, UploadDataFnParams, DownloadMetaFnParams, DownloadDataFnParams } from './types'
import type { AnyLink, Loader, DataStore } from '@fireproof/core'

interface DbLoader extends Loader {
  fileStore?: DataStore
  remoteFileStore?: RemoteDataStore
}
function isDbLoader(loader: Loader): loader is DbLoader {
  return (loader as DbLoader).fileStore !== undefined;
}

export abstract class Connection {
  ready: Promise<any>
  loaded: Promise<any>
  abstract metaUpload(bytes: Uint8Array, params: UploadMetaFnParams): Promise<Uint8Array[] | null>
  abstract dataUpload(bytes: Uint8Array, params: UploadDataFnParams, opts?: { public?: boolean }): Promise<void | AnyLink>
  abstract metaDownload(params: DownloadMetaFnParams): Promise<Uint8Array[] | null>
  abstract dataDownload(params: DownloadDataFnParams): Promise<Uint8Array | null>

  constructor() {
    this.ready = Promise.resolve()
    this.loaded = Promise.resolve()
  }

  loader?: Loader | null

  async refresh() {
    await this.loader!.remoteMetaStore!.load('main')
    await this.loader!.remoteWAL?._process()
  }

  connect(loader: Loader) {
    this.loader = loader
    this.connectMeta(loader)
    this.connectStorage(loader)
    this.loaded = Promise.all([this.loader.ready, this.loader.remoteMetaLoading]).then(() => {
      void this.loader!.remoteWAL?._process()
    })
  }

  connectMeta(loader: Loader) {
    const remote = new RemoteMetaStore(loader.name, this)
    remote.onLoad('main', async (metas) => {
      if (metas) {
        await loader.handleDbMetasFromStore(metas)
      }
    })
    loader.remoteMetaStore = remote
    loader.remoteMetaLoading = remote!.load('main').then(() => { })
  }

  connectStorage(loader: Loader) {
    const remote = new RemoteDataStore(loader, this)
    loader.remoteCarStore = remote
    if (isDbLoader(loader)) {
      loader.remoteFileStore = new RemoteDataStore(loader, this, 'file')
    }
  }

}
