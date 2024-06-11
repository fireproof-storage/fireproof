import { SQLiteConnection } from "./sqlite-adapter-node"
import { DBConnection } from "./types"


export function SQLFactory(databaseURL: URL): DBConnection {
    switch (databaseURL.protocol) {
        case 'sqlite:':
            return SQLiteConnection.fromFilename(databaseURL.hostname)
        default:
            throw new Error('unsupported protocol ' + databaseURL.protocol)
    }
}
