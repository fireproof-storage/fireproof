import type { Database } from '@fireproof/core'
import { ConnectNetlify } from './connect-netlify'

const netlifyCxs = new Map<string, ConnectNetlify>()

export { ConnectNetlify }

export const connect = {
  netlify: (db: Database, partyHost?: string, refresh?: boolean) => {
    const {
      name,
      _crdt: {
        blocks: { loader }
      }
    } = db
    if (!name) throw new Error('database name is required')
    if (!refresh && netlifyCxs.has(name)) {
      return netlifyCxs.get(name)!
    }
    const connection = new ConnectNetlify(name)
    connection.connect(loader!)
    netlifyCxs.set(name, connection)
    return connection
  }
}
