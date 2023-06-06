import { Database, parseCID } from './database.js'
import { DbIndex as Index } from './db-index.js'
import { Sync } from './sync.js'

export { Index, Database, Sync }

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
    return new Database(name, opts)
  }

  // static fromConfig (name, primary, secondary, opts = {}) {
  //   console.log('fromConfig', name, primary, secondary, opts)
  //   let clock = []
  //   if (primary && primary.clock) {
  //     clock = clock.concat(primary.clock)
  //   }
  //   if (secondary && secondary.clock) {
  //     clock = clock.concat(secondary.clock)
  //   }

  //   const mergedClock = [...new Set(clock)].map(c => parseCID(c))

  //   opts.primaryHeader = primary
  //   opts.secondaryHeader = secondary

  //   opts.index = primary ? primary.index : {}

  //   const fp = new Database(name, mergedClock, opts)
  //   return Fireproof.fromJSON(primary, secondary, fp)
  // }

  static fromJSON (primary, secondary, database) {
    const json = primary && primary.indexes ? primary : secondary
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
            db: db && db.length > 0 ? db.map(c => parseCID(c)) : null
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
    if (clock) {
      definition.clock = clock.map(c => parseCID(c))
      definition.indexes.forEach(index => {
        index.clock.byId = null
        index.clock.byKey = null
        index.clock.db = null
      })
    }

    const withBlocks = new Database(database.name)
    withBlocks.blocks = database.blocks
    withBlocks.ready.then(() => {
      withBlocks.clock = definition.clock.map(c => parseCID(c))
    })

    const snappedDb = Fireproof.fromJSON(definition, null, withBlocks)
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
