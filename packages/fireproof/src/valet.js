import { CarReader } from '@ipld/car'
import { CID } from 'multiformats/cid'
import { openDB } from 'idb'
import cargoQueue from 'async/cargoQueue.js'

// const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
// let storageSupported = false
// try {
//   storageSupported = window.localStorage && true
// } catch (e) {}
// const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// todo create an encrypted valet
export default class Valet {
  idb = null
  #uploadQueue = null
  #alreadyEnqueued = new Set()

  /**
   * Function installed by the database to upload car files
   * @type {null|function(string, Uint8Array):Promise<void>}
   */
  uploadFunction = null

  constructor (name = 'default') {
    this.name = name
    this.#uploadQueue = cargoQueue(async (tasks, callback) => {
      console.log(
        'queue worker',
        tasks.length,
        tasks.reduce((acc, t) => acc + t.value.length, 0)
      )
      if (this.uploadFunction) {
        // todo we can coalesce these into a single car file
        return await this.withDB(async (db) => {
          for (const task of tasks) {
            await this.uploadFunction(task.carCid, task.value)
            // update the indexedb to mark this car as no longer pending
            const carMeta = await db.get('cidToCar', task.carCid)
            delete carMeta.pending
            await db.put('cidToCar', carMeta)
          }
        })
      }
      callback()
    })

    this.#uploadQueue.drain(async () => {
      return await this.withDB(async (db) => {
        const carKeys = (await db.getAllFromIndex('cidToCar', 'pending')).map((c) => c.car)
        for (const carKey of carKeys) {
          await this.uploadFunction(carKey, await db.get('cars', carKey))
          const carMeta = await db.get('cidToCar', carKey)
          delete carMeta.pending
          await db.put('cidToCar', carMeta)
        }
      })
    })
  }

  withDB = async (dbWorkFun) => {
    if (!this.idb) {
      this.idb = await openDB(`fp.${this.name}.valet`, 2, {
        upgrade (db, oldVersion, newVersion, transaction) {
          if (oldVersion < 1) {
            db.createObjectStore('cars') // todo use database name
            const cidToCar = db.createObjectStore('cidToCar', { keyPath: 'car' })
            cidToCar.createIndex('cids', 'cids', { multiEntry: true })
          }
          if (oldVersion < 2) {
            const cidToCar = transaction.objectStore('cidToCar')
            cidToCar.createIndex('pending', 'pending')
          }
        }
      })
    }
    return await dbWorkFun(this.idb)
  }

  /**
   *
   * @param {string} carCid
   * @param {*} value
   */
  async parkCar (carCid, value, cids) {
    await this.withDB(async (db) => {
      const tx = db.transaction(['cars', 'cidToCar'], 'readwrite')
      await tx.objectStore('cars').put(value, carCid)
      await tx.objectStore('cidToCar').put({ pending: 'y', car: carCid, cids: Array.from(cids) })
      return await tx.done
    })

    // upload to web3.storage if we have credentials
    if (this.uploadFunction) {
      if (this.#alreadyEnqueued.has(carCid)) {
        // console.log('already enqueued', carCid)
        return
      }
      // don't await this, it will be done in the queue
      // console.log('add to queue', carCid, value.length)
      this.#uploadQueue.push({ carCid, value })
      this.#alreadyEnqueued.add(carCid)
    } else {
      // console.log('no upload function', carCid, value.length, this.uploadFunction)
    }
  }

  remoteBlockFunction = null

  async getBlock (dataCID) {
    return await this.withDB(async (db) => {
      const tx = db.transaction(['cars', 'cidToCar'], 'readonly')
      const indexResp = await tx.objectStore('cidToCar').index('cids').get(dataCID)
      const carCid = indexResp?.car
      if (!carCid) {
        throw new Error('Missing block: ' + dataCID)
      }
      const carBytes = await tx.objectStore('cars').get(carCid)
      const reader = await CarReader.fromBytes(carBytes)
      const gotBlock = await reader.get(CID.parse(dataCID))
      if (gotBlock) {
        return gotBlock.bytes
      }
    })
  }
}
