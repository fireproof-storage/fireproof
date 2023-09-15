import { ConnectS3 } from './connect-s3'
import { ConnectWeb3 } from './connect-web3'
import { Connection } from './connection'
import { Database } from './database'
import type { DbLoader } from './loaders'
import { UploadDataFnParams, UploadMetaFnParams, DownloadDataFnParams, DownloadMetaFnParams, AnyLink } from './types'

type RawConnectionParams = {
  metaUpload: (bytes: Uint8Array, params: UploadMetaFnParams) => Promise<Uint8Array[] | null>,
  dataUpload: (bytes: Uint8Array, params: UploadDataFnParams) => Promise<void | AnyLink>
  metaDownload: (params: DownloadMetaFnParams) => Promise<Uint8Array[] | null>
  dataDownload: (params: DownloadDataFnParams) => Promise<Uint8Array | null>,
}

// @ts-ignore
class ConnectRaw extends Connection {
  constructor({
    metaUpload, metaDownload,
    dataUpload, dataDownload
  }: RawConnectionParams) {
    super()
    this.metaUpload = metaUpload
    this.metaDownload = metaDownload
    this.dataUpload = dataUpload
    this.dataDownload = dataDownload
  }
}

const web3names = new Map<string, ConnectWeb3>()

export const connect = {
  s3: ({ _crdt: { blocks: { loader } } }:
    { _crdt: { blocks: { loader: DbLoader } } },
  { upload, download }: { upload: string, download: string }) => {
    const connection = new ConnectS3(upload, download)
    loader.connectRemote(connection)
    return connection
  },
  raw: ({ _crdt: { blocks: { loader } } }:
    { _crdt: { blocks: { loader: DbLoader } } },
  params: RawConnectionParams) => {
    const connection = new ConnectRaw(params)
    loader.connectRemote(connection)
    return connection
  },
  web3: (db: Database,
    schemaName?: string) => {
    const { name, _crdt: { blocks: { loader } } } = db
    if (!name) throw new Error('database name is required')
    if (web3names.has(name)) {
      return web3names.get(name)!
    }
    if (!schemaName && location) {
      schemaName = location.origin
    }
    const connection = new ConnectWeb3({ name, schema: schemaName! })
    loader!.connectRemote(connection)
    web3names.set(name, connection)
    return connection
  }
}

export function validateDataParams(params: DownloadDataFnParams | UploadDataFnParams) {
  const { type, name, car } = params
  if (!name) throw new Error('name is required')
  if (!car) { throw new Error('car is required') }
  if (type !== 'file' && type !== 'data') { throw new Error('type must be file or data') }
}

export function validateMetaParams(params: DownloadMetaFnParams | UploadMetaFnParams) {
  const { name, branch } = params
  if (!name) throw new Error('name is required')
  if (!branch) { throw new Error('branch is required') }
}
