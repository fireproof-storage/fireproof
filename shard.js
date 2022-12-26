import { Block, encode, decode } from 'multiformats/block'
import { sha256 } from 'multiformats/hashes/sha2'
import * as cbor from '@ipld/dag-cbor'

/**
 * @typedef {import('multiformats').Link<unknown, number, number, 1|0>} AnyLink
 * @typedef {{ cid: AnyLink, bytes: Uint8Array }} AnyBlock
 * @typedef {{ get: (link: AnyLink) => Promise<AnyBlock | undefined> }} BlockFetcher
 * @typedef {AnyLink} ShardEntryValueValue
 * @typedef {[ShardLink]} ShardEntryLinkValue
 * @typedef {[ShardLink, AnyLink]} ShardEntryLinkOrValueValue
 * @typedef {[key: string, value: ShardEntryValueValue]} ShardValueEntry
 * @typedef {[key: string, value: ShardEntryValueValue | ShardEntryLinkValue | ShardEntryLinkOrValueValue]} ShardEntry
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
 */
export async function encodeShardBlock (value, prefix) {
  const { cid, bytes } = await encode({ value, codec: cbor, hasher: sha256 })
  return new ShardBlock({ cid, value, bytes, prefix: prefix ?? '' })
}

/**
 * @param {Uint8Array} bytes
 * @param {string} [prefix]
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
