import { ConnectS3 } from './connect-s3'
import { ConnectIPFS, ConnectIPFSParams } from './connect-ipfs'
import { Connection } from './connection'
import type { Loader, Database, AnyLink } from '@fireproof/core'
import { UploadDataFnParams, UploadMetaFnParams, DownloadDataFnParams, DownloadMetaFnParams } from './types'

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

const ipfsCxs = new Map<string, ConnectIPFS>()

export const connect = {
  s3: ({ _crdt: { blocks: { loader } } }:
    { _crdt: { blocks: { loader: Loader } } },
    { upload, download }: { upload: string, download: string }) => {
    const connection = new ConnectS3(upload, download)
    connection.connect(loader!)
    return connection
  },
  raw: ({ _crdt: { blocks: { loader } } }:
    { _crdt: { blocks: { loader: Loader } } },
    params: RawConnectionParams) => {
    const connection = new ConnectRaw(params)
    connection.connect(loader!)
    return connection
  },
  ipfs: (db: Database,
    schemaName?: string) => {
    const { name, _crdt: { blocks: { loader } } } = db
    if (!name) throw new Error('database name is required')
    if (ipfsCxs.has(name)) {
      return ipfsCxs.get(name)!
    }
    if (!schemaName && location) {
      schemaName = location.origin
    }
    const connection = new ConnectIPFS({ name, schema: schemaName! } as ConnectIPFSParams)
    connection.connect(loader!)
    ipfsCxs.set(name, connection)
    return connection
  },
  hybrid: (db: Database,
    schemaName?: string) => {
    const { name, _crdt: { blocks: { loader } } } = db
    if (!name) throw new Error('database name is required')
    if (ipfsCxs.has(name)) {
      return ipfsCxs.get(name)!
    }
    if (!schemaName && location) {
      schemaName = location.origin
    }
    const s3conf = {
      upload: 'https://04rvvth2b4.execute-api.us-east-2.amazonaws.com/uploads',
      download: 'https://sam-app-s3uploadbucket-e6rv1dj2kydh.s3.us-east-2.amazonaws.com'
    }
    const s3conn = new ConnectS3(s3conf.upload, s3conf.download)
    s3conn.connectStorage(loader!)
    const ipfsConn = new ConnectIPFS({ name, schema: schemaName! } as ConnectIPFSParams)
    ipfsConn.connectMeta(loader!)
    ipfsCxs.set(name, ipfsConn)
    return ipfsConn
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
