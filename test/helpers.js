import crypto from 'node:crypto'
import assert from 'node:assert'
import { CID } from 'multiformats/cid'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'
import { decodeShardBlock } from '../index.js'

/** @param {number} size */
export async function randomCID (size) {
  const hash = await sha256.digest(await randomBytes(size))
  return CID.create(1, raw.code, hash)
}

/** @param {number} size */
export async function randomBytes (size) {
  const bytes = new Uint8Array(size)
  while (size) {
    const chunk = new Uint8Array(Math.min(size, 65_536))
    crypto.getRandomValues(chunk)
    size -= bytes.length
    bytes.set(chunk, size)
  }
  return bytes
}

export class Blockstore {
  /** @type {Map<string, Uint8Array>} */
  #blocks = new Map()

  /**
   * @param {import('../shard').AnyLink} cid
   * @returns {Promise<import('../shard').AnyBlock | undefined>}
   */
  async get (cid) {
    const bytes = this.#blocks.get(cid.toString())
    if (!bytes) return
    return { cid, bytes }
  }

  /**
   * @param {import('../shard').ShardLink} cid
   * @param {string} [prefix]
   */
  async getShardBlock (cid, prefix) {
    const blk = await this.get(cid)
    assert(blk)
    return decodeShardBlock(blk.bytes, prefix)
  }

  /**
   * @param {import('../shard').AnyLink} cid
   * @param {Uint8Array} bytes
   */
  async put (cid, bytes) {
    this.#blocks.set(cid.toString(), bytes)
  }
}
