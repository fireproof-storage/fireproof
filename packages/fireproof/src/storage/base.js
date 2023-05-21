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
import * as codec from 'encrypted-block'
import { blocksToCarBlock, blocksToEncryptedCarBlock, blocksFromEncryptedCarBlock } from '../valet.js'

const chunker = bf(30)
const blockOpts = { cache, chunker, codec: dagcbor, hasher: sha256, compare }

const NO_ENCRYPT = typeof process !== 'undefined' && !!process.env?.NO_ENCRYPT
const NOT_IMPL = true

export class Base {
  valetRootCarCid = null // used on initial hydrate, if you change this, set this.valetCarCidMap = null
  keyMaterial = null
  keyId = 'null'

  constructor (name, config = {}) {
    this.name = name
    this.config = config
    this.setKeyMaterial(config.key)
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
  }

  writeCars () {
    if (this.config.readonly) {
      throw new Error('Read-only mode')
    }
  }

  saveHeader () {
    if (this.config.readonly) {
      throw new Error('Read-only mode')
    }
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
      throw new Error('Missing block: ' + dataCID)
    }
    const reader = await this.getCarReader(carCid)
    return await reader.get(dataCID)
  }

  /** Private - internal **/

  async getCidCarMap () {
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
    const carMapReader = await this.getWriteableCarReader(carCid)
    const indexNode = await load(carMapReader, carMapReader.root.cid, {
      blockHasher: blockOpts.hasher,
      blockCodec: blockOpts.codec
    })
    const theCarMap = new Map()
    for await (const [key, value] of indexNode.entries()) {
      theCarMap.set(key, value)
    }
    return theCarMap
  }

  async getWriteableCarReader (carCid) {
    console.log('getWriteableCarReader', carCid)
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
    const reader = await CarReader.fromBytes(carBytes)
    if (this.keyMaterial) {
      const roots = await reader.getRoots()
      const readerGetWithCodec = async cid => {
        const got = await reader.get(cid)
        let useCodec = codec
        if (cid.toString().indexOf('bafy') === 0) {
          useCodec = dagcbor
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
      return {
        root: rootBlock,
        get: async dataCID => {
          dataCID = dataCID.toString()
          const block = blocks.find(b => b.cid.toString() === dataCID)
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
  }

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
    const loader = await getEmptyLoader()
    const indexNode = await create(loader, {
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
      newValetCidCar = await blocksToEncryptedCarBlock(indexNode.cid, loader.blocks, this.keyMaterial)
    } else {
      newValetCidCar = await blocksToCarBlock(indexNode.cid, loader.blocks)
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
