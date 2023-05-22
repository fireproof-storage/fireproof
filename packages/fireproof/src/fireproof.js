// import randomBytes from 'randombytes'
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
    if (!name) {
      return new Database(null, [], opts)
    } else {
      opts.name = name
      const existingLoader = Loader.appropriate(name, opts.storage, { key: null })
      const secondaryLoader = opts.secondary ? Loader.appropriate(name, opts.secondary, { key: null }) : null

      // console.log('storage', name, opts, existingLoader, secondaryLoader)

      const handleHeader = (header, secondary) => {
        // console.log('handleHeader', header, secondary)
        if (header && typeof header === 'object' && typeof header.then === 'function') {
          return header.then(config => {
            if (config) {
              config.name = name
              // if (secondary) { // never a promise, we are scheduling a merge
              //   opts.secondaryHeader = secondary
              // }
              return Fireproof.fromConfig(name, config, secondary, opts)
            } else {
              if (secondary) {
                // console.log('async primary null')
                return Fireproof.fromConfig(name, null, secondary, opts)
              } else {
                return new Database(name, [], opts)
              }
            }
          })
        }
        // if (secondary) { // never a promise, we are scheduling a merge
        //   opts.secondaryHeader = secondary
        // }
        // console.log('sync primary')

        return Fireproof.fromConfig(name, header, secondary, opts)
      }

      const existingHeader = existingLoader.getHeader()
      if (existingHeader) {
        if (!secondaryLoader) {
          // console.log('here NO')
          return handleHeader(existingHeader)
        } else {
          // console.log('here YES')
          const secondaryHeader = secondaryLoader.getHeader()
          // console.log('merge both headers X', secondaryHeader, existingHeader)
          if (secondaryHeader) {
            if (typeof secondaryHeader === 'object' && typeof secondaryHeader.then === 'function') {
              return secondaryHeader.then(secondaryConfig => {
                if (!secondaryConfig) {
                  return handleHeader(existingHeader)
                } else {
                  // console.log('merge both headers B', secondaryConfig, existingHeader)
                  return handleHeader(existingHeader, secondaryConfig)
                }
              })
            }
            // console.log('merge both headers A', secondaryHeader, existingHeader)
            return handleHeader(existingHeader, secondaryHeader)
            // throw new Error('Not implemented: merge both headers A')
          } else {
            return handleHeader(existingHeader)
          }
        }
      } else {
        if (secondaryLoader) {
          // console.log('here YES2')
          const secondaryHeader = secondaryLoader.getHeader()
          if (typeof secondaryHeader === 'object' && typeof secondaryHeader.then === 'function') {
            return secondaryHeader.then(secondaryConfig => {
              if (!secondaryConfig) {
                return new Database(name, [], opts)
              } else {
                // console.log('merge both headers C', secondaryConfig, existingHeader)
                return handleHeader(null, secondaryConfig)
              }
            })
          }
          // console.log('sync primary null')
          return handleHeader(null, secondaryHeader)
        } else {
          // return Fireproof.withKey(name, opts)
          return new Database(name, [], opts)
        }
      }
    }
  }

  // static withKey = (name, opts = {}) => {
  //   const instanceKey = randomBytes(32).toString('hex')
  //   opts.key = instanceKey // to disable encryption, pass a null key
  //   return new Database(name, [], opts)
  // }

  static fromConfig (name, primary, secondary, opts = {}) {
    // console.log('fromConfig', name, primary, secondary, opts)
    // opts.key = existingConfig.key
    // existingConfig.name = name

    let clock = []
    if (primary && primary.clock) {
      clock = clock.concat(primary.clock)
    }
    if (secondary && secondary.clock) {
      clock = clock.concat(secondary.clock)
    }

    const mergedClock = [...new Set(clock)].map(c => parseCID(c))

    opts.storageHeader = primary
    opts.secondaryHeader = secondary

    opts.index = primary ? primary.index : {}

    const fp = new Database(name, mergedClock, opts)
    return Fireproof.fromJSON(primary, secondary, fp)
  }

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
    if (clock) {
      definition.clock = clock.map(c => parseCID(c))
      definition.indexes.forEach(index => {
        index.clock.byId = null
        index.clock.byKey = null
        index.clock.db = null
      })
    }

    const withBlocks = new Database(database.name, definition.clock.map(c => parseCID(c)))
    withBlocks.blocks = database.blocks

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
