import { writeFileSync, readFileSync, createReadStream } from 'fs'
import { mkdir } from 'node:fs/promises'
import { openDB } from 'idb'
import { join, dirname } from 'path'
import { parse } from '@jsonlines/core'
import cargoQueue from 'async/cargoQueue.js'
import { homedir } from 'os'

const defaultConfig = {
  dataDir: join(homedir(), '.fireproof'),
  headerKeyPrefix: 'fp.'
}

/* global localStorage */

export class Loader {
  constructor (dbName, config = defaultConfig) {
    this.dbName = dbName
    this.config = config
    this.isBrowser = false
    try {
      this.isBrowser = window.localStorage && true
    } catch (e) {}
  }

  withDB = async (name, keyId, dbWorkFun) => {
    if (!this.idb) {
      this.idb = await openDB(`fp.${keyId}.${name}.valet`, 3, {
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
    // console.log('writeCars', this.config.dataDir, this.dbName, cars.map(c => c.cid.toString()))
    if (this.isBrowser) {
      return await this.writeCarsIDB(cars)
    } else {
      for (const { cid, bytes } of cars) {
        const carFilename = join(this.config.dataDir, this.dbName, `${cid.toString()}.car`)
        // console.log('writeCars', carFilename)
        await writeSync(carFilename, bytes)
      }
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
    if (this.isBrowser) {
      return await this.readCarIDB(carCid)
    } else {
      const carFilename = join(this.config.dataDir, this.dbName, `${carCid.toString()}.car`)
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
      return localStorage.getItem(this.config.headerKeyPrefix + this.dbName)
    } else {
      return loadSync(this.headerFilename())
    }
  }

  async saveHeader (stringValue) {
    // console.log('saveHeader', this.isBrowser)
    if (this.isBrowser) {
      // console.log('localStorage!', this.config.headerKeyPrefix)
      return localStorage.setItem(this.config.headerKeyPrefix + this.dbName, stringValue)
    } else {
      // console.log('no localStorage', this.config.dataDir, this.dbName)
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
    // console.log('headerFilename', this.config.dataDir, this.dbName)
    return join(this.config.dataDir, this.dbName, 'header.json')
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
  writeFileSync(fullpath, stringValue)
}
