import { ConnectS3 } from './connect-s3'
import { Connection, CarClockHead } from './connection'
import type { Loader, AnyLink } from '@fireproof/core'
import {
  UploadDataFnParams,
  UploadMetaFnParams,
  DownloadDataFnParams,
  DownloadMetaFnParams
} from './types'

type RawConnectionParams = {
  metaUpload: (bytes: Uint8Array, params: UploadMetaFnParams) => Promise<Uint8Array[] | null>
  dataUpload: (bytes: Uint8Array, params: UploadDataFnParams) => Promise<void | AnyLink>
  metaDownload: (params: DownloadMetaFnParams) => Promise<Uint8Array[] | null>
  dataDownload: (params: DownloadDataFnParams) => Promise<Uint8Array | null>
}

// @ts-ignore
class ConnectRaw extends Connection {
  constructor({ metaUpload, metaDownload, dataUpload, dataDownload }: RawConnectionParams) {
    super()
    this.metaUpload = metaUpload
    this.metaDownload = metaDownload
    this.dataUpload = dataUpload
    this.dataDownload = dataDownload
  }
}

export const connect = {
  s3: (
    {
      _crdt: {
        blocks: { loader }
      }
    }: { _crdt: { blocks: { loader: Loader } } },
    { upload, download }: { upload: string; download: string }
  ) => {
    const connection = new ConnectS3(upload, download)
    connection.connect(loader!)
    return connection
  },
  raw: (
    {
      _crdt: {
        blocks: { loader }
      }
    }: { _crdt: { blocks: { loader: Loader } } },
    params: RawConnectionParams
  ) => {
    const connection = new ConnectRaw(params)
    connection.connect(loader!)
    return connection
  }
}

export function validateDataParams(params: DownloadDataFnParams | UploadDataFnParams) {
  const { type, name, car } = params
  if (!name) throw new Error('name is required')
  if (!car) {
    throw new Error('car is required')
  }
  if (type !== 'file' && type !== 'data') {
    throw new Error('type must be file or data')
  }
}

export function validateMetaParams(params: DownloadMetaFnParams | UploadMetaFnParams) {
  const { name, branch } = params
  if (!name) throw new Error('name is required')
  if (!branch) {
    throw new Error('branch is required')
  }
}

export { Connection, ConnectS3, CarClockHead }
