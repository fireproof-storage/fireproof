import { sha256 } from 'multiformats/hashes/sha2'
import * as CBW from '@ipld/car/buffer-writer'
import * as raw from 'multiformats/codecs/raw'
import * as Block from 'multiformats/block'
import cargoQueue from 'async/cargoQueue.js'
import { Loader } from './loader.js'

// @ts-ignore

// @ts-ignore
import { bf } from 'prolly-trees/utils'
// @ts-ignore
import { nocache as cache } from 'prolly-trees/cache'
// import { makeGetBlock } from './prolly.js'
import { encrypt, decrypt } from './crypto.js'
import { Buffer } from 'buffer'
// @ts-ignore
// import * as codec from 'encrypted-block'

const chunker = bf(30)

export class Valet {
  idb = null
  name = null
  uploadQueue = null
  alreadyEnqueued = new Set()

  instanceId = Math.random().toString(36).slice(2)

  /**
   * Function installed by the database to upload car files
   * @type {null|function(string, Uint8Array):Promise<void>}
   */
  uploadFunction = null

  constructor (name = 'default', config = {}) {
    this.name = name
    // this.setKeyMaterial(config.key)
    const loaderConfig = Object.assign({}, { key: config.key }, config.loader)
    this.loader = Loader.appropriate(name, loaderConfig)
    // this.secondaryHeader = config.secondaryHeader
    // this.secondary = config.secondary ? Loader.appropriate(name, config.secondary) : null
    this.uploadQueue = cargoQueue(async (tasks, callback) => {
      // console.log(
      //   'queue worker',
      //   tasks.length,
      //   tasks.reduce((acc, t) => acc + t.value.length, 0)
      // )
      if (this.uploadFunction) {
        // todo we can coalesce these into a single car file
        // todo remove idb usage here
        for (const task of tasks) {
          await this.uploadFunction(task.carCid, task.value)
          // todo update syncCidMap to say this has been synced
          // const carMeta = await db.get('cidToCar', task.carCid)
          // delete carMeta.pending
          // await db.put('cidToCar', carMeta)
        }
      }
      callback()
    })

    this.uploadQueue.drain(async () => {
      // todo read syncCidMap and sync any that are still unsynced
      //   return await this.withDB(async db => {
      //     const carKeys = (await db.getAllFromIndex('cidToCar', 'pending')).map(c => c.car)
      //     for (const carKey of carKeys) {
      //       await this.uploadFunction(carKey, await db.get('cars', carKey))
      //       const carMeta = await db.get('cidToCar', carKey)
      //       delete carMeta.pending
      //       await db.put('cidToCar', carMeta)
      //     }
      //   })
    })
  }

  async saveHeader (header) {
    // this.secondary?.saveHeader(header)
    return await this.loader.saveHeader(header)
  }

  getKeyMaterial () {
    return this.loader.keyMaterial
  }

  setKeyMaterial (km) {
    this.loader.setKeyMaterial(km)
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
      if (this.loader.keyMaterial) { // encrpyt once per key material
        // console.log('encrypting car', innerBlockstore.label)
        // should we pass cids in instead of iterating frin innerBlockstore?
        const newCar = await blocksToEncryptedCarBlock(innerBlockstore.lastCid, innerBlockstore, this.loader.keyMaterial)
        await this.parkCar(newCar.cid.toString(), newCar.bytes, cids)
      } else {
        const newCar = await blocksToCarBlock(innerBlockstore.lastCid, innerBlockstore)
        await this.parkCar(newCar.cid.toString(), newCar.bytes, cids)
      }
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

  hydrateRootCarCid (cid) {
    this.didHydrate = true
    this.valetRootCarCid = cid
    this.loader.valetRootCarCid = cid
    this.loader.valetCarCidMap = null
    // this.valetRoot = null
    // this.valetRootCid = null
  }

  /**
   *
   * @param {string} carCid
   * @param {*} value
   */
  async parkCar (carCid, value, cids) {
    // const callId = Math.random().toString(36).substring(7)
    // console.log('parkCar', this.instanceId, this.name, carCid, cids)
    const newValetCidCar = await this.loader.updateCarCidMap(carCid, cids)

    // console.log('newValetCidCar', this.name, Math.floor(newValetCidCar.bytes.length / 1024))
    // console.log('writeCars', carCid.toString(), newValetCidCar.cid.toString())
    const carList = [
      {
        cid: carCid,
        bytes: value,
        replaces: null
      },
      {
        cid: newValetCidCar.cid,
        bytes: newValetCidCar.bytes,
        replaces: null
        // replaces: this.valetRootCarCid // todo
      }
    ]

    await this.loader.writeCars(carList)
    // this.secondary?.writeCars(carList)

    this.valetRootCarCid = newValetCidCar.cid // goes to header (should be per loader)

    // console.log('wroteCars', callId, carCid.toString(), newValetCidCar.cid.toString())

    // console.log('parked car', carCid, value.length, Array.from(cids))
    // upload to web3.storage if we have credentials
    if (this.uploadFunction) {
      if (this.alreadyEnqueued.has(carCid)) {
        // console.log('already enqueued', carCid)
        return
      }
      // don't await this, it will be done in the queue
      // console.log('add to queue', carCid, value.length)
      this.uploadQueue.push({ carCid, value })
      this.alreadyEnqueued.add(carCid)
    } else {
      // console.log('no upload function', carCid, value.length, this.uploadFunction)
    }
  }

  remoteBlockFunction = null

  async getValetBlock (dataCID) {
    // console.log('get valet block', dataCID)
    return this.loader.getLoaderBlock(dataCID)
  }
}

export const blocksToCarBlock = async (rootCids, blocks) => {
  // console.log('blocksToCarBlock', rootCids, blocks.constructor.name)
  let size = 0
  if (!Array.isArray(rootCids)) {
    rootCids = [rootCids]
  }
  const headerSize = CBW.headerLength({ roots: rootCids })
  size += headerSize
  if (!Array.isArray(blocks)) {
    blocks = Array.from(blocks.entries())
  }
  for (const { cid, bytes } of blocks) {
    // console.log(cid, bytes)
    size += CBW.blockLength({ cid, bytes })
  }
  const buffer = new Uint8Array(size)
  const writer = await CBW.createWriter(buffer, { headerSize })

  for (const cid of rootCids) {
    writer.addRoot(cid)
  }

  for (const { cid, bytes } of blocks) {
    writer.write({ cid, bytes })
  }
  await writer.close()
  return await Block.encode({ value: writer.bytes, hasher: sha256, codec: raw })
}

export const blocksToEncryptedCarBlock = async (innerBlockStoreClockRootCid, blocks, keyMaterial) => {
  const encryptionKey = Buffer.from(keyMaterial, 'hex')
  const encryptedBlocks = []
  const theCids = []
  for (const { cid } of blocks.entries()) {
    theCids.push(cid.toString())
  }
  // console.log('encrypting', theCids.length, 'blocks', theCids.includes(innerBlockStoreClockRootCid.toString()))
  // console.log('cids', theCids, innerBlockStoreClockRootCid.toString())
  let last
  for await (const block of encrypt({
    cids: theCids,
    get: async cid => blocks.get(cid), // maybe we can just use blocks.get
    key: encryptionKey,
    hasher: sha256,
    chunker,
    cache,
    // codec: dagcbor, // should be crypto?
    root: innerBlockStoreClockRootCid
  })) {
    encryptedBlocks.push(block)
    last = block
  }
  // console.log('last', last.cid.toString(), 'for clock', innerBlockStoreClockRootCid.toString())
  const encryptedCar = await blocksToCarBlock(last.cid, encryptedBlocks)
  return encryptedCar
}
// { root, get, key, cache, chunker, hasher }

const memoizeDecryptedCarBlocks = new Map()
export const blocksFromEncryptedCarBlock = async (cid, get, keyMaterial) => {
  if (memoizeDecryptedCarBlocks.has(cid.toString())) {
    return memoizeDecryptedCarBlocks.get(cid.toString())
  } else {
    const blocksPromise = (async () => {
      const decryptionKey = Buffer.from(keyMaterial, 'hex')
      // console.log('decrypting', keyMaterial, cid.toString())
      const cids = new Set()
      const decryptedBlocks = []
      for await (const block of decrypt({
        root: cid,
        get,
        key: decryptionKey,
        chunker,
        hasher: sha256,
        cache
        // codec: dagcbor
      })) {
        decryptedBlocks.push(block)
        cids.add(block.cid.toString())
      }
      return { blocks: decryptedBlocks, cids }
    })()
    memoizeDecryptedCarBlocks.set(cid.toString(), blocksPromise)
    return blocksPromise
  }
}
