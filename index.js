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

export const MaxKeyLength = 64

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
    return newShardBlock([])
  }
}

/**
 * @param {Shard} value
 * @param {string} [prefix]
 */
async function newShardBlock (value, prefix) {
  const { cid, bytes } = await encode({ value, codec: cbor, hasher: sha256 })
  return new ShardBlock({ cid, value, bytes, prefix: prefix ?? '' })
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

  let skey = key.slice(target.prefix.length) // key within the shard
  /** @type {ShardEntry} */
  let entry = [skey, value]

  /** @type {ShardBlock[]} */
  const additions = []

  // if the key in this shard is longer than allowed, then we need to make some
  // intermediate shards.
  if (skey.length > MaxKeyLength) {
    const pfxskeys = Array.from(Array(Math.ceil(skey.length / MaxKeyLength)), (_, i) => {
      const start = i * MaxKeyLength
      return {
        prefix: target.prefix + skey.slice(0, start),
        skey: skey.slice(start, start + MaxKeyLength)
      }
    })

    let child = await newShardBlock([[pfxskeys[pfxskeys.length - 1].skey, value]], pfxskeys[pfxskeys.length - 1].prefix)
    additions.push(child)

    for (let i = pfxskeys.length - 2; i > 0; i--) {
      child = await newShardBlock([[pfxskeys[i].skey, [child.cid]]], pfxskeys[i].prefix)
      additions.push(child)
    }

    skey = pfxskeys[0].skey
    entry = [skey, [child.cid]]
  }

  /** @type {Shard} */
  const shard = putEntry(target.value, entry)

  // TODO: check if too big

  let child = await newShardBlock(shard, target.prefix)
  /** @type {[ShardBlock, ...ShardBlock[]]} */
  additions.push(child)

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

    child = await newShardBlock(value, parent.prefix)
    additions.push(child)
  }

  return { root: additions[additions.length - 1].cid, additions, removals: path }
}

/**
 * @param {Shard} target Shard to put to.
 * @param {ShardEntry} entry
 * @returns {Shard}
 */
function putEntry (target, entry) {
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
      break
    }
    if (i === 0 && entry[0] < k) {
      shard.push(entry, ...target.slice(i))
      break
    }
    if (i > 0 && entry[0] > target[i][0] && entry[0] < k) {
      shard.push(entry, ...target.slice(i))
      break
    }
    shard.push([k, v])
  }

  return shard
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
