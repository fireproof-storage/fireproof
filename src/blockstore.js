import { parse } from 'multiformats/link'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'
import * as Block from 'multiformats/block'
import { CID } from 'multiformats/cid'
import * as CBW from '@ipld/car/buffer-writer'
import { CarReader } from '@ipld/car'

// const sleep = ms => new Promise(r => setTimeout(r, ms))

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
  #blocks = new Map()
  #oldBlocks = new Map()

  #valet = new Map() // cars by cid

  #instanceId = 'blkz.' + Math.random().toString(36).substring(2, 4)
  #transactionLabel = ''

  /**
   * Get a block from the store.
   *
   * @param {import('./link').AnyLink} cid
   * @returns {Promise<AnyBlock | undefined>}
   */
  async get (cid) {
    const key = cid.toString()
    const bytes = this.#blocks.get(key) || this.#oldBlocks.get(key) || await this.#valetGet(key)
    // const bytes = this.#blocks.get(key) || await this.#valetGet(key)
    // console.log('bytes', typeof bytes)
    if (!bytes) throw new Error('Missing block: ' + key)
    return { cid, bytes }
  }

  /**
   * Add a block to the store.
   *
   * @param {import('./link').AnyLink} cid
   * @param {Uint8Array} bytes
   */
  async put (cid, bytes) {
    // console.log('put', cid.toString())
    this.#blocks.set(cid.toString(), bytes)
    this.lastCid = cid
    // await sleep(5)
  }

  /**
   * Iterate over all blocks in the store.
   *
   * @yields {AnyBlock}
   * @returns {AsyncGenerator<AnyBlock>}
   */
  * entries () {
    for (const [str, bytes] of this.#blocks) {
      yield { cid: parse(str), bytes }
    }
    for (const [str, bytes] of this.#oldBlocks) {
      yield { cid: parse(str), bytes }
    }
  }

  /**
     * Begin a transaction. Ensures the uncommited blocks are empty at the begining.
     * Returns the blocks to read and write during the transaction.
     * @returns {Blockstore}
     * @memberof TransactionBlockstore
     */
  begin (label = '') {
    if (this.#blocks.size > 0) {
      const cids = Array.from(this.#blocks.entries()).map(([cid]) => (cid)).join(', ')
      console.trace(`Can't start new transaction ${label} b/c ${this.#transactionLabel} already in progress, blocks:`, cids)
      throw new Error(`Transaction ${this.#transactionLabel} already in progress: ${cids}`)
      // this.#blocks = new Map()
    }
    this.#transactionLabel = label
    return this
  }

  /**
     * Commit the transaction. Writes the blocks to the store.
     * @returns {Promise<void>}
     * @memberof TransactionBlockstore
     */
  async commit () {
    await this.#doCommit()
    this.#blocks = new Map()
  }

  #doCommit = async () => {
    for (const [str, bytes] of this.#blocks) {
      this.#oldBlocks.set(str, bytes)
    }
    const newCar = await blocksToCarBlock(this.lastCid, this.#blocks)
    this.#valet.set(newCar.cid.toString(), newCar.bytes)
  }

  /**
   * Internal function to load blocks from persistent storage.
   * Currently it just searches all the cars for the block, but in the future
   * we need to index the block CIDs to the cars, and reference that to find the block.
   * This index will also allow us to use accelerator links for the gateway when needed.
   * It can itself be a prolly tree...
   * @param {string} cid
   * @returns {Promise<Uint8Array|undefined>}
   */
  #valetGet = async (cid) => {
    for (const [, carBytes] of this.#valet) {
      const reader = await CarReader.fromBytes(carBytes)
      const gotBlock = await reader.get(CID.parse(cid))
      if (gotBlock) {
        return gotBlock.bytes
      }
    }
  }

  /**
     * Rollback the transaction. Clears the uncommited blocks.
     * @returns {void}
     * @memberof TransactionBlockstore
     */
  rollback () {
    this.#blocks = new Map()
  }
}

export const doTransaction = async (label, blockstore, doFun) => {
  if (!blockstore.commit) return await doFun(blockstore)
  try {
    const blocks = blockstore.begin(label)
    const result = await doFun(blocks)
    await blockstore.commit(label)
    return result
  } catch (e) {
    console.trace(`Transaction ${label} failed`, e)
    blockstore.rollback()
    throw e
  }
}

const blocksToCarBlock = async (lastCid, blocks) => {
  let size = 0
  const headerSize = CBW.headerLength({ roots: [lastCid] })
  size += headerSize
  for (const [cid, bytes] of blocks) {
    size += CBW.blockLength({ cid: CID.parse(cid), bytes })
  }
  const buffer = new Uint8Array(size)
  const writer = await CBW.createWriter(buffer, { headerSize })

  writer.addRoot(lastCid)

  for (const [cid, bytes] of blocks) {
    writer.write({ cid: CID.parse(cid), bytes })
  }
  await writer.close()
  return await Block.encode({ value: writer.bytes, hasher: sha256, codec: raw })
}
