import { parse } from 'multiformats/link'

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

  /**
   * Get a block from the store.
   *
   * @param {import('./link').AnyLink} cid
   * @returns {Promise<AnyBlock | undefined>}
   */
  async get (cid) {
    const bytes = this.#blocks.get(cid.toString())
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
  }
}
