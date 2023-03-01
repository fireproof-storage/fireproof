/* eslint-disable no-unused-vars */
import { CarReader } from '@ipld/car'
import { CID } from 'multiformats/cid'
import { openDB, deleteDB, wrap, unwrap } from 'idb'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export default class Valet {
  #cars = new Map() // cars by cid
  #cidToCar = new Map() // cid to car

  #db = null

  withDB = async (dbWorkFun) => {
    if (!this.#db) {
      this.#db = await openDB('valet', 1, {
        upgrade (db) {
          const cars = db.createObjectStore('cars')
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
  }

  async getBlock (dataCID) {
    // return await this.#valetGet(dataCID)
    const MEMcarCid = this.#cidToCar.get(dataCID)

    // return await this.withDB(async (db) => {
    //   const tx = db.transaction(['cars', 'cidToCar'], 'readonly')
    //   const carBytes = await tx.objectStore('cars').get(MEMcarCid)
    //   const reader = await CarReader.fromBytes(carBytes)
    //   const gotBlock = await reader.get(CID.parse(dataCID))
    //   if (gotBlock) {
    //     return gotBlock.bytes
    //   }
    // })

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
