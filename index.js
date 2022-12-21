import { Block, encode } from 'multiformats/block'
import { sha256 } from 'multiformats/hashes/sha2'
import * as cbor from '@ipld/dag-cbor'

/**
 * @typedef {import('multiformats').Link<unknown, number, number, 1|0>} AnyLink
 * @typedef {{ cid: AnyLink, bytes: Uint8Array }} AnyBlock
 * @typedef {{ get: (link: AnyLink) => Promise<AnyBlock | undefined> }} BlockFetcher
 * @typedef {[key: string, value: AnyLink | ShardLinkValue ]} ShardEntry
 * @typedef {ShardEntry[]} Shard
 * @typedef {import('multiformats').Link<Shard, typeof cbor.code, typeof sha256.code, 1>} ShardLink
 * @typedef {[ShardLink] | [ShardLink, AnyLink]} ShardLinkValue
 * @typedef {import('multiformats').BlockView<Shard, typeof cbor.code, typeof sha256.code, 1> & { prefix: string }} ShardBlockView
 * @typedef {{ additions: ShardBlockView[], removals: ShardBlockView[] }} ShardDiff
 * @typedef {{ get: (link: ShardLink, prefix?: string) => Promise<ShardBlockView> }} ShardFetcher
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

  /**
   * @param {string} [prefix]
   * @returns {Promise<ShardBlock>}
   */
  static async create (prefix) {
    const value = []
    const { cid, bytes } = await encode({ value, codec: cbor, hasher: sha256 })
    return new ShardBlock({ cid, value, bytes, prefix: prefix ?? '' })
  }
}

/**
 * @param {BlockFetcher} blocks
 * @param {ShardLink} root
 * @param {string} key
 * @param {AnyLink} value
 * @returns {Promise<{ root: ShardLink } & ShardDiff>}
 */
export async function put (blocks, root, key, value) {
  const shards = toShardFetcher(blocks)
  const rootShard = await shards.get(root)
  const path = await findShard(shards, rootShard, key)
  const target = path[path.length - 1]
  const suffix = key.slice(target.prefix.length)

  const additions = []
  const removals = [...path]

  /** @type {Shard} */
  const shard = []
  /** @type {ShardEntry|undefined} */
  let prev
  for (const entry of target.value) {
    const [k, v] = entry
    if (suffix === k) {
      // shard as well as value?
      if (Array.isArray(v)) {
        shard.push([k, [v[0], value]])
      } else {
        shard.push([k, value])
      }
      prev = entry
      continue
    }
    if (!prev && suffix < k) {
      shard.push([suffix, value], entry)
      prev = entry
      continue
    }
    if (prev && suffix > prev[0] && suffix < k) {
      shard.push([suffix, value], entry)
      prev = entry
      continue
    }
    shard.push(entry)
    prev = entry
  }

  // TODO: check if too big

  const { cid, bytes } = await encode({ value, codec: cbor, hasher: sha256 })
  let replacement = new ShardBlock({ cid, value: shard, bytes, prefix: target.prefix })
  additions.push(replacement)

  // path is root -> shard, so work backwards, propagating the new shard CID
  for (let i = path.length - 2; i >= 0; i--) {
    const key = replacement.prefix.slice(path[i].prefix.length)
    const entry = path[i].value.find(([k]) => k === key)
    if (!entry) throw new Error(`"${key}" not found in shard: ${path[i].cid}`)
    const [, value] = entry
    if (!Array.isArray(value)) throw new Error(`"${key}" is not a shard link in: ${path[i].cid}`)
    value[0] = replacement.cid

    const { cid, bytes } = await encode({ value: path[i].value, codec: cbor, hasher: sha256 })
    replacement = new ShardBlock({ cid, value: path[i].value, bytes, prefix: path[i].prefix })
    additions.push(replacement)
  }

  return { root: additions.at(-1)?.cid, additions, removals }
}

/**
 * @param {ShardFetcher} shards
 * @param {ShardBlockView} shard
 * @param {string} key
 * @returns {Promise<[ShardBlockView, ...Array<ShardBlockView>]>}
 */
async function findShard (shards, shard, key) {
  for (const [k, v] of shard.value) {
    if (key === k) return [shard]
    if (key.startsWith(k)) {
      if (!Array.isArray(v)) return [shard]
      const path = await findShard(shards, await shards.get(v[0], shard.prefix + k), key.slice(k.length))
      return [shard, ...path]
    }
  }
  return [shard]
}

/**
 * @param {BlockFetcher} blocks
 * @returns {ShardFetcher}
 */
function toShardFetcher (blocks) {
  return {
    /**
     * @param {ShardLink} link
     * @param {string} [prefix]
     */
    async get (link, prefix = '') {
      const block = await blocks.get(link)
      if (!block) throw new Error(`missing block: ${link}`)

      /** @type {Shard} */
      const value = cbor.decode(block.bytes)
      if (!Array.isArray(value)) throw new Error(`invalid shard: ${link}`)

      // @ts-expect-error
      return new ShardBlock({ cid: block.cid, value, bytes: block.bytes, prefix })
    }
  }
}
