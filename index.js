import {
  ShardFetcher,
  ShardBlock,
  encodeShardBlock,
  decodeShardBlock,
  putEntry,
  findCommonPrefix
} from './shard.js'

export { ShardBlock, encodeShardBlock, decodeShardBlock }

/**
 * @typedef {{ additions: import('./shard').ShardBlockView[], removals: import('./shard').ShardBlockView[] }} ShardDiff
 */

export const MaxKeyLength = 64
export const MaxShardSize = 512 * 1024

/**
 * @param {import('./shard').BlockFetcher} blocks Bucket block storage.
 * @param {import('./shard').ShardLink} root CID of the root node of the bucket.
 * @param {string} key
 * @param {import('./shard').AnyLink} value
 * @param {object} [options]
 * @param {number} [options.maxShardSize] Maximum shard size in bytes.
 * @returns {Promise<{ root: import('./shard').ShardLink } & ShardDiff>}
 */
export async function put (blocks, root, key, value, options = {}) {
  const shards = new ShardFetcher(blocks)
  const rshard = await shards.get(root)
  const path = await traverse(shards, rshard, key)
  const target = path[path.length - 1]

  let skey = key.slice(target.prefix.length) // key within the shard
  /** @type {import('./shard').ShardEntry} */
  let entry = [skey, value]

  /** @type {import('./shard.js').ShardBlockView[]} */
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

    let child = await encodeShardBlock([[pfxskeys[pfxskeys.length - 1].skey, value]], pfxskeys[pfxskeys.length - 1].prefix)
    additions.push(child)

    for (let i = pfxskeys.length - 2; i > 0; i--) {
      child = await encodeShardBlock([[pfxskeys[i].skey, [child.cid]]], pfxskeys[i].prefix)
      additions.push(child)
    }

    skey = pfxskeys[0].skey
    entry = [skey, [child.cid]]
  }

  /** @type {import('./shard').Shard} */
  let shard = putEntry(target.value, entry)
  let child = await encodeShardBlock(shard, target.prefix)

  if (child.bytes.length > (options.maxShardSize ?? MaxShardSize)) {
    const common = findCommonPrefix(shard, entry[0])
    if (!common) throw new Error('shard limit reached')
    const { prefix, matches } = common
    const block = await encodeShardBlock(
      matches.map(([k, v]) => [k.slice(prefix.length), v]),
      target.prefix + prefix
    )
    additions.push(block)

    shard = shard.filter(e => matches.every(m => e[0] !== m[0]))
    shard = putEntry(shard, [prefix, [block.cid]])
    child = await encodeShardBlock(shard, target.prefix)
  }

  additions.push(child)

  // path is root -> shard, so work backwards, propagating the new shard CID
  for (let i = path.length - 2; i >= 0; i--) {
    const parent = path[i]
    const key = child.prefix.slice(parent.prefix.length)
    const value = parent.value.map((entry) => {
      const [k, v] = entry
      if (k !== key) return entry
      if (!Array.isArray(v)) throw new Error(`"${key}" is not a shard link in: ${parent.cid}`)
      return /** @type {import('./shard').ShardEntry} */(v[1] == null ? [k, [child.cid]] : [k, [child.cid, v[1]]])
    })

    child = await encodeShardBlock(value, parent.prefix)
    additions.push(child)
  }

  return { root: additions[additions.length - 1].cid, additions, removals: path }
}

/**
 * @param {import('./shard').BlockFetcher} blocks
 * @param {import('./shard').ShardLink} root
 * @param {string} key
 * @returns {Promise<import('./shard').AnyLink | undefined>}
 */
export async function get (blocks, root, key) {
  const shards = new ShardFetcher(blocks)
  const rshard = await shards.get(root)
  const path = await traverse(shards, rshard, key)
  const target = path[path.length - 1]
  const skey = key.slice(target.prefix.length) // key within the shard
  const entry = target.value.find(([k]) => k === skey)
  if (!entry) return
  return Array.isArray(entry[1]) ? entry[1][1] : entry[1]
}

/**
 * Traverse from the passed shard block to the target shard block using the
 * passed key. All traversed shards are returned, starting with the passed
 * shard and ending with the target.
 *
 * @param {ShardFetcher} shards
 * @param {import('./shard').ShardBlockView} shard
 * @param {string} key
 * @returns {Promise<[import('./shard').ShardBlockView, ...Array<import('./shard').ShardBlockView>]>}
 */
async function traverse (shards, shard, key) {
  for (const [k, v] of shard.value) {
    if (key === k) return [shard]
    if (key.startsWith(k) && Array.isArray(v)) {
      const path = await traverse(shards, await shards.get(v[0], shard.prefix + k), key.slice(k.length))
      return [shard, ...path]
    }
  }
  return [shard]
}
