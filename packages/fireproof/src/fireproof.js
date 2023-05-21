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
    if (!name) {
      return new Database(null, [], opts)
    } else {
      opts.name = name
      const existingLoader = Loader.appropriate(name, null, opts.loader)
      const secondaryLoader = opts.secondary ? Loader.appropriate(name, null, opts.secondary) : null

      const handleHeader = (header, secondary) => {
        if (secondary) { // never a promise, we are scheduling a merge
          opts.mergeHeader = secondary
        }
        if (typeof header === 'object' && typeof header.then === 'function') {
          return header.then(config => {
            if (config) {
              config.name = name
              return Fireproof.fromConfig(name, config, opts)
            } else {
              return Fireproof.withKey(name, opts)
            }
          })
        }
        return Fireproof.fromConfig(name, header, opts)
      }

      const existingHeader = existingLoader.getHeader()
      if (existingHeader) {
        if (!secondaryLoader) {
          return handleHeader(existingHeader)
        } else {
          const secondaryHeader = secondaryLoader.getHeader()
          if (secondaryHeader) {
            if (typeof secondaryHeader === 'object' && typeof secondaryHeader.then === 'function') {
              return secondaryHeader.then(secondaryConfig => {
                if (!secondaryConfig) {
                  return handleHeader(existingHeader)
                } else {
                  // console.log('merge both headers B', secondaryConfig, existingHeader)

                  // load both cid maps (car) and merge them to a new car
                  // new clock is the unique set of clocks from both (plus whatever new might have happed during the merge)
                  // this will be scheduled to run in the background, but it will stop writes during the merge (after the remote car is downloaded)
                  // for now return the local one
                  // mergeHeaders(existingHeader, secondaryConfig)
                  return handleHeader(existingHeader, secondaryConfig)
                  // {
                  //   clock: [ 'bafyreicdyblqzce7ptfmuvvmn4ixmzzuwtcw4fuattdlnkx7qy66zzujym' ],
                  //   name: 'dataset-fptest',
                  //   key: '1581d5feb6998d0f22da9500a1ba29bfdae09ab0c0027a71e4145236498640fa',
                  //   car: 'bafkreif4umv6z5efeqaw6g42ga3u65hueswharou3uxr46hrw3lfgwuaqa',
                  //   indexes: []
                  // } {
                  //   clock: [ 'bafyreigv2elguift3rukcaingzipkcsruy5mtgxvusixtfphwo35cbb574' ],
                  //   name: 'fptest-empty-db-todos',
                  //   key: '1581d5feb6998d0f22da9500a1ba29bfdae09ab0c0027a71e4145236498640fa',
                  //   car: 'bafkreidtwa4qp24mgmqpltwv5ek2m3l3d2vnt33oqdoluwwtm54a76rhju',
                  //   indexes: []
                  // }
                }
              })
            }
            // console.log('merge both headers A', secondaryConfig, existingHeader)
            return handleHeader(existingHeader, secondaryHeader)
            // throw new Error('Not implemented: merge both headers A')
          } else {
            return handleHeader(existingHeader)
          }
        }
      } else {
        if (secondaryLoader) {
          return handleHeader(secondaryLoader.getHeader())
        } else {
          return Fireproof.withKey(name, opts)
        }
      }
    }
  }

  static withKey = (name, opts = {}) => {
    const instanceKey = randomBytes(32).toString('hex')
    opts.key = instanceKey // to disable encryption, pass a null key
    return new Database(name, [], opts)
  }

  static fromConfig (name, existingConfig, opts = {}) {
    opts.key = existingConfig.key
    existingConfig.name = name
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
