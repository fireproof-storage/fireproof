import { readFileSync, createReadStream } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { openDB } from 'idb'
import { join, dirname } from 'path'
import { parse } from '@jsonlines/core'
import cargoQueue from 'async/cargoQueue.js'
import { homedir } from 'os'

const defaultConfig = {
  dataDir: join(homedir(), '.fireproof'),
  headerKeyPrefix: 'fp.'
}

const FORCE_IDB = typeof process !== 'undefined' && !!process.env?.FORCE_IDB

/* global localStorage */

export class Loader {
  constructor (name, keyId, config = defaultConfig) {
    this.name = name
    this.keyId = keyId
    this.config = config
    this.isBrowser = false
    try {
      this.isBrowser = window.localStorage && true
    } catch (e) {}
  }

  withDB = async (dbWorkFun) => {
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
    // console.log('writeCars', this.config.dataDir, this.name, cars.map(c => c.cid.toString()))
    // console.log('writeCars', cars.length)

    if (FORCE_IDB || this.isBrowser) {
      await this.writeCarsIDB(cars)
    } else {
      const writes = []
      for (const { cid, bytes } of cars) {
        const carFilename = join(this.config.dataDir, this.name, `${cid.toString()}.car`)
        // console.log('writeCars', carFilename)
        writes.push(writeSync(carFilename, bytes))
      }
      await Promise.all(writes)
    }
  }

  async writeCarsIDB (cars) {
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
    if (FORCE_IDB || this.isBrowser) {
      return await this.readCarIDB(carCid)
    } else {
      const carFilename = join(this.config.dataDir, this.name, `${carCid.toString()}.car`)
      const got = readFileSync(carFilename)
      // console.log('readCar', carFilename, got.constructor.name)
      return got
    }
  }

  async readCarIDB (carCid) {
    return await this.withDB(async db => {
      const tx = db.transaction(['cars'], 'readonly')
      // console.log('getCarReader', carCid)
      return await tx.objectStore('cars').get(carCid)
    })
  }

  getHeader () {
    if (this.isBrowser) {
      return localStorage.getItem(this.config.headerKeyPrefix + this.name)
    } else {
      return loadSync(this.headerFilename())
      // return null
    }
  }

  async saveHeader (stringValue) {
    // console.log('saveHeader', this.isBrowser)
    if (this.isBrowser) {
      // console.log('localStorage!', this.config.headerKeyPrefix)
      return localStorage.setItem(this.config.headerKeyPrefix + this.name, stringValue)
    } else {
      // console.log('no localStorage', this.config.dataDir, this.name)
      // console.log('saving clock to', this.headerFilename(), stringValue)

      try {
        await writeSync(this.headerFilename(), stringValue)
      } catch (error) {
        console.log('error', error)
      }

      // console.log('saved clock to', this.headerFilename())
    }
  }

  headerFilename () {
    // console.log('headerFilename', this.config.dataDir, this.name)
    return join(this.config.dataDir, this.name, 'header.json')
  }

  async loadData (database, filename) {
    const fullFilePath = join(process.cwd(), filename)
    const readableStream = createReadStream(fullFilePath)
    const parseStream = parse()
    readableStream.pipe(parseStream)

    const saveQueue = cargoQueue(async (tasks, callback) => {
      for (const t of tasks) {
        await database.put(t)
      }
      callback()
    })

    parseStream.on('data', async (data) => {
      saveQueue.push(data)
    })
    let res
    const p = new Promise((resolve, reject) => {
      res = resolve
    })
    saveQueue.drain(async (x) => {
      res()
    })
    return p
  }
}

function loadSync (filename) {
  try {
    return readFileSync(filename, 'utf8').toString()
  } catch (error) {
    // console.log('error', error)
    return null
  }
}

async function writeSync (fullpath, stringValue) {
  await mkdir(dirname(fullpath), { recursive: true })
  // writeFileSync(fullpath, stringValue)
  await writeFile(fullpath, stringValue)
}
