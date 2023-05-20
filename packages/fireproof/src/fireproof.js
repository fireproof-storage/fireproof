import randomBytes from 'randombytes'
// import { randomBytes } from 'crypto'
import { Database, parseCID } from './database.js'
import { Listener } from './listener.js'
import { DbIndex as Index } from './db-index.js'
// import { TransactionBlockstore } from './blockstore.js'
import { Loader } from './loader.js'
import { Sync } from './sync.js'

// todo remove Listener in 0.7.0
export { Index, Listener, Database, Sync }

export class Fireproof {
  /**
   * @function storage
   * @memberof Fireproof
   * Creates a new Fireproof instance with default storage settings
   * Most apps should use this and not worry about the details.
   * @static
   * @returns {Database|Promise<Database>} - a new Fireproof instance or a promise for remote loaders
   */
  static storage = (name = null, opts = {}) => {
    if (name) {
      opts.name = name
      const existing = Loader.appropriate(name, null, opts.loader).getHeader()
      if (existing) {
        if (typeof existing === 'object' && (typeof (existing.then)) === 'function') {
          return existing.then(existingConfig => {
            console.log('got existing config', existingConfig)
            if (existingConfig) return Fireproof.fromConfig(name, existingConfig, opts)

            const instanceKey = randomBytes(32).toString('hex')
            opts.key = instanceKey // to disable encryption, pass a null key
            return new Database(name, [], opts)
          })
        }
        const existingConfig = existing
        console.log('got existing config', existingConfig)
        return Fireproof.fromConfig(name, existingConfig, opts)
      } else {
        const instanceKey = randomBytes(32).toString('hex')
        opts.key = instanceKey // to disable encryption, pass a null key
        return new Database(name, [], opts)
      }
    } else {
      return new Database(null, [], opts)
    }
  }

  // this is a non-standard configuration, primarily for testing
  // typically you should use storage() instead, and then add a remote as secondary
  // static remote = async (name, opts = {}) => {
  //   // try to get the config, if it doesnt exist, create a new db for it
  //   const existing = await Loader.appropriate(name, null, opts.loader).getHeader()
  // }

  static fromConfig (name, existingConfig, opts = {}) {
    opts.key = existingConfig.key
    const fp = new Database(name, [], opts)
    return Fireproof.fromJSON(existingConfig, fp)
  }

  static fromJSON (json, database) {
    database.hydrate({ car: json.car, indexCar: json.indexCar, clock: json.clock.map(c => parseCID(c)), name: json.name, key: json.key })
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
            db: (db && db.length > 0) ? db.map(c => parseCID(c)) : null
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
    const withBlocks = new Database(database.name)
    withBlocks.blocks = database.blocks
    if (clock) {
      definition.clock = clock.map(c => parseCID(c))
      definition.indexes.forEach(index => {
        index.clock.byId = null
        index.clock.byKey = null
        index.clock.db = null
      })
    }
    const snappedDb = Fireproof.fromJSON(definition, withBlocks)
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
}
