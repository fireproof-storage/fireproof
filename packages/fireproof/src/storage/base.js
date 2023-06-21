// import { sha256 } from 'multiformats/hashes/sha2'
import * as CBW from '@ipld/car/buffer-writer'
import * as raw from 'multiformats/codecs/raw'
// import * as Block from 'multiformats/block'
// @ts-ignore
// import { bf } from 'prolly-trees/utils'
// @ts-ignore
// import { nocache as cache } from 'prolly-trees/cache'
import { encrypt, decrypt } from '../crypto.js'
// import { Buffer } from 'buffer'

// const chunker = bf(30)

import randomBytes from 'randombytes'
// import { randomBytes } from 'crypto'
import { create, load } from 'ipld-hashmap'
import { parse } from 'multiformats/link'
import { CarReader } from '@ipld/car'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import * as Block from 'multiformats/block'
import * as dagcbor from '@ipld/dag-cbor'
// @ts-ignore
import { bf, simpleCompare as compare } from 'prolly-trees/utils'
// @ts-ignore
import { nocache as cache } from 'prolly-trees/cache'
import { Buffer } from 'buffer'
import { rawSha1 as sha1sync } from '../sha1.js'
// @ts-ignore
import * as codec from '../encrypted-block.js'

const chunker = bf(30)
const blockOpts = { cache, chunker, codec: dagcbor, hasher: sha256, compare }

const NO_ENCRYPT = typeof process !== 'undefined' && !!process.env?.NO_ENCRYPT
const NOT_IMPL = true

export class Base {
  valetRootCarCid = null // used on initial hydrate, if you change this, set this.valetCarCidMap = null
  keyMaterial = null
  keyId = 'null'
  readonly = false

  constructor (name, config = {}) {
    this.instanceId = Math.random().toString(36).slice(2)
    this.name = name
    this.config = config

    if (!this.config.branches) {
      this.config.branches = {
        main: { readonly: false }
      }
    }

    // console.log('this.config', this.instanceId, this.name, this.config)
    // if there is config.key and config.car,
    // then we could skip loading the headers if we want.
    // currently we don't do that, because we only use
    // the config for first run, and then we use the headers
    // once they exist
    this.ready = this.getHeaders().then(blocksReady => {
      // console.log('blocksReady base', this.name, blocksReady)
      return blocksReady
    })
  }

  setCarCidMapCarCid (carCid) {
    // console.trace('setCarCidMapCarCid', carCid)
    if (!carCid) return
    this.valetRootCarCid = parse(carCid)
    this.valetCarCidMap = null
  }

  setKeyMaterial (km) {
    if (km && !NO_ENCRYPT) {
      const hex = Uint8Array.from(Buffer.from(km, 'hex'))
      this.keyMaterial = km
      const hash = sha1sync(hex)
      this.keyId = Buffer.from(hash).toString('hex')
      // console.log('setKeyMaterial', this.instanceId, this.name, km)
    } else {
      // console.log('setKeyMaterial', this.instanceId, this.name, km)
      this.keyMaterial = null
      this.keyId = 'null'
    }
  }

  async compact (clock) {
    if (this.readonly) return
    if (clock.length !== 1) {
      throw new Error(
        `Compacting with clock length ${clock.length} instead of 1. To merge the clock, apply an update to the database first.`
      )
    }
    const cidMap = await this.getCidCarMap()
    const dataCids = [...cidMap.keys()]
    const allBlocks = new Map()
    for (const cid of dataCids) {
      const block = await this.getLoaderBlock(cid)
      allBlocks.set(cid, block)
    }
    const blocks = {
      lastCid: clock[0],
      get: cid => allBlocks.get(cid.toString())
    }
    await this.parkCar(blocks, dataCids)
  }

  async parkCar (innerBlockstore, cids) {
    // console.log('parkCar', this.instanceId, this.name, this.readonly)
    if (this.readonly) return
    let newCar
    if (this.keyMaterial) {
      // console.log('encrypting car', innerBlockstore.label)
      newCar = await blocksToEncryptedCarBlock(innerBlockstore.lastCid, innerBlockstore, this.keyMaterial, [...cids])
    } else {
      // todo should we pass cids in instead of iterating innerBlockstore?
      newCar = await blocksToCarBlock(innerBlockstore.lastCid, innerBlockstore)
    }
    // console.log('new car', newCar.cid.toString())
    return await this.saveCar(newCar.cid.toString(), newCar.bytes, cids)
  }

  async saveCar (carCid, value, cids) {
    const newValetCidCar = await this.updateCarCidMap(carCid, cids)
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

    await this.writeCars(carList)
    this.valetRootCarCid = newValetCidCar.cid
    // console.trace('saved car', this.instanceId, this.name, newValetCidCar.cid.toString())
    return newValetCidCar
  }

  applyHeaders (headers) {
    // console.log('applyHeaders', headers.index)
    this.headers = headers
    // console.log('before applied', this.instanceId, this.name, this.keyMaterial, this.valetRootCarCid)
    for (const [, header] of Object.entries(headers)) {
      if (header) {
        // console.log('applyHeaders', this.instanceId, this.name, header.key, header.car)
        header.key && this.setKeyMaterial(header.key)
        this.setCarCidMapCarCid(header.car)
      }
    }
    if (!this.valetRootCarCid) {
      this.setCarCidMapCarCid(this.config.car)
    }
    if (!this.keyMaterial) {
      const nullKey = this.config.key === null
      if (nullKey || this.config.key) {
        this.setKeyMaterial(this.config.key)
      } else {
        this.setKeyMaterial(randomBytes(32).toString('hex'))
      }
    }
    // console.log('applied', this.instanceId, this.name, this.keyMaterial, this.valetRootCarCid)
  }

  async getHeaders () {
    const headers = {}
    for (const [branch] of Object.entries(this.config.branches)) {
      const got = await this.loadHeader(branch)
      // console.log('getHeaders', this.name, branch, got)
      headers[branch] = got
    }
    this.applyHeaders(headers)
    return headers
  }

  loadHeader (branch = 'main') {
    throw new Error('not implemented')
  }

  async saveHeader (header) {
    // for each branch, save the header
    // console.log('saveHeader', this.config.branches, header)
    //  for (const branch of this.branches) {
    //    await this.saveBranchHeader(branch)
    //  }
    for (const [branch, { readonly }] of Object.entries(this.config.branches)) {
      if (readonly) continue
      // console.log('saveHeader', this.instanceId, this.name, branch, header)
      await this.writeHeader(branch, header)
    }
  }

  prepareHeader (header, json = true) {
    header.key = this.keyMaterial
    header.car = this.valetRootCarCid.toString()
    // console.log('prepareHeader', this.instanceId, this.name, header)
    return json ? JSON.stringify(header) : header
  }

  writeHeader (branch, header) {
    throw new Error('not implemented')
  }

  async getCarCIDForCID (cid) {
    const cidMap = await this.getCidCarMap()
    const carCid = cidMap.get(cid.toString())
    if (carCid) {
      return { result: carCid }
    }
    return { result: null }
  }

  async readCar (carCid) {
    if (NOT_IMPL) throw new Error('not implemented')
    return new Uint8Array(carCid)
  }

  async getLoaderBlock (dataCID) {
    const { result: carCid } = await this.getCarCIDForCID(dataCID)
    if (!carCid) {
      throw new Error('Missing car for: ' + dataCID)
    }
    // console.log('getLoaderBlock', dataCID, carCid)
    const reader = await this.getCarReader(carCid)
    return { block: await reader.get(dataCID), reader, carCid }
  }

  /** Private - internal **/

  async getCidCarMap () {
    // console.log('getCidCarMap', this.constructor.name, this.name, this.valetRootCarCid, typeof this.valetCarCidMap)
    if (this.valetCarCidMap) return this.valetCarCidMap
    if (this.valetRootCarCid) {
      this.valetCarCidMap = await this.mapForIPLDHashmapCarCid(this.valetRootCarCid)
      return this.valetCarCidMap
    } else {
      this.valetCarCidMap = new Map()
      return this.valetCarCidMap
    }
  }

  async mapForIPLDHashmapCarCid (carCid) {
    // console.log('mapForIPLDHashmapCarCid', carCid)
    const carMapReader = await this.getWriteableCarReader(carCid)
    const indexNode = await load(carMapReader, carMapReader.root.cid, {
      blockHasher: blockOpts.hasher,
      blockCodec: blockOpts.codec
    })
    const theCarMap = new Map()
    for await (const [key, value] of indexNode.entries()) {
      // console.log('mapForIPLDHashmapCarCid', key, value)
      theCarMap.set(key, value)
    }
    return theCarMap
  }

  async getWriteableCarReader (carCid) {
    // console.log('getWriteableCarReader', carCid)
    const carMapReader = await this.getCarReader(carCid)
    const theseWriteableBlocks = new VMemoryBlockstore()
    const combinedReader = {
      blocks: theseWriteableBlocks,
      root: carMapReader?.root,
      put: async (cid, bytes) => {
        return await theseWriteableBlocks.put(cid, bytes)
      },
      get: async cid => {
        try {
          const got = await theseWriteableBlocks.get(cid)
          return got.bytes
        } catch (e) {
          if (!carMapReader) throw e
          const bytes = await carMapReader.get(cid)
          await theseWriteableBlocks.put(cid, bytes)
          return bytes
        }
      }
    }
    return combinedReader
  }

  async getCarReader (carCid) {
    carCid = carCid.toString()
    const carBytes = await this.readCar(carCid)
    // console.log('getCarReader', this.constructor.name, carCid, carBytes.length)
    const reader = await CarReader.fromBytes(carBytes)
    if (this.keyMaterial) {
      const roots = await reader.getRoots()
      const readerGetWithCodec = async cid => {
        const got = await reader.get(cid)
        let useCodec = codec
        if (cid.toString().indexOf('bafy') === 0) {
          // @ts-ignore
          useCodec = dagcbor // todo this is a dirty check
        }
        const decoded = await Block.decode({
          ...got,
          codec: useCodec,
          hasher: sha256
        })
        return decoded
      }
      const { blocks } = await blocksFromEncryptedCarBlock(roots[0], readerGetWithCodec, this.keyMaterial)
      const rootBlock = blocks[blocks.length - 1]
      const blocksIterable = function * () {
        for (const block of blocks) yield block
      }

      const gat = async dataCID => {
        dataCID = dataCID.toString()
        return blocks.find(b => b.cid.toString() === dataCID)
      }

      return {
        entries: blocksIterable,
        root: rootBlock,
        gat,
        get: async dataCID => {
          const block = await gat(dataCID)
          if (block) {
            return block.bytes
          }
        }
      }
    } else {
      const gat = async dataCID => {
        return await reader.get(CID.parse(dataCID))
      }
      return {
        // blocks,
        entries: reader.blocks.bind(reader),
        root: reader.getRoots()[0],
        gat,
        get: async dataCID => {
          const gotBlock = await gat(dataCID)
          if (gotBlock) {
            return gotBlock.bytes
          }
        }
      }
    }
  }

  writeCars (cars) {}

  async updateCarCidMap (carCid, cids) {
    // this hydrates the map if it has not been hydrated
    const theCarMap = await this.getCidCarMap()
    for (const cid of cids) {
      theCarMap.set(cid, carCid)
    }
    // todo can we debounce this? -- maybe put it into a queue so we can batch it
    return await this.persistCarMap(theCarMap)
  }

  async persistCarMap (theCarMap) {
    const ipldLoader = await getEmptyLoader()
    const indexNode = await create(ipldLoader, {
      bitWidth: 4,
      bucketSize: 2,
      blockHasher: blockOpts.hasher,
      blockCodec: blockOpts.codec
    })

    for (const [key, value] of theCarMap.entries()) {
      await indexNode.set(key, value)
    }

    let newValetCidCar
    if (this.keyMaterial) {
      const cids = [...ipldLoader.blocks.blocks.keys()]
      // console.log('persistCarMap', cids)
      newValetCidCar = await blocksToEncryptedCarBlock(indexNode.cid, ipldLoader.blocks, this.keyMaterial, cids)
    } else {
      newValetCidCar = await blocksToCarBlock(indexNode.cid, ipldLoader.blocks)
    }
    return newValetCidCar
  }
}

async function getEmptyLoader () {
  const theseWriteableBlocks = new VMemoryBlockstore()
  return {
    blocks: theseWriteableBlocks,
    put: async (cid, bytes) => {
      return await theseWriteableBlocks.put(cid, bytes)
    },
    get: async cid => {
      const got = await theseWriteableBlocks.get(cid)
      return got.bytes
    }
  }
}

export class VMemoryBlockstore {
  /** @type {Map<string, Uint8Array>} */
  blocks = new Map()
  instanceId = Math.random().toString(36).slice(2)

  async get (cid) {
    const bytes = this.blocks.get(cid.toString())
    if (!bytes) throw new Error('block not found ' + cid.toString())
    return { cid, bytes }
  }

  /**
   * @param {any} cid
   * @param {Uint8Array} bytes
   */
  async put (cid, bytes) {
    this.blocks.set(cid.toString(), bytes)
  }

  * entries () {
    for (const [str, bytes] of this.blocks) {
      yield { cid: parse(str), bytes }
    }
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

export const blocksToEncryptedCarBlock = async (innerBlockStoreClockRootCid, blocks, keyMaterial, cids) => {
  const encryptionKey = Buffer.from(keyMaterial, 'hex')
  const encryptedBlocks = []
  const theCids = cids
  // console.trace('blocksToEncryptedCarBlock', blocks)
  // for (const { cid } of blocks.entries()) {
  //   theCids.push(cid.toString())
  // }
  // console.log(
  //   'encrypting',
  //   theCids.length,
  //   'blocks',
  //   theCids.includes(innerBlockStoreClockRootCid.toString()),
  //   keyMaterial
  // )
  // console.log('cids', theCids, innerBlockStoreClockRootCid.toString())
  let last
  for await (const block of encrypt({
    cids: theCids,
    get: async cid => {
      // console.log('getencrypt', cid)
      const got = blocks.get(cid)
      // console.log('got', got)
      return got.block ? ({ cid, bytes: got.block }) : got
    }, // maybe we can just use blocks.get
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
