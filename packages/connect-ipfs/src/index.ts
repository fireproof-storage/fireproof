import type { Connectable } from '@fireproof/encrypted-blockstore'
import { ConnectUCAN, ConnectUCANParams  } from './connect-ucan'

const ipfsCxs = new Map<string, ConnectUCAN>()

export const connect = {
  ucan: ({ name, blockstore }: Connectable, schemaName?: string) => {
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
  }
}
