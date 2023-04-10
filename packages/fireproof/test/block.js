import { parse } from 'multiformats/link'

/**
 * @typedef {{ cid: import('../src/link').AnyLink, bytes: Uint8Array }} AnyBlock
 * @typedef {{ get: (link: import('../src/link').AnyLink) => Promise<AnyBlock | undefined> }} BlockFetcher
 */

/** @implements {BlockFetcher} */
export class MemoryBlockstore {
  /** @type {Map<string, Uint8Array>} */
  blocks = new Map()

  /**
   * @param {import('../src/link').AnyLink} cid
   * @returns {Promise<AnyBlock | undefined>}
   */
  async get (cid) {
    const bytes = this.blocks.get(cid.toString())
    if (!bytes) return
    return { cid, bytes }
  }

  /**
   * @param {import('../src/link').AnyLink} cid
   * @param {Uint8Array} bytes
   */
  async put (cid, bytes) {
    // console.log('put', cid)
    this.blocks.set(cid.toString(), bytes)
  }

  /**
   * @param {import('../src/link').AnyLink} cid
   * @param {Uint8Array} bytes
   */
  putSync (cid, bytes) {
    this.blocks.set(cid.toString(), bytes)
  }

  * entries () {
    for (const [str, bytes] of this.blocks) {
      yield { cid: parse(str), bytes }
    }
  }
}

export class MultiBlockFetcher {
  /** @type {BlockFetcher[]} */
  fetchers

  /** @param {BlockFetcher[]} fetchers */
  constructor (...fetchers) {
    this.fetchers = fetchers
  }

  /** @param {import('../src/link').AnyLink} link */
  async get (link) {
    for (const f of this.fetchers) {
      const v = await f.get(link)
      if (v) {
        return v
      }
    }
  }
}
