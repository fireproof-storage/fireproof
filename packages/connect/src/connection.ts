import type { UploadMetaFnParams, UploadDataFnParams, DownloadMetaFnParams, DownloadDataFnParams } from './types'
import type { AnyLink, Loader } from '@fireproof/core'

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
}
