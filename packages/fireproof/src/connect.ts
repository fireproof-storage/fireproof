import { ConnectS3 } from './connect-s3'
import { ConnectWeb3 } from './connect-web3'
import { Database } from './database'
import type { DbLoader } from './loaders'
import { Connection, DownloadFn, DownloadFnParams, UploadFn, UploadFnParams } from './types'

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
  { upload, download }: { upload: UploadFn, download: DownloadFn }) => {
    const connection = { upload, download, ready: Promise.resolve() } as Connection
    loader.connectRemote(connection)
    return connection
  },
  web3: (db: Database,
    email: `${string}@${string}`) => {
    console.log('connecting web3', email)
    const { _crdt: { blocks: { loader } } } = db
    const connection = new ConnectWeb3(email)
    // loader.connectRemote(connection)
    loader!.connectRemoteStorage(connection)
  }
}

export function validateParams(params: DownloadFnParams | UploadFnParams) {
  const { type, name, car, branch } = params
  if (!name) throw new Error('name is required')
  if (car && branch) { throw new Error('car and branch are mutually exclusive') }
  if (!car && !branch) { throw new Error('car or branch is required') }
  if (type !== 'file' && type !== 'data' && type !== 'meta') { throw new Error('type must be file, data or meta') }
}
