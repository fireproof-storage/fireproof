import { CarReader } from '@ipld/car'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import * as CBW from '@ipld/car/buffer-writer'
import * as raw from 'multiformats/codecs/raw'
import * as Block from 'multiformats/block'
import * as dagcbor from '@ipld/dag-cbor'
import { openDB } from 'idb'
import cargoQueue from 'async/cargoQueue.js'
// @ts-ignore
import { bf } from 'prolly-trees/utils'
// @ts-ignore
import { nocache as cache } from 'prolly-trees/cache'
import { encrypt, decrypt } from './crypto.js'
import { Buffer } from 'buffer'
// @ts-ignore
import * as codec from 'encrypted-block'
import { rawSha1 as sha1sync } from './sha1.js'
const chunker = bf(30)

const NO_ENCRYPT = typeof process !== 'undefined' && !!process.env?.NO_ENCRYPT
// ? process.env.NO_ENCRYPT : import.meta && import.meta.env.VITE_NO_ENCRYPT

export class Valet {
  idb = null
  name = null
  uploadQueue = null
  alreadyEnqueued = new Set()
  keyMaterial = null
  keyId = 'null'

  /**
   * Function installed by the database to upload car files
   * @type {null|function(string, Uint8Array):Promise<void>}
   */
  uploadFunction = null

  constructor (name = 'default', keyMaterial) {
    this.name = name
    this.setKeyMaterial(keyMaterial)
    this.uploadQueue = cargoQueue(async (tasks, callback) => {
      // console.log(
      //   'queue worker',
      //   tasks.length,
      //   tasks.reduce((acc, t) => acc + t.value.length, 0)
      // )
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

    this.uploadQueue.drain(async () => {
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

  getKeyMaterial () {
    return this.keyMaterial
  }

  setKeyMaterial (km) {
    if (km && !NO_ENCRYPT) {
      const hex = Uint8Array.from(Buffer.from(km, 'hex'))
      this.keyMaterial = km
      const hash = sha1sync(hex)
      this.keyId = Buffer.from(hash).toString('hex')
    } else {
      this.keyMaterial = null
      this.keyId = 'null'
    }
    // console.trace('keyId', this.name, this.keyId)
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
      if (this.keyMaterial) {
        // console.log('encrypting car', innerBlockstore.label)
        // should we pass cids in instead of iterating frin innerBlockstore?
        const newCar = await blocksToEncryptedCarBlock(innerBlockstore.lastCid, innerBlockstore, this.keyMaterial)
        await this.parkCar(newCar.cid.toString(), newCar.bytes, cids)
      } else {
        const newCar = await blocksToCarBlock(innerBlockstore.lastCid, innerBlockstore)
        await this.parkCar(newCar.cid.toString(), newCar.bytes, cids)
      }
    } else {
      throw new Error('missing lastCid for car header')
    }
  }

  withDB = async dbWorkFun => {
    if (!this.idb) {
      this.idb = await openDB(`fp.${this.keyId}.${this.name}.valet`, 2, {
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
   * Iterate over all blocks in the store.
   *
   * @yields {{cid: string, value: Uint8Array}}
   * @returns {AsyncGenerator<any, any, any>}
   */
  async * cids () {
    // console.log('valet cids')
    const db = await this.withDB(async db => db)
    const tx = db.transaction(['cidToCar'], 'readonly')
    let cursor = await tx.store.openCursor()
    while (cursor) {
      yield { cid: cursor.key, car: cursor.value.car }
      cursor = await cursor.continue()
    }
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

  // todo memoize this
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
      if (this.keyMaterial) {
        const roots = await reader.getRoots()
        const readerGetWithCodec = async cid => {
          const got = await reader.get(cid)
          // console.log('got.', cid.toString())
          let useCodec = codec
          if (cid.toString().indexOf('bafy') === 0) {
            // todo cleanup types
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
        const { blocks } = await blocksFromEncryptedCarBlock(roots[0], readerGetWithCodec, this.keyMaterial)
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

export const blocksToCarBlock = async (rootCids, blocks) => {
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
const blocksFromEncryptedCarBlock = async (cid, get, keyMaterial) => {
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
