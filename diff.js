import { ShardFetcher } from './shard.js'

/**
 * @typedef {string} K
 * @typedef {[before: null, after: import('./link').AnyLink]} AddV
 * @typedef {[before: import('./link').AnyLink, after: import('./link').AnyLink]} UpdateV
 * @typedef {[before: import('./link').AnyLink, after: null]} DeleteV
 * @typedef {[key: K, value: AddV|UpdateV|DeleteV]} KV
 * @typedef {KV[]} KeysDiff
 * @typedef {{ keys: KeysDiff, shards: import('./index').ShardDiff }} CombinedDiff
 */

/**
 * @param {import('./block').BlockFetcher} blocks Bucket block storage.
 * @param {import('./shard').ShardLink} a Base DAG.
 * @param {import('./shard').ShardLink} b Comparison DAG.
 * @returns {Promise<CombinedDiff>}
 */
export async function difference (blocks, a, b, prefix = '') {
  if (isEqual(a, b)) return { keys: [], shards: { additions: [], removals: [] } }

  const shards = new ShardFetcher(blocks)
  const [ashard, bshard] = await Promise.all([shards.get(a, prefix), shards.get(b, prefix)])

  const aents = new Map(ashard.value)
  const bents = new Map(bshard.value)

  const keys = /** @type {Map<K, AddV|UpdateV|DeleteV>} */(new Map())
  const additions = new Map([[bshard.cid.toString(), bshard]])
  const removals = new Map([[ashard.cid.toString(), ashard]])

  // find shards removed in B
  for (const [akey, aval] of ashard.value) {
    const bval = bents.get(akey)
    if (bval) continue
    if (!Array.isArray(aval)) {
      keys.set(`${ashard.prefix}${akey}`, [aval, null])
      continue
    }
    // if shard link _with_ value
    if (aval[1] != null) {
      keys.set(`${ashard.prefix}${akey}`, [aval[1], null])
    }
    for await (const s of collect(shards, aval[0], `${ashard.prefix}${akey}`)) {
      for (const [k, v] of s.value) {
        if (!Array.isArray(v)) {
          keys.set(`${s.prefix}${k}`, [v, null])
        } else if (v[1] != null) {
          keys.set(`${s.prefix}${k}`, [v[1], null])
        }
      }
      removals.set(s.cid.toString(), s)
    }
  }

  // find shards added or updated in B
  for (const [bkey, bval] of bshard.value) {
    const aval = aents.get(bkey)
    if (!Array.isArray(bval)) {
      if (!aval) {
        keys.set(`${bshard.prefix}${bkey}`, [null, bval])
      } else if (Array.isArray(aval)) {
        keys.set(`${bshard.prefix}${bkey}`, [aval[1] ?? null, bval])
      } else if (!isEqual(aval, bval)) {
        keys.set(`${bshard.prefix}${bkey}`, [aval, bval])
      }
      continue
    }
    if (aval && Array.isArray(aval)) { // updated in B
      if (isEqual(aval[0], bval[0])) {
        if (bval[1] != null && (aval[1] == null || !isEqual(aval[1], bval[1]))) {
          keys.set(`${bshard.prefix}${bkey}`, [aval[1] ?? null, bval[1]])
        }
        continue // updated value?
      }
      const res = await difference(blocks, aval[0], bval[0], `${bshard.prefix}${bkey}`)
      for (const shard of res.shards.additions) {
        additions.set(shard.cid.toString(), shard)
      }
      for (const shard of res.shards.removals) {
        removals.set(shard.cid.toString(), shard)
      }
      for (const [k, v] of res.keys) {
        keys.set(k, v)
      }
    } else if (aval) { // updated in B value => link+value
      if (bval[1] == null) {
        keys.set(`${bshard.prefix}${bkey}`, [aval, null])
      } else if (!isEqual(aval, bval[1])) {
        keys.set(`${bshard.prefix}${bkey}`, [aval, bval[1]])
      }
      for await (const s of collect(shards, bval[0], `${bshard.prefix}${bkey}`)) {
        for (const [k, v] of s.value) {
          if (!Array.isArray(v)) {
            keys.set(`${s.prefix}${k}`, [null, v])
          } else if (v[1] != null) {
            keys.set(`${s.prefix}${k}`, [null, v[1]])
          }
        }
        additions.set(s.cid.toString(), s)
      }
    } else { // added in B
      keys.set(`${bshard.prefix}${bkey}`, [null, bval[0]])
      for await (const s of collect(shards, bval[0], `${bshard.prefix}${bkey}`)) {
        for (const [k, v] of s.value) {
          if (!Array.isArray(v)) {
            keys.set(`${s.prefix}${k}`, [null, v])
          } else if (v[1] != null) {
            keys.set(`${s.prefix}${k}`, [null, v[1]])
          }
        }
        additions.set(s.cid.toString(), s)
      }
    }
  }

  // filter blocks that were added _and_ removed from B
  for (const k of removals.keys()) {
    if (additions.has(k)) {
      additions.delete(k)
      removals.delete(k)
    }
  }

  return {
    keys: [...keys.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1),
    shards: { additions: [...additions.values()], removals: [...removals.values()] }
  }
}

/**
 * @param {import('./link').AnyLink} a
 * @param {import('./link').AnyLink} b
 */
const isEqual = (a, b) => a.toString() === b.toString()

/**
 * @param {import('./shard').ShardFetcher} shards
 * @param {import('./shard').ShardLink} root
 * @returns {AsyncIterableIterator<import('./shard').ShardBlockView>}
 */
async function * collect (shards, root, prefix = '') {
  const shard = await shards.get(root, prefix)
  yield shard
  for (const [k, v] of shard.value) {
    if (!Array.isArray(v)) continue
    yield * collect(shards, v[0], `${prefix}${k}`)
  }
}
