import { CarReader } from '@ipld/car'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import { parse } from 'multiformats/link'
import * as CBW from '@ipld/car/buffer-writer'
import * as raw from 'multiformats/codecs/raw'
import * as Block from 'multiformats/block'
import * as dagcbor from '@ipld/dag-cbor'
import { openDB } from 'idb'
import cargoQueue from 'async/cargoQueue.js'
// @ts-ignore

// @ts-ignore
import { bf, simpleCompare as compare } from 'prolly-trees/utils'
// @ts-ignore
import { nocache as cache } from 'prolly-trees/cache'
// import { makeGetBlock } from './prolly.js'
import { encrypt, decrypt } from './crypto.js'
import { Buffer } from 'buffer'
// @ts-ignore
import * as codec from 'encrypted-block'

import { create, load } from 'ipld-hashmap'

import { rawSha1 as sha1sync } from './sha1.js'
const chunker = bf(30)

const blockOpts = { cache, chunker, codec: dagcbor, hasher: sha256, compare }

const NO_ENCRYPT = typeof process !== 'undefined' && !!process.env?.NO_ENCRYPT
// ? process.env.NO_ENCRYPT : import.meta && import.meta.env.VITE_NO_ENCRYPT

export class Valet {
  idb = null
  name = null
  uploadQueue = null
  alreadyEnqueued = new Set()
  keyMaterial = null
  keyId = 'null'
  valetRoot = null
  valetRootCid = null // set by hydrate
  valetRootCarCid = null // most recent diff

  valetCidBlocks = new VMemoryBlockstore()
  instanceId = Math.random().toString(36).slice(2)

  /**
   * Function installed by the database to upload car files
   * @type {null|function(string, Uint8Array):Promise<void>}
   */
  uploadFunction = null

  constructor (name = 'default', keyMaterial) {
    console.log('valet', name)
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

  setRootCarCid (cid) {
    this.valetRootCarCid = cid
    this.valetRoot = null
    this.valetRootCid = null
  }

  async getCarCIDForCID (cid) {
    // make a car reader for this.valetRootCarCid
    if (!this.valetRootCarCid) return

    let indexNode
    if (this.valetRoot) {
      indexNode = this.valetRoot
    } else {
      const combinedReader = await this.getCombinedReader(this.valetRootCarCid)
      if (!this.valetRootCid) {
        const root = combinedReader.root.cid
        console.log('roots', this.instanceId, this.name, root, this.valetRootCarCid, this.valetRootCid)
        this.valetRootCid = root
      }
      indexNode = await load(combinedReader, this.valetRootCid, {
        blockHasher: blockOpts.hasher,
        blockCodec: blockOpts.codec
      })
    }

    const got = await indexNode.get(cid)
    console.log('getCarCIDForCID', cid, got)
    return { result: got }
  }

  async OLDgetCarCIDForCID (cid) {
    const carCid = await this.withDB(async db => {
      const tx = db.transaction(['cars', 'cidToCar'], 'readonly')
      const indexResp = await tx.objectStore('cidToCar').index('cids').get(cid)
      return indexResp?.car
    })
    return { result: carCid }
  }

  async getCombinedReader (carCid) {
    let carMapReader
    if (this.valetRootCarCid) {
      // todo only need this if we are cold starting
      carMapReader = await this.getCarReader(this.valetRootCarCid)
    }

    const theseValetCidBlocks = this.valetCidBlocks
    // console.log('theseValetCidBlocks', theseValetCidBlocks)
    const combinedReader = {
      root: carMapReader?.root,
      put: async (cid, bytes) => {
        // console.log('mapPut', cid, bytes.length)
        return await theseValetCidBlocks.put(cid, bytes)
      },
      get: async cid => {
        // console.log('mapGet', cid)
        try {
          const got = await theseValetCidBlocks.get(cid)
          return got.bytes
        } catch (e) {
          // console.log('get from car', cid, carMapReader)
          if (!carMapReader) throw e
          const bytes = await carMapReader.get(cid)
          await theseValetCidBlocks.put(cid, bytes)
          // console.log('mapGet', cid, bytes.length, bytes.constructor.name)
          return bytes
        }
      }
    }
    return combinedReader
  }

  /**
   *
   * @param {string} carCid
   * @param {*} value
   */
  async parkCar (carCid, value, cids) {
    console.log('parkCar', this.instanceId, this.name, carCid, cids)
    // const bulkOperations = []
    // if (this.valetRootCid) {
    //   for (const { cid } of this.valetCidBlocks.entries()) {
    //     console.log('did enc valetCidBlocks', cid)
    //     bulkOperations.push({ key: cid.toString(), value: newValetCidCar.cid.toString() })
    //   }
    // }
    const combinedReader = await this.getCombinedReader(carCid)
    const mapNode = await addCidsToCarIndex(
      combinedReader,
      this.valetRoot,
      this.valetRootCid,
      Array.from(cids).map(cid => ({ key: cid.toString(), value: carCid.toString() }))
    )

    this.valetRoot = mapNode
    this.valetRootCid = mapNode.cid
    // make a block set with all the cids of the map
    const saveValetBlocks = new VMemoryBlockstore() //  todo this blockstore should read from the last valetCid car also

    for await (const cidx of mapNode.cids()) {
      const bytes = await combinedReader.get(cidx)
      // console.log('combinedReader ocks', cidx, bytes.constructor.name, bytes.length)
      saveValetBlocks.put(cidx, bytes)
    }
    // console.log('did addCidsToCarIndex r', saveValetBlocks)
    let newValetCidCar
    if (this.keyMaterial) {
      newValetCidCar = await blocksToEncryptedCarBlock(this.valetRootCid, saveValetBlocks, this.keyMaterial)
    } else {
      newValetCidCar = await blocksToCarBlock(this.valetRootCid, saveValetBlocks)
    }
    console.log('new valetRootCid', this.instanceId, this.name, newValetCidCar.cid, this.valetRootCid)
    this.valetRootCarCid = newValetCidCar.cid // goes to clock

    await this.withDB(async db => {
      const tx = db.transaction(['cars'], 'readwrite')
      await tx.objectStore('cars').put(value, carCid.toString())
      if (newValetCidCar) {
        await tx.objectStore('cars').put(newValetCidCar.bytes, newValetCidCar.cid.toString())
      }
      // await tx.objectStore('cidToCar').put({ pending: 'y', car: carCid, cids: Array.from(cids) })
      return await tx.done
    })

    // load the existing cidToCar index from prolly
    // add all the new cidsToCar entries to it
    // also add the cidToCar entry for the current root
    // store the cidToCar root in localstorage

    // clear valetCidBlocks and put them in a car file
    // put those car index entries in the valetCid index

    // const { getBlock } = makeGetBlock({
    //   get: async (cid) => {
    //     try {
    //       return await this.valetCidBlocks.get(cid)
    //     } catch (e) {
    //       const bytes = await this.getValetBlock(cid)
    //       await this.valetCidBlocks.put(cid, bytes)
    //       return { cid, bytes }
    //     }
    //   }
    // })

    // const { getBlock } = makeGetBlock(this.valetCidBlocks)

    // (getBlock, valetRoot, valetRootCid, carCid, cids)

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

  async getCarReader (carCid) {
    carCid = carCid.toString()
    return await this.withDB(async db => {
      const tx = db.transaction(['cars'], 'readonly')
      // const indexResp = await tx.objectStore('cidToCar').index('cids').get(dataCID)
      // const carCid = indexResp?.car
      // console.log('getCarReader', carCid)
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

        // last block is the root ???
        const rootBlock = blocks[blocks.length - 1]

        return {
          root: rootBlock,
          get: async dataCID => {
          // console.log('getCarReader dataCID', dataCID)
            dataCID = dataCID.toString()
            const block = blocks.find(b => b.cid.toString() === dataCID)
            // console.log('getCarReader block', block)
            if (block) {
              return block.bytes
            }
          }
        }
      } else {
        return {
          root: reader.getRoots()[0],
          get: async dataCID => {
            const gotBlock = await reader.get(CID.parse(dataCID))
            if (gotBlock) {
              return gotBlock.bytes
            }
          }
        }
      }
    })
  }

  // todo memoize this
  async getValetBlock (dataCID) {
    // console.log('get valet block', dataCID)
    const { result: carCid } = await this.getCarCIDForCID(dataCID)
    if (!carCid) {
      throw new Error('Missing block: ' + dataCID)
    }
    const reader = await this.getCarReader(carCid)
    return await reader.get(dataCID)
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
  console.log('encrypting', theCids.length, 'blocks', theCids.includes(innerBlockStoreClockRootCid.toString()))
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

// const addCidsToCarIndex = async (getBlock, valetRoot, valetRootCid, bulkOperations) => {
//   let indexNode
//   const newBlocks = []
//   if (valetRootCid) {
//     if (valetRoot) {
//       indexNode = valetRoot
//     } else {
//       indexNode = await load({ cid: valetRootCid, get: getBlock, ...blockOpts })
//     }
//     console.log('update ')
//     return indexNode.bulk(bulkOperations)
//   } else {
//     for await (const node of create({ get: getBlock, list: bulkOperations, ...blockOpts })) {
//       indexNode = node
//       newBlocks.push(await node.block)
//     }
//     // console.log('created ', indexNode.cid.toString())

//     return { root: indexNode, blocks: newBlocks }
//   }
// }

const addCidsToCarIndex = async (blockstore, valetRoot, valetRootCid, bulkOperations) => {
  let indexNode
  if (valetRootCid) {
    if (valetRoot) {
      indexNode = valetRoot
    } else {
      indexNode = await load(blockstore, valetRootCid, { blockHasher: blockOpts.hasher, blockCodec: blockOpts.codec })
    }
  } else {
    indexNode = await create(blockstore, {
      bitWidth: 4,
      bucketSize: 2,
      blockHasher: blockOpts.hasher,
      blockCodec: blockOpts.codec
    })
  }
  // console.log('adding', bulkOperations.length, 'cids to index')
  for (const { key, value } of bulkOperations) {
    // console.log('adding', key, value)
    await indexNode.set(key, value)
  }
  return indexNode
}

// function btoArr (buf) {
//   if (!buf) return undefined
//   if (buf.constructor.name === 'Uint8Array' || buf.constructor === Uint8Array) {
//     return buf
//   }
//   if (typeof buf === 'string') buf = Buffer.from(buf)
//   const a = new Uint8Array(buf.length)
//   for (let i = 0; i < buf.length; i++) a[i] = buf[i]
//   return a
// }
export class VMemoryBlockstore {
  /** @type {Map<string, Uint8Array>} */
  blocks = new Map()
  instanceId = Math.random().toString(36).slice(2)

  async get (cid) {
    const bytes = this.blocks.get(cid.toString())
    // console.log('getvm', bytes.constructor.name, this.instanceId, cid, bytes && bytes.length)
    if (bytes.length === 253) {
      // console.log('getvm', bytes.())
    }
    if (!bytes) throw new Error('block not found ' + cid.toString())
    return { cid, bytes }
  }

  /**
   * @param {import('../src/link').AnyLink} cid
   * @param {Uint8Array} bytes
   */
  async put (cid, bytes) {
    // console.log('putvm', bytes.constructor.name, this.instanceId, cid, bytes.length)
    // if (bytes.constructor.name == 'Buffer') {
    //   console.log('putvmx', bytes.buffer.constructor.name)
    // }
    // this.blocks.set(cid.toString(), btoArr(bytes))
    this.blocks.set(cid.toString(), bytes)
  }

  * entries () {
    for (const [str, bytes] of this.blocks) {
      yield { cid: parse(str), bytes }
    }
  }
}
