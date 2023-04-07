import { CarReader } from '@ipld/car'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import * as CBW from '@ipld/car/buffer-writer'
import * as raw from 'multiformats/codecs/raw'
import * as Block from 'multiformats/block'
import * as dagcbor from '@ipld/dag-cbor'
import { openDB } from 'idb'
import cargoQueue from 'async/cargoQueue.js'
import { bf } from 'prolly-trees/utils'
import { nocache as cache } from 'prolly-trees/cache'
import { encrypt, decrypt } from './crypto.js'
import { Buffer } from 'buffer'
import * as codec from 'encrypted-block'
const chunker = bf(3)

const KEY_MATERIAL =
  typeof process !== 'undefined' ? process.env.KEY_MATERIAL : import.meta && import.meta.env.VITE_KEY_MATERIAL
console.log('KEY_MATERIAL', KEY_MATERIAL)

export default class Valet {
  idb = null
  #uploadQueue = null
  #alreadyEnqueued = new Set()

  /**
   * Function installed by the database to upload car files
   * @type {null|function(string, Uint8Array):Promise<void>}
   */
  uploadFunction = null
  #encryptionActive = false

  constructor (name = 'default') {
    this.name = name
    if (KEY_MATERIAL) {
      this.#encryptionActive = true
    }
    this.#uploadQueue = cargoQueue(async (tasks, callback) => {
      console.log(
        'queue worker',
        tasks.length,
        tasks.reduce((acc, t) => acc + t.value.length, 0)
      )
      if (this.uploadFunction) {
        // todo we can coalesce these into a single car file
        return await this.withDB(async db => {
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
      return await this.withDB(async db => {
        const carKeys = (await db.getAllFromIndex('cidToCar', 'pending')).map(c => c.car)
        for (const carKey of carKeys) {
          await this.uploadFunction(carKey, await db.get('cars', carKey))
          const carMeta = await db.get('cidToCar', carKey)
          delete carMeta.pending
          await db.put('cidToCar', carMeta)
        }
      })
    })
  }

  /**
   * Group the blocks into a car and write it to the valet.
   * @param {InnerBlockstore} innerBlockstore
   * @param {Set<string>} cids
   * @returns {Promise<void>}
   * @memberof Valet
   */
  async writeTransaction (innerBlockstore, cids) {
    if (innerBlockstore.lastCid) {
      if (this.#encryptionActive) {
        console.log('encrypting car', innerBlockstore.label)
        const newCar = await blocksToEncryptedCarBlock(innerBlockstore.lastCid, innerBlockstore)
        await this.parkCar(newCar.cid.toString(), newCar.bytes, cids)
      } else {
        const newCar = await blocksToCarBlock(innerBlockstore.lastCid, innerBlockstore)
        await this.parkCar(newCar.cid.toString(), newCar.bytes, cids)
      }
    }
  }

  withDB = async dbWorkFun => {
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
    await this.withDB(async db => {
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
    return await this.withDB(async db => {
      const tx = db.transaction(['cars', 'cidToCar'], 'readonly')
      const indexResp = await tx.objectStore('cidToCar').index('cids').get(dataCID)
      const carCid = indexResp?.car
      if (!carCid) {
        throw new Error('Missing block: ' + dataCID)
      }
      const carBytes = await tx.objectStore('cars').get(carCid)
      const reader = await CarReader.fromBytes(carBytes)
      if (this.#encryptionActive) {
        const roots = await reader.getRoots()
        const readerGetWithCodec = async cid => {
          const got = await reader.get(cid)
          // console.log('got.', cid.toString())
          let useCodec = codec
          if (cid.toString().indexOf('bafy') === 0) {
            useCodec = dagcbor
          }
          const decoded = await Block.decode({
            ...got,
            codec: useCodec,
            hasher: sha256
          })
          // console.log('decoded', decoded.value)

          return decoded
        }
        const { blocks } = await blocksFromEncryptedCarBlock(roots[0], readerGetWithCodec)
        const block = blocks.find(b => b.cid.toString() === dataCID)
        if (block) {
          return block.bytes
        }
      } else {
        const gotBlock = await reader.get(CID.parse(dataCID))
        if (gotBlock) {
          return gotBlock.bytes
        }
      }
    })
  }
}

const blocksToCarBlock = async (lastCid, blocks) => {
  let size = 0
  const headerSize = CBW.headerLength({ roots: [lastCid] })
  size += headerSize
  if (!Array.isArray(blocks)) {
    blocks = Array.from(blocks.entries())
  }
  for (const { cid, bytes } of blocks) {
    size += CBW.blockLength({ cid, bytes })
  }
  const buffer = new Uint8Array(size)
  const writer = await CBW.createWriter(buffer, { headerSize })

  writer.addRoot(lastCid)

  for (const { cid, bytes } of blocks) {
    writer.write({ cid, bytes })
  }
  await writer.close()
  return await Block.encode({ value: writer.bytes, hasher: sha256, codec: raw })
}

const blocksToEncryptedCarBlock = async (lastCid, blocks) => {
  const encryptionKey = Buffer.from(KEY_MATERIAL, 'hex')
  const encryptedBlocks = []
  const theCids = []
  for (const { cid } of blocks.entries()) {
    theCids.push(cid.toString())
  }

  let last
  for await (const block of encrypt({
    cids: theCids,
    get: async cid => blocks.get(cid), // maybe we can just use blocks.get
    key: encryptionKey,
    hasher: sha256,
    chunker,
    codec: dagcbor, // should be crypto?
    root: lastCid
  })) {
    encryptedBlocks.push(block)
    last = block
  }
  const encryptedCar = await blocksToCarBlock(last.cid, encryptedBlocks)
  return encryptedCar
}
// { root, get, key, cache, chunker, hasher }

const memoizeDecryptedCarBlocks = new Map()
const blocksFromEncryptedCarBlock = async (cid, get) => {
  if (memoizeDecryptedCarBlocks.has(cid.toString())) {
    return memoizeDecryptedCarBlocks.get(cid.toString())
  } else {
    const blocksPromise = (async () => {
      const decryptionKey = Buffer.from(KEY_MATERIAL, 'hex')
      const cids = new Set()
      const decryptedBlocks = []
      for await (const block of decrypt({
        root: cid,
        get,
        key: decryptionKey,
        chunker,
        hasher: sha256,
        cache,
        codec: dagcbor
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
