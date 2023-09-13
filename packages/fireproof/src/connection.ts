import { Loader } from './loader'
import { UploadMetaFnParams, UploadDataFnParams, AnyLink, DownloadMetaFnParams, DownloadDataFnParams } from './types'

export abstract class Connection {
  ready: Promise<any>
  abstract metaUpload(bytes: Uint8Array, params: UploadMetaFnParams): Promise<Uint8Array[] | null>
  abstract dataUpload(bytes: Uint8Array, params: UploadDataFnParams): Promise<void | AnyLink>
  abstract metaDownload(params: DownloadMetaFnParams): Promise<Uint8Array[] | null>
  abstract dataDownload(params: DownloadDataFnParams): Promise<Uint8Array | null>

  constructor() {
    this.ready = Promise.resolve()
  }

  loader?: Loader | null

  async refresh() {
    console.log('refreshing', this.loader?.name)
    await this.loader!.remoteMetaStore!.load('main')
    await this.loader!.remoteWAL?._process()
  }
}
export type MetaUploadFn = (bytes: Uint8Array, params: UploadMetaFnParams) => Promise<Uint8Array[] | null>
export type DataUploadFn = (bytes: Uint8Array, params: UploadDataFnParams) => Promise<void | AnyLink>
