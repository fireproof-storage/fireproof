import { CarReader } from '@ipld/car'
import { CID } from 'multiformats/cid'

export default class Valet {
  #cars = new Map() // cars by cid

  #cidToCar = new Map() // cid to car

  /**
     *
     * @param {string} carCid
     * @param {*} value
     */
  parkCar (carCid, value, cids) {
    this.#cars.set(carCid, value)
    for (const cid of cids) {
      this.#cidToCar.set(cid, carCid)
    }
  }

  getBlock (dataCID) {
    return this.#valetGet(dataCID)
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
