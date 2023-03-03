import { CarReader } from '@ipld/car'
import { CID } from 'multiformats/cid'
import { openDB } from 'idb'
import cargoQueue from 'async/cargoQueue.js'

// const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let storageSupported = false
try {
  storageSupported = (window.localStorage && true)
} catch (e) { }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export default class Valet {
  #cars = new Map() // cars by cid
  #cidToCar = new Map() // cid to car
  #db = null
  #uploadQueue = null
  #alreadyEnqueued = new Set()

  /**
   * Function installed by the database to upload car files
   * @type {null|function(string, Uint8Array):Promise<void>}
   */
  uploadFunction = null

  constructor () {
    this.#uploadQueue = cargoQueue(async (tasks, callback) => {
      console.log('queue worker', tasks.length, tasks.reduce((acc, t) => acc + t.value.length, 0))
      if (this.uploadFunction) {
        for (const task of tasks) {
          sleep(100)
          console.log('could upload', task.carCid, task.value.length)
          await this.uploadFunction(task.carCid, task.value)
        }
      }
      callback()
    })
    this.#uploadQueue.drain(function () {
      console.log('all items have been processed')
    })
  }

  withDB = async (dbWorkFun) => {
    if (!storageSupported) return
    if (!this.#db) {
      this.#db = await openDB('valet', 1, {
        upgrade (db) {
          db.createObjectStore('cars') // todo use database name
          const cidToCar = db.createObjectStore('cidToCar', { keyPath: 'car' })
          cidToCar.createIndex('cids', 'cids', { multiEntry: true })
        }
      })
    }
    return await dbWorkFun(this.#db)
  }

  /**
   *
   * @param {string} carCid
   * @param {*} value
   */
  async parkCar (carCid, value, cids) {
    this.#cars.set(carCid, value)
    for (const cid of cids) {
      this.#cidToCar.set(cid, carCid)
    }

    await this.withDB(async (db) => {
      const tx = db.transaction(['cars', 'cidToCar'], 'readwrite')
      await tx.objectStore('cars').put(value, carCid)
      await tx.objectStore('cidToCar').put({ car: carCid, cids: Array.from(cids) })
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

  async getBlock (dataCID) {
    return await this.withDB(async (db) => {
      const tx = db.transaction(['cars', 'cidToCar'], 'readonly')
      const indexResp = await tx.objectStore('cidToCar').index('cids').get(dataCID)
      const carCid = indexResp?.car
      if (!carCid) {
        return
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

export class MemoryValet {
  #cars = new Map() // cars by cid
  #cidToCar = new Map() // cid to car

  /**
   *
   * @param {string} carCid
   * @param {*} value
   */
  async parkCar (carCid, value, cids) {
    this.#cars.set(carCid, value)
    for (const cid of cids) {
      this.#cidToCar.set(cid, carCid)
    }
  }

  async getBlock (dataCID) {
    return await this.#valetGet(dataCID)
  }

  /**
   * Internal function to load blocks from persistent storage.
   * Currently it just searches all the cars for the block, but in the future
   * we need to index the block CIDs to the cars, and reference that to find the block.
   * This index will also allow us to use accelerator links for the gateway when needed.
   * It can itself be a prolly tree...
   * @param {string} cid
   * @returns {Promise<Uint8Array|undefined>}
   */
  #valetGet = async (cid) => {
    const carCid = this.#cidToCar.get(cid)
    if (carCid) {
      const carBytes = this.#cars.get(carCid)
      const reader = await CarReader.fromBytes(carBytes)
      const gotBlock = await reader.get(CID.parse(cid))
      if (gotBlock) {
        return gotBlock.bytes
      }
    }
  }
}
