import { ConnectS3 } from './connect-s3'
import type { DbLoader } from './loader'
import { Connection, DownloadFn, UploadFn } from './types'

export const connect = {
  s3: ({ _crdt: { blocks: { loader } } }:
    { _crdt: { blocks: { loader: DbLoader } } },
  { upload, download }: {upload: string, download: string}) => {
    const connection = new ConnectS3(upload, download)
    loader.connectRemote(connection)
    return connection
  },
  raw: ({ _crdt: { blocks: { loader } } }:
    { _crdt: { blocks: { loader: DbLoader } } },
  { upload, download }: {upload: UploadFn, download: DownloadFn}) => {
    const connection = { upload, download, ready: Promise.resolve() } as Connection
    loader.connectRemote(connection)
    return connection
  }
}
