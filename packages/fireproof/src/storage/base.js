import { create, load } from 'ipld-hashmap'
import { parse } from 'multiformats/link'
import { CarReader } from '@ipld/car'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import * as Block from 'multiformats/block'
import * as dagcbor from '@ipld/dag-cbor'

// @ts-ignore

// @ts-ignore
import { bf, simpleCompare as compare } from 'prolly-trees/utils'
// @ts-ignore
import { nocache as cache } from 'prolly-trees/cache'
// import { makeGetBlock } from './prolly.js'
import { Buffer } from 'buffer'
import { rawSha1 as sha1sync } from '../sha1.js'

// @ts-ignore
import * as codec from 'encrypted-block'
import { blocksToCarBlock, blocksToEncryptedCarBlock, blocksFromEncryptedCarBlock } from '../valet.js'

// import { rawSha1 as sha1sync } from '../sha1.js'
const chunker = bf(30)

const blockOpts = { cache, chunker, codec: dagcbor, hasher: sha256, compare }
const NO_ENCRYPT = typeof process !== 'undefined' && !!process.env?.NO_ENCRYPT

const notImpl = true

export class Base {
  valetRootCarCid = null // most recent diff
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
    // console.trace('keyId', this.name, this.keyId)
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

  // cid set management -- each set corresponds to a storage source
  /// //////////////////////
  // called by getValetBlock
  // should look up in the memory hash map
  // the code below can be used on cold start
  async getCarCIDForCID (cid) {
    // console.log('getCarCIDForCID', cid, this.valetRootCarCid)
    // make a car reader for this.valetRootCarCid
    const cidMap = await this.getCidCarMap()
    const carCid = cidMap.get(cid.toString())
    if (carCid) {
      return { result: carCid }
    }
    // throw new Error('not found')
    return { result: null }
  }

  async getCidCarMap () {
    if (this.valetCarCidMap) return this.valetCarCidMap

    // called by getCarCIDForCID
    // this returns the in-memory map if it has been hydrated
    // otherwise it hydrates the map based on the car file

    if (this.valetRootCarCid) {
      this.valetCarCidMap = await this.mapForIPLDHashmapCarCid(this.valetRootCarCid)
      return this.valetCarCidMap
    } else {
      // no car file, so make an empty map
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
      // console.log('getCidCarMap', key, value)
      theCarMap.set(key, value)
    }
    return theCarMap
  }

  async getWriteableCarReader (carCid) {
    console.log('getWriteableCarReader', carCid)
    const carMapReader = await this.getCarReader(carCid)

    const theseWriteableBlocks = new VMemoryBlockstore()
    // console.log('carMapReader', carMapReader)
    const combinedReader = {
      blocks: theseWriteableBlocks,
      root: carMapReader?.root,
      put: async (cid, bytes) => {
        // console.log('mapPut', cid, bytes.length)
        return await theseWriteableBlocks.put(cid, bytes)
      },
      get: async cid => {
        // console.log('mapGet', cid)
        try {
          const got = await theseWriteableBlocks.get(cid)
          return got.bytes
        } catch (e) {
          // console.log('get from car', cid, carMapReader)
          if (!carMapReader) throw e
          const bytes = await carMapReader.get(cid)
          await theseWriteableBlocks.put(cid, bytes)
          // console.log('mapGet', cid, bytes.length, bytes.constructor.name)
          return bytes
        }
      }
    }
    // console.log('combinedReader', carCid)
    return combinedReader
  }

  async readCar (carCid) {
    if (notImpl) throw new Error('not implemented')
    return new Uint8Array(carCid)
  }

  async getCarReader (carCid) {
    carCid = carCid.toString()
    const carBytes = await this.readCar(carCid)

    // const callID = Math.random().toString(36).substring(7)
    // console.log('innerGetCarReader', carCid, carBytes.constructor.name, carBytes.byteLength)
    const reader = await CarReader.fromBytes(carBytes)
    // console.log('got reader', callID, reader)
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

      // last block is the root ??? todo
      const rootBlock = blocks[blocks.length - 1]
      // console.log('got reader', callID, carCid)
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
  }

  async updateCarCidMap (carCid, cids) {
    // called by parkCar
    // this adds the cids to the in-memory map
    // and returns a new car file with the updated map
    // this does not write the car file to disk
    const theCarMap = await this.getCidCarMap() // this hydrates the map if it has not been hydrated
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
  // console.log('carMapReader', carMapReader)
  const combinedReader = {
    blocks: theseWriteableBlocks,
    // root: carMapReader?.root,
    put: async (cid, bytes) => {
      // console.log('mapPut', cid, bytes.length)
      return await theseWriteableBlocks.put(cid, bytes)
    },
    get: async cid => {
      const got = await theseWriteableBlocks.get(cid)
      return got.bytes
    }
  }
  // console.log('combinedReader', carCid)
  return combinedReader
}

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
