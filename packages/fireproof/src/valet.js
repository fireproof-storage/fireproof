
import { Loader } from './loader.js'

export class Valet {
  idb = null
  name = null
  uploadQueue = null
  alreadyEnqueued = new Set()

  instanceId = Math.random().toString(36).slice(2)

  constructor (name = 'default', config = {}) {
    this.name = name
    // console.log('new Valet', name, config.primary)
    this.primary = Loader.appropriate(name, config.primary)
    this.secondary = config.secondary ? Loader.appropriate(name, config.secondary) : null
    // set up a promise listener that applies all the headers to the clock
    // when they resolve
    const readyP = [this.primary.ready]
    if (this.secondary) readyP.push(this.secondary.ready)

    this.ready = Promise.all(readyP).then((blocksReady) => {
      // console.log('blocksReady valet', this.name, blocksReady)
      return blocksReady
    })
  }

  async saveHeader (header) {
    // each storage needs to add its own carCidMapCarCid to the header
    if (this.secondary) { this.secondary.saveHeader(header) } // todo: await?
    return await this.primary.saveHeader(header)
  }

  async compact (clock) {
    await this.primary.compact(clock)
    if (this.secondary) await this.secondary.compact(clock)
  }

  /**
   * Group the blocks into a car and write it to the valet.
   * @param {import('./blockstore.js').InnerBlockstore} innerBlockstore
   * @param {Set<string>} cids
   * @returns {Promise<void>}
   * @memberof Valet
   */
  async writeTransaction (innerBlockstore, cids) {
    if (innerBlockstore.lastCid) {
      await this.primary.parkCar(innerBlockstore, cids)
      if (this.secondary) await this.secondary.parkCar(innerBlockstore, cids)
    } else {
      throw new Error('missing lastCid for car header')
    }
  }

  /**
   * Iterate over all blocks in the store.
   *
   * @yields {{cid: string, value: Uint8Array}}
   * @returns {AsyncGenerator<any, any, any>}
   */
  async * cids () {
    // console.log('valet cids')
    // todo use cidMap
    // while (cursor) {
    // yield { cid: cursor.key, car: cursor.value.car }
    // cursor = await cursor.continue()
    // }
  }

  remoteBlockFunction = null

  async getValetBlock (dataCID) {
    // console.log('getValetBlock primary', dataCID)
    try {
      const { block } = await this.primary.getLoaderBlock(dataCID)
      return block
    } catch (e) {
      // console.log('getValetBlock error', e)
      if (this.secondary) {
        console.log('getValetBlock secondary', dataCID)
        try {
          const { block, reader } = await this.secondary.getLoaderBlock(dataCID)
          const cids = new Set()
          for await (const { cid } of reader.entries()) {
            // console.log(cid, bytes)
            cids.add(cid.toString())
          }
          reader.get = reader.gat // some consumers prefer get
          // console.log('replicating', reader.root)
          reader.lastCid = reader.root.cid
          await this.primary.parkCar(reader, [...cids])
          return block
        } catch (e) {
          // console.log('getValetBlock secondary error', e)
        }
      }
    }
  }
}
