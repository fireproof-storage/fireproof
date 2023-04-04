import DbIndex from './db-index.js'
import Fireproof from './fireproof.js'
import { CID } from 'multiformats'

const parseCID = cid => typeof cid === 'string' ? CID.parse(cid) : cid

export default class Hydrator {
  static fromJSON (json, database) {
    database.hydrate({ clock: json.clock.map(c => parseCID(c)), name: json.name })
    for (const { code, clock: { byId, byKey, db } } of json.indexes) {
      DbIndex.fromJSON(database, {
        clock: {
          byId: byId ? parseCID(byId) : null,
          byKey: byKey ? parseCID(byKey) : null,
          db: db ? db.map(c => parseCID(c)) : null
        },
        code
      })
    }
    return database
  }

  static snapshot (database, clock) {
    const definition = database.toJSON()
    const withBlocks = new Fireproof(database.blocks)
    if (clock) {
      definition.clock = clock.map(c => parseCID(c))
      definition.indexes.forEach(index => {
        index.clock.byId = null
        index.clock.byKey = null
        index.clock.db = null
      })
    }
    const snappedDb = this.fromJSON(definition, withBlocks)
    ;([...database.indexes.values()]).forEach(index => {
      snappedDb.indexes.get(index.mapFnString).mapFn = index.mapFn
    })
    return snappedDb
  }

  static async zoom (database, clock) {
    ;([...database.indexes.values()]).forEach(index => {
      index.indexById = { root: null, cid: null }
      index.indexByKey = { root: null, cid: null }
      index.dbHead = null
    })
    database.clock = clock.map(c => parseCID(c))
    await database.notifyReset()
    return database
  }
}
