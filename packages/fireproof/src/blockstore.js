// import { Buffer } from 'buffer'
// globalThis.Buffer = Buffer
// import { Readable, createWriteStream } from 'fs'
// import { CarWriter } from '@ipld/car'
// import { randomBytes } from 'crypto'
// import { CID } from 'multiformats'
import {
  encrypt
  // , decrypt
} from './crypto.js'
// import { blocksToCarBlock } from 'ipsql/utils'
// import { create } from 'prolly-trees/cid-set'

import { parse } from 'multiformats/link'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'
import * as Block from 'multiformats/block'
import * as CBW from '@ipld/car/buffer-writer'
import { CID } from 'multiformats'

import Valet from './valet.js'

const KEY_MATERIAL = typeof process !== 'undefined' ? process.env.KEY_MATERIAL : (import.meta && import.meta.env.VITE_KEY_MATERIAL)

// const sleep = ms => new Promise(r => setTimeout(r, ms))

const husherMap = new Map()
const husher = (id, workFn) => {
  if (!husherMap.has(id)) {
    husherMap.set(
      id,
      workFn().finally(() => setTimeout(() => husherMap.delete(id), 100))
    )
  }
  return husherMap.get(id)
}

/**
 * @typedef {Object} AnyBlock
 * @property {import('./link').AnyLink} cid - The CID of the block
 * @property {Uint8Array} bytes - The block's data
 *
 * @typedef {Object} Blockstore
 * @property {function(import('./link').AnyLink): Promise<AnyBlock|undefined>} get - A function to retrieve a block by CID
 * @property {function(import('./link').AnyLink, Uint8Array): Promise<void>} put - A function to store a block's data and CID
 *
 * A blockstore that caches writes to a transaction and only persists them when committed.
 * @implements {Blockstore}
 */
export default class TransactionBlockstore {
  /** @type {Map<string, Uint8Array>} */
  #oldBlocks = new Map()

  valet = null

  #instanceId = 'blkz.' + Math.random().toString(36).substring(2, 4)
  #inflightTransactions = new Set()
  #encryptionActive = false

  constructor (name) {
    this.valet = new Valet(name)
    if (KEY_MATERIAL) {
      this.#encryptionActive = true
    }
  }

  /**
   * Get a block from the store.
   *
   * @param {import('./link').AnyLink} cid
   * @returns {Promise<AnyBlock | undefined>}
   */
  async get (cid) {
    const key = cid.toString()
    // it is safe to read from the in-flight transactions becauase they are immutable
    const bytes = await Promise.any([this.#transactionsGet(key), this.commitedGet(key)]).catch((e) => {
      // console.log('networkGet', cid.toString(), e)
      return this.networkGet(key)
    })
    if (!bytes) throw new Error('Missing block: ' + key)
    return { cid, bytes }
  }

  // this iterates over the in-flight transactions
  // and returns the first matching block it finds
  async #transactionsGet (key) {
    for (const transaction of this.#inflightTransactions) {
      const got = await transaction.get(key)
      if (got && got.bytes) return got.bytes
    }
    throw new Error('Missing block: ' + key)
  }

  async commitedGet (key) {
    const old = this.#oldBlocks.get(key)
    if (old) return old
    return await this.valet.getBlock(key)
  }

  async networkGet (key) {
    if (this.valet.remoteBlockFunction) {
      const value = await husher(key, async () => await this.valet.remoteBlockFunction(key))
      if (value) {
        // console.log('networkGot: ' + key, value.length)
        doTransaction('networkGot: ' + key, this, async (innerBlockstore) => {
          await innerBlockstore.put(CID.parse(key), value)
        })
        return value
      }
    } else {
      return false
    }
  }

  /**
   * Add a block to the store. Usually bound to a transaction by a closure.
   * It sets the lastCid property to the CID of the block that was put.
   * This is used by the transaction as the head of the car when written to the valet.
   * We don't have to worry about which transaction we are when we are here because
   * we are the transactionBlockstore.
   *
   * @param {import('./link').AnyLink} cid
   * @param {Uint8Array} bytes
   */
  put (cid, bytes) {
    throw new Error('use a transaction to put')
  }

  /**
   * Iterate over all blocks in the store.
   *
   * @yields {AnyBlock}
   * @returns {AsyncGenerator<AnyBlock>}
   */
  // * entries () {
  //   // needs transaction blocks?
  //   // for (const [str, bytes] of this.#blocks) {
  //   //   yield { cid: parse(str), bytes }
  //   // }
  //   for (const [str, bytes] of this.#oldBlocks) {
  //     yield { cid: parse(str), bytes }
  //   }
  // }

  /**
   * Begin a transaction. Ensures the uncommited blocks are empty at the begining.
   * Returns the blocks to read and write during the transaction.
   * @returns {InnerBlockstore}
   * @memberof TransactionBlockstore
   */
  begin (label = '') {
    const innerTransactionBlockstore = new InnerBlockstore(label, this)
    this.#inflightTransactions.add(innerTransactionBlockstore)
    return innerTransactionBlockstore
  }

  /**
   * Commit the transaction. Writes the blocks to the store.
   * @returns {Promise<void>}
   * @memberof TransactionBlockstore
   */
  async commit (innerBlockstore) {
    await this.#doCommit(innerBlockstore)
  }

  // first get the transaction blockstore from the map of transaction blockstores
  // then copy it to oldBlocks
  // then write the transaction blockstore to a car
  // then write the car to the valet
  // then remove the transaction blockstore from the map of transaction blockstores
  #doCommit = async (innerBlockstore) => {
    const cids = new Set()
    for (const { cid, bytes } of innerBlockstore.entries()) {
      const stringCid = cid.toString() // unnecessary string conversion, can we fix upstream?
      if (this.#oldBlocks.has(stringCid)) {
        // console.log('Duplicate block: ' + stringCid)
      } else {
        this.#oldBlocks.set(stringCid, bytes)
        cids.add(stringCid)
      }
    }
    if (cids.size > 0) {
      // console.log(innerBlockstore.label, 'committing', cids.size, 'blocks')
      await this.#valetWriteTransaction(innerBlockstore, cids)
    }
  }

  /**
   * Group the blocks into a car and write it to the valet.
   * @param {InnerBlockstore} innerBlockstore
   * @param {Set<string>} cids
   * @returns {Promise<void>}
   * @memberof TransactionBlockstore
   * @private
   */
  #valetWriteTransaction = async (innerBlockstore, cids) => {
    if (innerBlockstore.lastCid) {
      if (this.#encryptionActive) {
        console.log('encrypting car', innerBlockstore.label)
        const newCar = await blocksToEncryptedCarBlock(innerBlockstore.lastCid, innerBlockstore)
        // todo we need to return the cid map from blocksToEncryptedCarBlock
        await this.valet.parkCar(newCar.cid.toString(), newCar.bytes, cids)
      } else {
        const newCar = await blocksToCarBlock(innerBlockstore.lastCid, innerBlockstore)
        await this.valet.parkCar(newCar.cid.toString(), newCar.bytes, cids)
      }
    }
  }

  /**
   * Retire the transaction. Clears the uncommited blocks.
   * @returns {void}
   * @memberof TransactionBlockstore
   */
  retire (innerBlockstore) {
    this.#inflightTransactions.delete(innerBlockstore)
  }
}

/**
 * Runs a function on an inner blockstore, then persists the change to a car writer
 * or other outer blockstore.
 * @param {string} label
 * @param {TransactionBlockstore} blockstore
 * @param {(innerBlockstore: Blockstore) => Promise<any>} doFun
 * @returns {Promise<any>}
 * @memberof TransactionBlockstore
 */
export const doTransaction = async (label, blockstore, doFun) => {
  if (!blockstore.commit) return await doFun(blockstore)
  const innerBlockstore = blockstore.begin(label)
  try {
    const result = await doFun(innerBlockstore)
    await blockstore.commit(innerBlockstore)
    return result
  } catch (e) {
    console.error(`Transaction ${label} failed`, e, e.stack)
    throw e
  } finally {
    blockstore.retire(innerBlockstore)
  }
}

const blocksToCarBlock = async (lastCid, blocks) => {
  let size = 0
  const headerSize = CBW.headerLength({ roots: [lastCid] })
  size += headerSize
  for (const { cid, bytes } of blocks.entries()) {
    size += CBW.blockLength({ cid, bytes })
  }
  const buffer = new Uint8Array(size)
  const writer = await CBW.createWriter(buffer, { headerSize })

  writer.addRoot(lastCid)

  for (const { cid, bytes } of blocks.entries()) {
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
    hasher: 'sha2-256',
    codec: 'dag-cbor',
    root: lastCid
  })) {
    encryptedBlocks.push(block)
    last = block
  }

  const encryptedCar = await blocksToCarBlock(last.cid, encryptedBlocks)
  return encryptedCar
}

// const blocksFromEncryptedCarBlock = async (cid, get) => {
//   const decryptionKey = Buffer.from(KEY_MATERIAL, 'hex')
//   const cids = new Set()
//   const decryptedBlocks = []
//   for await (const block of decrypt({
//     root: cid,
//     get,
//     key: decryptionKey,
//     hasher: 'sha2-256',
//     codec: 'dag-cbor'
//   })) {
//     decryptedBlocks.push(block)
//     cids.add(block.cid.toString())
//   }
//   return { blocks: decryptedBlocks, cids }
// }

/** @implements {BlockFetcher} */
export class InnerBlockstore {
  /** @type {Map<string, Uint8Array>} */
  #blocks = new Map()
  lastCid = null
  label = ''
  parentBlockstore = null

  constructor (label, parentBlockstore) {
    this.label = label
    this.parentBlockstore = parentBlockstore
  }

  /**
   * @param {import('./link').AnyLink} cid
   * @returns {Promise<AnyBlock | undefined>}
   */
  async get (cid) {
    const key = cid.toString()
    let bytes = this.#blocks.get(key)
    if (bytes) { return { cid, bytes } }
    bytes = await this.parentBlockstore.commitedGet(key)
    if (bytes) {
      return { cid, bytes }
    }
  }

  /**
   * @param {import('./link').AnyLink} cid
   * @param {Uint8Array} bytes
   */
  put (cid, bytes) {
    // console.log('put', cid)
    this.#blocks.set(cid.toString(), bytes)
    this.lastCid = cid
  }

  * entries () {
    for (const [str, bytes] of this.#blocks) {
      yield { cid: parse(str), bytes }
    }
  }
}
