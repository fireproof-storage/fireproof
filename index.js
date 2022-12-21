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
  const shards = new ShardFetcher(blocks)
  const rshard = await shards.get(root)
  const path = await traverse(shards, rshard, key)
  const target = path[path.length - 1]
  const suffix = key.slice(target.prefix.length)

  /** @type {Shard} */
  const shard = []
  if (target.value.length) {
    for (const [i, [k, v]] of target.value.entries()) {
      if (suffix === k) {
        // shard as well as value?
        /** @type {ShardEntry} */
        const newEntry = Array.isArray(v) ? [k, [v[0], value]] : [k, value]
        shard.push(newEntry, ...target.value.slice(i + 1))
        break
      }
      if (i === 0 && suffix < k) {
        shard.push([suffix, value], ...target.value.slice(i))
        break
      }
      if (i > 0 && suffix > target.value[i][0] && suffix < k) {
        shard.push([suffix, value], ...target.value.slice(i))
        break
      }
      shard.push([k, v])
    }
  } else {
    shard.push([key, value])
  }

  // TODO: check if too big

  const { cid, bytes } = await encode({ value, codec: cbor, hasher: sha256 })
  let child = new ShardBlock({ cid, value: shard, bytes, prefix: target.prefix })

  /** @type {[ShardBlock, ...ShardBlock[]]} */
  const additions = [child]

  // path is root -> shard, so work backwards, propagating the new shard CID
  for (let i = path.length - 2; i >= 0; i--) {
    const parent = path[i]
    const key = child.prefix.slice(parent.prefix.length)
    const value = parent.value.map((entry) => {
      const [k, v] = entry
      if (k !== key) return entry
      if (!Array.isArray(v)) throw new Error(`"${key}" is not a shard link in: ${parent.cid}`)
      return /** @type {ShardEntry} */(v[1] == null ? [k, [child.cid]] : [k, [child.cid, v[1]]])
    })

    const { cid, bytes } = await encode({ value, codec: cbor, hasher: sha256 })
    child = new ShardBlock({ cid, value, bytes, prefix: parent.prefix })
    additions.push(child)
  }

  return { root: additions[additions.length - 1].cid, additions, removals: path }
}

/**
 * Traverse from the passed shard block to the target shard block using the
 * passed key. All traversed shards are returned, starting with the passed
 * shard and ending with the target.
 *
 * @param {ShardFetcher} shards
 * @param {ShardBlockView} shard
 * @param {string} key
 * @returns {Promise<[ShardBlockView, ...Array<ShardBlockView>]>}
 */
async function traverse (shards, shard, key) {
  for (const [k, v] of shard.value) {
    if (key === k) return [shard]
    if (key.startsWith(k)) {
      if (!Array.isArray(v)) return [shard]
      const path = await traverse(shards, await shards.get(v[0], shard.prefix + k), key.slice(k.length))
      return [shard, ...path]
    }
  }
  return [shard]
}

class ShardFetcher {
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

    /** @type {Shard} */
    const value = cbor.decode(block.bytes)
    if (!Array.isArray(value)) throw new Error(`invalid shard: ${link}`)

    // @ts-expect-error
    return new ShardBlock({ cid: block.cid, value, bytes: block.bytes, prefix })
  }
}
