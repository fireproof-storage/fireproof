import { parse } from 'multiformats/link'

/**
 * @typedef {{ cid: import('./link').AnyLink, bytes: Uint8Array }} AnyBlock
 * @typedef {{ get: (link: import('./link').AnyLink) => Promise<AnyBlock | undefined> }} BlockFetcher
 */

/** @implements {BlockFetcher} */
export class MemoryBlockstore {
  /** @type {Map<string, Uint8Array>} */
  #blocks = new Map()

  /**
   * @param {import('./link').AnyLink} cid
   * @returns {Promise<AnyBlock | undefined>}
   */
  async get (cid) {
    const bytes = this.#blocks.get(cid.toString())
    if (!bytes) return
    return { cid, bytes }
  }

  /**
   * @param {import('./link').AnyLink} cid
   * @param {Uint8Array} bytes
   */
  async put (cid, bytes) {
    this.#blocks.set(cid.toString(), bytes)
  }

  /**
   * @param {import('./link').AnyLink} cid
   * @param {Uint8Array} bytes
   */
  putSync (cid, bytes) {
    this.#blocks.set(cid.toString(), bytes)
  }

  /** @param {import('./link').AnyLink} cid */
  async delete (cid) {
    this.#blocks.delete(cid.toString())
  }

  /** @param {import('./link').AnyLink} cid */
  deleteSync (cid) {
    this.#blocks.delete(cid.toString())
  }

  * entries () {
    for (const [str, bytes] of this.#blocks) {
      yield { cid: parse(str), bytes }
    }
  }
}
