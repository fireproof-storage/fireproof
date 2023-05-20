import { openDB } from 'idb'

const defaultConfig = {
  headerKeyPrefix: 'fp.'
}

/* global localStorage */

export class Browser {
  constructor (name, keyId, config = {}) {
    this.isBrowser = false
    try {
      this.isBrowser = window.localStorage && true
    } catch (e) {}
    this.name = name
    this.keyId = keyId
    this.config = Object.assign({}, defaultConfig, config)
  }

  withDB = async dbWorkFun => {
    if (!this.idb) {
      this.idb = await openDB(`fp.${this.keyId}.${this.name}.valet`, 3, {
        upgrade (db, oldVersion, newVersion, transaction) {
          if (oldVersion < 1) {
            db.createObjectStore('cars')
          }
        }
      })
    }
    return await dbWorkFun(this.idb)
  }

  async writeCars (cars) {
    return await this.withDB(async db => {
      const tx = db.transaction(['cars'], 'readwrite')
      for (const { cid, bytes, replaces } of cars) {
        await tx.objectStore('cars').put(bytes, cid.toString())
        // todo remove old maps
        if (replaces) {
          await tx.objectStore('cars').delete(replaces.toString())
        }
      }
      return await tx.done
    })
  }

  async readCar (carCid) {
    return await this.withDB(async db => {
      const tx = db.transaction(['cars'], 'readonly')
      // console.log('getCarReader', carCid)
      return await tx.objectStore('cars').get(carCid)
    })
  }

  getHeader () {
    return this.isBrowser && localStorage.getItem(this.config.headerKeyPrefix + this.name)
  }

  async saveHeader (stringValue) {
    return this.isBrowser && localStorage.setItem(this.config.headerKeyPrefix + this.name, stringValue)
  }
}
