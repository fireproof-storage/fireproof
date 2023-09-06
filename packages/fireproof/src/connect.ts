import { ConnectS3 } from './connect-s3'
import { ConnectWeb3 } from './connect-web3'
import { Database } from './database'
import type { DbLoader } from './loaders'
import { Connection, UploadDataFnParams, MetaUploadFn, DataUploadFn, UploadMetaFnParams, DataDownloadFn, MetaDownloadFn, DownloadDataFnParams, DownloadMetaFnParams } from './types'

const web3names = new Set<string>()

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
  { metaUpload, metaDownload, dataUpload, dataDownload }: { dataUpload: DataUploadFn, dataDownload: DataDownloadFn,
    metaUpload: MetaUploadFn, metaDownload: MetaDownloadFn }) => {
    const connection = { metaUpload, metaDownload, dataUpload, dataDownload, ready: Promise.resolve() } as Connection
    loader.connectRemote(connection)
    return connection
  },
  web3: (db: Database,
    email: `${string}@${string}`) => {
    console.log('connecting web3', email)
    const { name, _crdt: { blocks: { loader } } } = db
    if (web3names.has(name + email)) {
      // console.log(`already connecting to ${name} + ${email}`)
      return
    }
    const connection = new ConnectWeb3(email)
    loader!.connectRemote(connection)
    // loader!.connectRemoteStorage(connection)
    web3names.add(name + email)
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
