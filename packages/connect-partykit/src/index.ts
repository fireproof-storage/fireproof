import { ConnectREST, Connectable } from '@fireproof/encrypted-blockstore'
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
    blockstore.ebOpts.threshold = 50000
    connection.connect(blockstore)
    partyCxs.set(name, connection)
    return connection
  },
  partykitS3: ({ name, blockstore }: Connectable, partyHost?: string, refresh?: boolean) => {
    throw new Error('Removed, use connect.partykit() instead or see README')
  },
  partykitRest: ({ name, blockstore }: Connectable, partyHost?: string, refresh?: boolean) => {
    if (!name) throw new Error('database name is required')
    if (!refresh && partyCxs.has(name)) {
      return partyCxs.get(name)!
    }

    const restConn = new ConnectREST('http://localhost:8000/')
    restConn.connectStorage(blockstore)

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
