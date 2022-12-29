import { CID } from 'multiformats/cid'

export class MemoryBlockstore {
  /** @type {Map<string, Uint8Array>} */
  #blocks = new Map()

  /**
   * @param {import('./shard').AnyLink} cid
   * @returns {Promise<import('./shard').AnyBlock | undefined>}
   */
  async get (cid) {
    const bytes = this.#blocks.get(cid.toString())
    if (!bytes) return
    return { cid, bytes }
  }

  /**
   * @param {import('./shard').AnyLink} cid
   * @param {Uint8Array} bytes
   */
  async put (cid, bytes) {
    this.#blocks.set(cid.toString(), bytes)
  }

  /**
   * @param {import('./shard').AnyLink} cid
   * @param {Uint8Array} bytes
   */
  putSync (cid, bytes) {
    this.#blocks.set(cid.toString(), bytes)
  }

  /** @param {import('./shard').AnyLink} cid */
  async delete (cid) {
    this.#blocks.delete(cid.toString())
  }

  /** @param {import('./shard').AnyLink} cid */
  deleteSync (cid) {
    this.#blocks.delete(cid.toString())
  }

  * entries () {
    for (const [str, bytes] of this.#blocks) {
      yield { cid: CID.parse(str), bytes }
    }
  }
}
