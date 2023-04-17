import randomBytes from 'randombytes'

import { Database } from './database.js'
import { Listener } from './listener.js'
import { DbIndex as Index } from './db-index.js'
import { CID } from 'multiformats'
import { TransactionBlockstore } from './blockstore.js'
import { localGet } from './utils.js'
import { blocksToCarBlock, blocksToEncryptedCarBlock } from './valet.js'

export { Index, Listener, Database }

const parseCID = cid => (typeof cid === 'string' ? CID.parse(cid) : cid)

export class Fireproof {
  /**
   * @function storage
   * @memberof Fireproof
   * Creates a new Fireproof instance with default storage settings
   * Most apps should use this and not worry about the details.
   * @static
   * @returns {Database} - a new Fireproof instance
   */
  static storage = (name = null, opts = {}) => {
    if (name) {
      opts.name = name
      const existing = localGet('fp.' + name)
      if (existing) {
        const existingConfig = JSON.parse(existing)
        const fp = new Database(new TransactionBlockstore(name, existingConfig.key), [], opts)
        return this.fromJSON(existingConfig, fp)
      } else {
        const instanceKey = randomBytes(32).toString('hex') // pass null to disable encryption
        return new Database(new TransactionBlockstore(name, instanceKey), [], opts)
      }
    } else {
      return new Database(new TransactionBlockstore(), [], opts)
    }
  }

  static fromJSON (json, database) {
    database.hydrate({ clock: json.clock.map(c => parseCID(c)), name: json.name, key: json.key })
    if (json.indexes) {
      for (const {
        name,
        code,
        clock: { byId, byKey, db }
      } of json.indexes) {
        Index.fromJSON(database, {
          clock: {
            byId: byId ? parseCID(byId) : null,
            byKey: byKey ? parseCID(byKey) : null,
            db: db ? db.map(c => parseCID(c)) : null
          },
          code,
          name
        })
      }
    }
    return database
  }

  static snapshot (database, clock) {
    const definition = database.toJSON()
    const withBlocks = new Database(database.blocks)
    if (clock) {
      definition.clock = clock.map(c => parseCID(c))
      definition.indexes.forEach(index => {
        index.clock.byId = null
        index.clock.byKey = null
        index.clock.db = null
      })
    }
    const snappedDb = this.fromJSON(definition, withBlocks)
    ;[...database.indexes.values()].forEach(index => {
      snappedDb.indexes.get(index.mapFnString).mapFn = index.mapFn
    })
    return snappedDb
  }

  static async zoom (database, clock) {
    ;[...database.indexes.values()].forEach(index => {
      index.indexById = { root: null, cid: null }
      index.indexByKey = { root: null, cid: null }
      index.dbHead = null
    })
    database.clock = clock.map(c => parseCID(c))
    await database.notifyReset() // hmm... indexes should listen to this? might be more complex than worth it. so far this is the only caller
    return database
  }

  // get all the cids
  // tell valet to make a file
  static async makeCar (database, key = null) {
    const allCIDs = await database.allCIDs()
    const blocks = database.blocks
    const carBlocks = {
      entries: () => allCIDs.map(cid => ({ cid })),
      get: async (cid) => await blocks.get(cid)
    }

    key = key || blocks.valet?.getKeyMaterial()
    if (key) {
      return blocksToEncryptedCarBlock(allCIDs[allCIDs.length - 1], carBlocks, key)
    } else {
      return blocksToCarBlock(allCIDs[allCIDs.length - 1], carBlocks)
    }
  }
}
