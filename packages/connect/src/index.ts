import { ConnectS3 } from './connect-s3'
import { ConnectREST } from './connect-rest'
import { Connection, CarClockHead, Connectable } from './connection'
import type { AnyLink } from '@fireproof/encrypted-blockstore'
export type { AnyLink }
export { makeStores } from './store-remote'
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
  s3free: ({ blockstore }: Connectable) => {
    const upload = 'https://udvtu5wy39.execute-api.us-east-2.amazonaws.com/uploads'
    const download = 'https://crdt-s3uploadbucket-dcjyurxwxmba.s3.us-east-2.amazonaws.com'
    const websocket = ''
    const connection = new ConnectS3(upload, download, websocket)
    connection.connect(blockstore)
    return connection
  },
  awsFree: ({ blockstore, name }: Connectable) => {
    const upload = 'https://udvtu5wy39.execute-api.us-east-2.amazonaws.com/uploads'
    const download = 'https://crdt-s3uploadbucket-dcjyurxwxmba.s3.us-east-2.amazonaws.com'
    const websocket = `wss://v7eax67rm6.execute-api.us-east-2.amazonaws.com/Prod?database=${name}`
    const connection = new ConnectS3(upload, download, websocket)
    connection.connect(blockstore)
    return connection
  },
  aws: (
    { blockstore, name }: Connectable,
    { upload, download, websocket }: { upload: string; download: string; websocket: string }
  ) => {
    const updatedwebsocket = `${websocket}?database=${name}`
    const connection = new ConnectS3(upload, download, updatedwebsocket)
    connection.connect(blockstore)
    return connection
  },
  raw: ({ blockstore }: Connectable, params: RawConnectionParams) => {
    const connection = new ConnectRaw(params)
    connection.connect(blockstore)
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

export { Connection, ConnectS3, ConnectREST, CarClockHead, Connectable }
