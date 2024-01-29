import { ConnectS3, Connectable } from '@fireproof/connect'
import { ConnectPartyKit, ConnectPartyKitParams } from './connect-partykit'
export { ConnectPartyKit, ConnectPartyKitParams } from './connect-partykit'

const partyCxs = new Map<string, ConnectPartyKit>()

export const connect = {
  partykit: ({ name, blockstore }: Connectable, partyHost?: string, refresh?: boolean) => {
    if (!name) throw new Error('database name is required')
    if (!refresh && partyCxs.has(name)) {
      return partyCxs.get(name)!
    }
    if (!partyHost) {
      console.warn('Party host not provided, using localhost:1999')
      partyHost = 'http://localhost:1999'
    }
    const connection = new ConnectPartyKit({ name, host: partyHost } as ConnectPartyKitParams)
    connection.connect(blockstore)
    partyCxs.set(name, connection)
    return connection
  },
  partykitS3: (
    { name, blockstore }: Connectable,
    partyHost?: string,
    refresh?: boolean
  ) => {
    if (!name) throw new Error('database name is required')
    if (!refresh && partyCxs.has(name)) {
      return partyCxs.get(name)!
    }
    const s3conf = {
      upload: 'https://04rvvth2b4.execute-api.us-east-2.amazonaws.com/uploads',
      download: 'https://sam-app-s3uploadbucket-e6rv1dj2kydh.s3.us-east-2.amazonaws.com'
    }
    const s3conn = new ConnectS3(s3conf.upload, s3conf.download)
    s3conn.connectStorage(blockstore)

    if (!partyHost) {
      console.warn('partyHost not provided, using localhost:1999')
      partyHost = 'http://localhost:1999'
    }
    const connection = new ConnectPartyKit({ name, host: partyHost } as ConnectPartyKitParams)
    connection.connectMeta(blockstore)
    partyCxs.set(name, connection)
    return connection
  }
}
