import { ConnectUCAN, ConnectUCANParams } from './connect-ucan'
import { ConnectS3 } from '@fireproof/aws'
import type { Connectable } from '@fireproof/encrypted-blockstore'
import { ConnectUCANV2 } from './connect-ucan-v2'

const ipfsCxs = new Map<string, ConnectUCAN | ConnectUCANV2>()

export const connect = {
  ipfs2: ({ name, blockstore }: Connectable, schemaName?: string) => {
    if (!name) throw new Error('database name is required')
    if (ipfsCxs.has(name)) {
      return ipfsCxs.get(name)!
    }
    if (!schemaName && location) {
      schemaName = location.origin
    }
    const connection = new ConnectUCANV2({ name, schema: schemaName! } as ConnectUCANParams)
    connection.connect(blockstore)
    ipfsCxs.set(name, connection)
    return connection
  },
  ipfs: ({ name, blockstore }: Connectable, schemaName?: string) => {
    if (!name) throw new Error('database name is required')
    if (ipfsCxs.has(name)) {
      return ipfsCxs.get(name)!
    }
    if (!schemaName && location) {
      schemaName = location.origin
    }
    const connection = new ConnectUCAN({ name, schema: schemaName! } as ConnectUCANParams)
    connection.connect(blockstore)
    ipfsCxs.set(name, connection)
    return connection
  },
  hybrid: ({ name, blockstore }: Connectable, schemaName?: string) => {
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
    const s3conn = new ConnectS3(s3conf.upload, s3conf.download, '')
    s3conn.connectStorage(blockstore)
    const ipfsConn = new ConnectUCAN({ name, schema: schemaName! } as ConnectUCANParams)
    ipfsConn.connectMeta(blockstore)
    ipfsCxs.set(name, ipfsConn)
    return ipfsConn
  }
}
