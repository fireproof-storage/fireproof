import { ConnectS3 } from '@fireproof/connect'
import type { Database } from '@fireproof/core'
import { ConnectPartyKit, ConnectPartyKitParams } from './connect-partykit'

const partyCxs = new Map<string, ConnectPartyKit>()

export const connect = {
  partykit: (db: Database,
    partyHost?: string) => {
    const { name, _crdt: { blocks: { loader } } } = db
    if (!name) throw new Error('database name is required')
    if (partyCxs.has(name)) {
      return partyCxs.get(name)!
    }
    const s3conf = {
      upload: 'https://04rvvth2b4.execute-api.us-east-2.amazonaws.com/uploads',
      download: 'https://sam-app-s3uploadbucket-e6rv1dj2kydh.s3.us-east-2.amazonaws.com'
    }
    const s3conn = new ConnectS3(s3conf.upload, s3conf.download)
    s3conn.connectStorage(loader!)

    if (!partyHost) {
      console.warn('partyHost not provided, using localhost:1999')
      partyHost = 'http://localhost:1999'
    }
    const connection = new ConnectPartyKit({ name, host: partyHost! } as ConnectPartyKitParams)
    connection.connectMeta(loader!)
    partyCxs.set(name, connection)
    return connection
  }
}

