import { ShardFetcher, ShardBlock, encodeShardBlock, decodeShardBlock } from './shard.js'

export { ShardFetcher, ShardBlock, encodeShardBlock, decodeShardBlock }

/**
 * @typedef {{ additions: import('./shard').ShardBlockView[], removals: import('./shard').ShardBlockView[] }} ShardDiff
 */

export const MaxKeyLength = 64
export const MaxShardSize = 512 * 1024

/**
 * @param {import('./shard').BlockFetcher} blocks
 * @param {import('./shard').ShardLink} root
 * @param {string} key
 * @param {import('./shard').AnyLink} value
 * @returns {Promise<{ root: import('./shard').ShardLink } & ShardDiff>}
 */
export async function put (blocks, root, key, value) {
  const shards = new ShardFetcher(blocks)
  const rshard = await shards.get(root)
  const path = await traverse(shards, rshard, key)
  const target = path[path.length - 1]

  let skey = key.slice(target.prefix.length) // key within the shard
  /** @type {import('./shard').ShardEntry} */
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

  if (child.bytes.length > MaxShardSize) {
    const common = findCommonPrefix(shard, entry[0])
    if (!common) throw new Error('shard limit reached')
    const { prefix, matches } = common
    const block = await encodeShardBlock(
      matches.map(([k, v]) => [k.slice(prefix.length), v]),
      target.prefix + prefix
    )
    shard = shard.filter(e => matches.some(m => e[0] !== m[0]))
    shard = putEntry(shard, [prefix, block.cid])
    child = await encodeShardBlock(shard, target.prefix)
  }

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
      return /** @type {import('./shard').ShardEntry} */(v[1] == null ? [k, [child.cid]] : [k, [child.cid, v[1]]])
    })

    child = await encodeShardBlock(value, parent.prefix)
    additions.push(child)
  }

  return { root: additions[additions.length - 1].cid, additions, removals: path }
}

/**
 * @param {import('./shard').Shard} shard
 * @param {string} skey Shard key to use as a base.
 */
function findCommonPrefix (shard, skey) {
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

/**
 * @param {import('./shard').Shard} target Shard to put to.
 * @param {import('./shard').ShardEntry} entry
 * @returns {import('./shard').Shard}
 */
function putEntry (target, entry) {
  if (!target.length) return [entry]

  /** @type {import('./shard').Shard} */
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
        /** @type {import('./shard').ShardEntry} */
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
    if (key.startsWith(k)) {
      if (!Array.isArray(v)) return [shard]
      const path = await traverse(shards, await shards.get(v[0], shard.prefix + k), key.slice(k.length))
      return [shard, ...path]
    }
  }
  return [shard]
}
