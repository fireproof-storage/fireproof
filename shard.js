import { Block, encode, decode } from 'multiformats/block'
import { sha256 } from 'multiformats/hashes/sha2'
import * as cbor from '@ipld/dag-cbor'

/**
 * @typedef {import('multiformats').Link<unknown, number, number, 1|0>} AnyLink
 * @typedef {{ cid: AnyLink, bytes: Uint8Array }} AnyBlock
 * @typedef {{ get: (link: AnyLink) => Promise<AnyBlock | undefined> }} BlockFetcher
 * @typedef {AnyLink} ShardEntryValueValue
 * @typedef {[ShardLink]} ShardEntryLinkValue
 * @typedef {[ShardLink, AnyLink]} ShardEntryLinkAndValueValue
 * @typedef {[key: string, value: ShardEntryValueValue]} ShardValueEntry
 * @typedef {[key: string, value: ShardEntryLinkValue | ShardEntryLinkAndValueValue]} ShardLinkEntry
 * @typedef {[key: string, value: ShardEntryValueValue | ShardEntryLinkValue | ShardEntryLinkAndValueValue]} ShardEntry
 * @typedef {ShardEntry[]} Shard
 * @typedef {import('multiformats').Link<Shard, typeof cbor.code, typeof sha256.code, 1>} ShardLink
 * @typedef {import('multiformats').BlockView<Shard, typeof cbor.code, typeof sha256.code, 1> & { prefix: string }} ShardBlockView
 */

/** @implements {ShardBlockView} */
export class ShardBlock extends Block {
  /**
   * @param {object} config
   * @param {ShardLink} config.cid
   * @param {Shard} config.value
   * @param {Uint8Array} config.bytes
   * @param {string} config.prefix
   */
  constructor ({ cid, value, bytes, prefix }) {
    // @ts-expect-error
    super({ cid, value, bytes })
    this.prefix = prefix
  }

  static create () {
    return encodeShardBlock([])
  }
}

/**
 * @param {Shard} value
 * @param {string} [prefix]
 * @returns {Promise<ShardBlockView>}
 */
export async function encodeShardBlock (value, prefix) {
  const { cid, bytes } = await encode({ value, codec: cbor, hasher: sha256 })
  return new ShardBlock({ cid, value, bytes, prefix: prefix ?? '' })
}

/**
 * @param {Uint8Array} bytes
 * @param {string} [prefix]
 * @returns {Promise<ShardBlockView>}
 */
export async function decodeShardBlock (bytes, prefix) {
  const { cid, value } = await decode({ bytes, codec: cbor, hasher: sha256 })
  if (!Array.isArray(value)) throw new Error(`invalid shard: ${cid}`)
  return new ShardBlock({ cid, value, bytes, prefix: prefix ?? '' })
}

export class ShardFetcher {
  /**
   * @param {BlockFetcher} blocks
   */
  constructor (blocks) {
    this._blocks = blocks
  }

  /**
   * @param {ShardLink} link
   * @param {string} [prefix]
   * @returns {Promise<ShardBlockView>}
   */
  async get (link, prefix = '') {
    const block = await this._blocks.get(link)
    if (!block) throw new Error(`missing block: ${link}`)
    return decodeShardBlock(block.bytes, prefix)
  }
}

/**
 * @param {Shard} target Shard to put to.
 * @param {ShardEntry} entry
 * @returns {Shard}
 */
export function putEntry (target, entry) {
  if (!target.length) return [entry]

  /** @type {Shard} */
  const shard = []
  for (const [i, [k, v]] of target.entries()) {
    if (entry[0] === k) {
      // if new value is link to shard...
      if (Array.isArray(entry[1])) {
        // and old value is link to shard
        // and old value is _also_ link to data
        // and new value does not have link to data
        // then preserve old data
        if (Array.isArray(v) && v[1] != null && entry[1][1] == null) {
          shard.push([k, [entry[1][0], v[1]]], ...target.slice(i + 1))
        } else {
          shard.push(entry, ...target.slice(i + 1))
        }
      } else {
        // shard as well as value?
        /** @type {ShardEntry} */
        const newEntry = Array.isArray(v) ? [k, [v[0], entry[1]]] : entry
        shard.push(newEntry, ...target.slice(i + 1))
      }
      return shard
    }
    if (i === 0 && entry[0] < k) {
      shard.push(entry, ...target.slice(i))
      return shard
    }
    if (i > 0 && entry[0] > target[i - 1][0] && entry[0] < k) {
      shard.push(entry, ...target.slice(i))
      return shard
    }
    shard.push([k, v])
  }

  shard.push(entry)
  return shard
}

/**
 * @param {import('./shard').Shard} shard
 * @param {string} skey Shard key to use as a base.
 */
export function findCommonPrefix (shard, skey) {
  const startidx = shard.findIndex(([k]) => skey === k)
  if (startidx === -1) throw new Error(`key not found in shard: ${skey}`)
  let i = startidx
  let pfx
  while (true) {
    pfx = shard[i][0].slice(0, -1)
    if (pfx.length) {
      while (true) {
        const matches = shard.filter(entry => entry[0].startsWith(pfx))
        if (matches.length > 1) return { prefix: pfx, matches }
        pfx = pfx.slice(0, -1)
        if (!pfx.length) break
      }
    }
    i++
    if (i >= shard.length) {
      i = 0
    }
    if (i === startidx) {
      return
    }
  }
}
