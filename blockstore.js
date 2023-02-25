import { parse } from 'multiformats/link'
import Transaction from 'car-transaction'

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

  /**
   * Get a block from the store.
   *
   * @param {import('./link').AnyLink} cid
   * @returns {Promise<AnyBlock | undefined>}
   */
  async get (cid) {
    const key = cid.toString()
    const bytes = this.#blocks.get(key) || this.#oldBlocks.get(key)
    if (!bytes) return
    return { cid, bytes }
  }

  /**
   * Add a block to the store.
   *
   * @param {import('./link').AnyLink} cid
   * @param {Uint8Array} bytes
   */
  async put (cid, bytes) {
    // console.log('put', cid)
    this.#blocks.set(cid.toString(), bytes)
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
  begin () {
    if (this.#blocks.size > 0) {
      throw new Error('Transaction already in progress')
    }
    this.#blocks = new Map()
    return this
  }

  /**
     * Commit the transaction. Writes the blocks to the store.
     * @returns {Promise<void>}
     * @memberof TransactionBlockstore
     */
  async commit () {
    this.#doCommit()
    this.#blocks = new Map()
  }

  #doCommit = async () => {
    for (const [str, bytes] of this.#blocks) {
      this.#oldBlocks.set(str, bytes)
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
