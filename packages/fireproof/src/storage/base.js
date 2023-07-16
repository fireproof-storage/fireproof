import randomBytes from 'randombytes'
// import { randomBytes } from 'crypto'
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
import {
  blocksToEncryptedCarBlock,
  blocksToCarBlock,
  blocksFromEncryptedCarBlock,
  VMemoryBlockstore
} from './utils.js'

const chunker = bf(30)
const blockOpts = { cache, chunker, codec: dagcbor, hasher: sha256, compare }

const NO_ENCRYPT = typeof process !== 'undefined' && !!process.env?.NO_ENCRYPT
const NOT_IMPL = true

export class Base {
  lastCar = null
  carLog = []
  keyMaterial = null
  keyId = 'null'
  readonly = false
  instanceId = Math.random().toString(36).slice(2)

  constructor (name, config = {}) {
    this.name = name
    this.config = config

    if (!this.config.branches) {
      this.config.branches = {
        main: { readonly: false }
      }
    }

    this.ready = this.getHeaders().then(blocksReady => {
      // console.log('blocksReady base', this.name, blocksReady)
      return blocksReady
    })
  }

  setLastCar (car) {
    this.lastCar = car
    this.carLog.unshift(car)
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

  async compact (clock) {
    if (this.readonly) return
    if (clock.length !== 1) {
      throw new Error(
        `Compacting with clock length ${clock.length} instead of 1. To merge the clock, apply an update to the database first.`
      )
    }
    const cidMap = await this.getCidCarMap()
    const dataCids = new Set([...cidMap.keys()].filter(cid => cid[0] !== '_').map(cid => CID.parse(cid)))
    const allBlocks = new Map()
    for (const cid of dataCids) {
      const block = await this.getLoaderBlock(cid)
      allBlocks.set(cid, block.block)
    }
    cidMap.clear()
    let lastCid = clock[0]
    const blocks = {
      head: clock,
      lastCid,
      get: cid => allBlocks.get(cid.toString()),
      put: async (cid, block) => {
        allBlocks.set(cid.toString(), block)
        lastCid = cid.toString()
      }
    }
    // const lastCompactCar =
    await this.parkCar(blocks, dataCids) // todo this should remove old cars from the cid car map
    // console.log('compact', this.name, lastCompactCar.cid, blocks.lastCid.toString(), dataCids.length)
    // await this.setLastCompact(lastCompactCar.cid)
  }

  async parkCar (innerBlockstore, cids) {
    // console.log('parkCar', this.instanceId, this.name, this.readonly)
    if (this.readonly) return

    // console.log('parkCar', this.name, this.carLog, innerBlockstore.head)

    const value = { fp: { last: innerBlockstore.lastCid, clock: innerBlockstore.head, cars: this.carLog } }
    const header = await Block.encode({ value, hasher: blockOpts.hasher, codec: blockOpts.codec })
    await innerBlockstore.put(header.cid, header.bytes)
    cids.add(header.cid.toString())

    let newCar
    if (this.keyMaterial) {
      // console.log('encrypting car', innerBlockstore.label)
      newCar = await blocksToEncryptedCarBlock(innerBlockstore.lastCid, innerBlockstore, this.keyMaterial, [...cids])
    } else {
      // todo should we pass cids in instead of iterating innerBlockstore?
      newCar = await blocksToCarBlock(innerBlockstore.lastCid, innerBlockstore)
    }
    return await this.saveCar(newCar.cid.toString(), newCar.bytes)
  }

  async saveCar (carCid, value) {
    // add the car cid to our in memory car list
    this.carLog.unshift(carCid)
    this.lastCar = carCid
    // console.log('saveCar', this.name, carCid, this.carLog.length)
    await this.writeCars([
      {
        cid: carCid,
        bytes: value
      }
    ])
  }

  async applyHeaders (headers) {
    // console.log('applyHeaders', headers.index)
    this.headers = headers
    // console.log('before applied', this.instanceId, this.name, this.keyMaterial, this.valetRootCarCid)
    for (const [, header] of Object.entries(headers)) {
      if (header) {
        // console.log('applyHeaders', this.instanceId, this.name, header.key, header.car)
        header.key && this.setKeyMaterial(header.key)
        // this.setCarCidMapCarCid(header.car) // instead we should just extract the list of cars from the car
        const carHeader = await this.readHeaderCar(header.car)
        this.carLog = carHeader.cars
        // console.log('stored carHeader', this.name, this.config.type, this.carLog)

        // this.lastCar = header.car // ?
        if (header.car) {
          // console.log('header.car', header.car, this.blocks.valet.primary.carLog)
          this.setLastCar(header.car)
        }
        header.clock = carHeader.clock.map(c => c.toString())
      }
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
      headers[branch] = got
    }
    await this.applyHeaders(headers)
    return headers
  }

  loadHeader (branch = 'main') {
    if (NOT_IMPL) throw new Error('not implemented')
    return {}
  }

  async saveHeader (header) {
    // this.clock = header.clock
    // for each branch, save the header
    // console.log('saveHeader', this.config.branches)
    //  for (const branch of this.branches) {
    //    await this.saveBranchHeader(branch)
    //  }
    for (const [branch, { readonly }] of Object.entries(this.config.branches)) {
      if (readonly) continue
      // console.log('saveHeader', this.instanceId, this.name, branch, header)
      await this.writeHeader(branch, this.prepareHeader(header))
    }
  }

  prepareHeader (header, json = true) {
    header.key = this.keyMaterial
    header.car = this.lastCar?.toString()
    // console.log('prepareHeader', this.instanceId, this.name, header)
    return json ? JSON.stringify(header) : header
  }

  writeHeader (branch, header) {
    throw new Error('not implemented')
  }

  async getCarCIDForCID (cid) { // todo combine with getLoaderBlock for one fetch not many
    // console.log('getCarCIDForCID', cid, this.carLog, this.config.type)
    // for each car in the car log
    for (const carCid of this.carLog) {
      const reader = await this.getCarReader(carCid)
      // console.log('getCarCIDForCID', carCid, cid)
      // if (reader.has(cid)) {
      //   console.log('getCarCIDForCID found', cid)
      //   return { result: carCid }
      // }

      for await (const block of reader.entries()) {
        // console.log('getCarCIDForCID', cid, block.cid.toString())
        // console.log('getCarCIDForCID', cid, block.cid.toString())
        if (block.cid.toString() === cid.toString()) {
          // console.log('getCarCIDForCID found', cid)
          return { result: carCid }
        }
      }
    }
    // console.log('getCarCIDForCID not found', cid, this.config.type)
    return { result: null }
    // return this.carLog[0]
    // const cidMap = await this.getCidCarMap()
    // const carCid = cidMap.get(cid.toString())
    // if (carCid) {
    //   return { result: carCid }
    // }
    // return { result: null }
  }

  async readCar (carCid) {
    if (NOT_IMPL) throw new Error('not implemented')
    return new Uint8Array(carCid)
  }

  async getLoaderBlock (dataCID) {
    // console.log('getLoaderBlock', dataCID, this.config, this.carLog)
    const { result: carCid } = await this.getCarCIDForCID(dataCID)
    // console.log('gotLoaderBlock', dataCID, carCid)
    if (!carCid) {
      throw new Error('Missing car for: ' + dataCID)
    }
    const reader = await this.getCarReader(carCid)
    const block = await reader.get(dataCID)
    // console.log('gotLoaderBlock', dataCID, block.length)
    return { block, reader, carCid }
  }

  // async getLastSynced () {
  //   const metadata = await this.getCidCarMap()
  //   if (metadata.has('_last_sync_head')) {
  //     return JSON.parse(metadata.get('_last_sync_head'))
  //   } else {
  //     return []
  //   }
  // }

  // async setLastSynced (lastSynced) {
  //   const metadata = await this.getCidCarMap()
  //   metadata.set('_last_sync_head', JSON.stringify(lastSynced))
  //   // await this.writeMetadata(metadata)
  // }

  // async getCompactSince (sinceHead) {
  //   // get the car for the head
  //   // find the location of the car in the metadata car sequence
  // }

  /** Private - internal **/

  async getCidCarMap () {
    if (this.valetCarCidMap) return this.valetCarCidMap
    this.valetCarCidMap = new Map()
    return this.valetCarCidMap
  }

  async readHeaderCar (carCid) {
    const carMapReader = await this.getCarReader(carCid)
    // await this.getWriteableCarReader(carCid)
    // console.log('readHeaderCar', carCid, carMapReader)
    // now when we load the root cid from the car, we get our new custom root node
    const bytes = await carMapReader.get(carMapReader.root.cid)
    const decoded = await Block.decode({ bytes, hasher: blockOpts.hasher, codec: blockOpts.codec })
    // @ts-ignore
    const { fp: { cars, clock } } = decoded.value
    return { cars, clock, reader: carMapReader }
  }

  // todo this is only because parkCar wants a writable reader to put the metadata block
  // parkCar should handle it's own writeable wrapper, and it should love to be called with
  // a read only car reader
  async getWriteableCarReader (carReader) {
    // console.log('getWriteableCarReader')
    // const carReader = await this.getCarReader(carCid)
    // console.log('getWriteableCarReader', carCid, carReader)
    const theseWriteableBlocks = new VMemoryBlockstore()
    const combinedReader = {
      blocks: theseWriteableBlocks,
      root: carReader?.root,
      put: async (cid, bytes) => {
        return await theseWriteableBlocks.put(cid, bytes)
      },
      get: async cid => {
        // console.log('getWriteableCarReader get', cid)
        try {
          const got = await theseWriteableBlocks.get(cid)
          return got.bytes
        } catch (e) {
          if (!carReader) throw e
          const bytes = await carReader.get(cid)
          // console.log('getWriteableCarReader', cid, bytes)
          await theseWriteableBlocks.put(cid, bytes)
          return bytes
        }
      }
    }
    return combinedReader
  }

  carReaderCache = new Map()
  async getCarReader (carCid) {
    if (!this.carReaderCache.has(carCid)) {
      this.carReaderCache.set(carCid, this.getCarReaderImpl(carCid))
    }
    return this.carReaderCache.get(carCid)
  }

  async getCarReaderImpl (carCid) {
    carCid = carCid.toString()
    const carBytes = await this.readCar(carCid)
    // console.log('getCarReader', this.constructor.name, carCid, carBytes.length)
    const reader = await CarReader.fromBytes(carBytes)
    // console.log('getCarReader', carCid, reader._header)
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

  // sequenceCarMapAppend (theCarMap, carCid) {
  //   // _last_compact
  //   // _last_sync (map per clock? you can find this by looking at a clocks car and it's position in the map)
  //   const oldMark = theCarMap.get('_last_compact') // todo we can track _next_seq directly
  //   // console.log('sequenceCarMapAppend oldMark', oldMark)
  //   const lastCompact = oldMark ? charwise.decode(oldMark) : 0
  //   // start iterating from the last compact point and find the first missing entry.
  //   // then write the carCid to that entry
  //   let next = lastCompact
  //   while (true) {
  //     const key = `_${charwise.encode(next)}`
  //     if (!theCarMap.has(key)) {
  //       console.log('sequenceCarMapAppend', next, key, carCid)
  //       theCarMap.set(key, carCid.toString())
  //       break
  //     } else {
  //       // const got = theCarMap.get(key)
  //       next++
  //     }
  //   }
  // }

  // async setLastCompact (lastCompactCarCid) {
  //   console.log('setLastCompact', lastCompactCarCid)
  //   const theCarMap = await this.getCidCarMap()
  //   const oldMark = theCarMap.get('_last_compact')
  //   const lastCompact = oldMark ? charwise.decode(oldMark) : 0

  //   let next = lastCompact
  //   while (true) {
  //     const key = `_${charwise.encode(next)}`
  //     if (!theCarMap.has(key)) {
  //       if (next === 0) {
  //         theCarMap.set('_last_compact', charwise.encode(next))
  //         break
  //       } else {
  //         throw new Error(`last compact point not found ${next} ${key}`)
  //       }
  //     } else {
  //       const got = theCarMap.get(key)
  //       // console.log('setLastCompact', key, got)
  //       if (got === lastCompactCarCid) {
  //         theCarMap.set('_last_compact', charwise.encode(next))
  //         break
  //       }
  //       next++
  //     }
  //   }
  // }

  async updateCarCidMap (dataCarCid, cids, head) {
    // this hydrates the map if it has not been hydrated
    const theCarMap = await this.getCidCarMap()
    for (const cid of cids) {
      theCarMap.set(cid, dataCarCid)
    }
  }
}
