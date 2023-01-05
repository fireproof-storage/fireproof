import { ShardFetcher } from './shard.js'

/**
 * @typedef {string} K
 * @typedef {[before: import('./shard.js').AnyLink|null, after: import('./shard.js').AnyLink|null]} V
 * @typedef {[key: K, value: V]} KV
 * @typedef {{ puts: KV[], dels: KV[] }} KVDiff
 * @typedef {{ kvs: KVDiff, shards: import('./index').ShardDiff }} CombinedDiff
 */

/**
 * @param {import('./shard').BlockFetcher} blocks Bucket block storage.
 * @param {import('./shard').ShardLink} a Base DAG.
 * @param {import('./shard').ShardLink} b Comparison DAG.
 * @returns {Promise<CombinedDiff>}
 */
export async function difference (blocks, a, b, prefix = '') {
  if (isEqual(a, b)) return { kvs: { puts: [], dels: [] }, shards: { additions: [], removals: [] } }

  const shards = new ShardFetcher(blocks)
  const [ashard, bshard] = await Promise.all([shards.get(a), shards.get(b)])

  const aents = new Map(ashard.value)
  const bents = new Map(bshard.value)

  const puts = /** @type {Map<K, V>} */(new Map())
  const dels = /** @type {Map<K, V>} */(new Map())
  const additions = new Map([[bshard.cid.toString(), bshard]])
  const removals = new Map([[ashard.cid.toString(), ashard]])

  // find shards removed in B
  for (const [akey, aval] of ashard.value) {
    const bval = bents.get(akey)
    if (bval) continue
    if (!Array.isArray(aval)) {
      dels.set(`${prefix}${akey}`, [aval, null])
      continue
    }
    // if shard link _with_ value
    if (aval[1] != null) {
      dels.set(`${prefix}${akey}`, [aval[1], null])
    }
    for await (const shard of collect(shards, aval[0])) {
      removals.set(shard.cid.toString(), shard)
    }
  }

  // find shards added or updated in B
  for (const [bkey, bval] of bshard.value) {
    const aval = aents.get(bkey)
    if (!Array.isArray(bval)) {
      if (!aval) {
        puts.set(`${prefix}${bkey}`, [null, bval])
      } else if (Array.isArray(aval)) {
        puts.set(`${prefix}${bkey}`, [aval[1] ?? null, bval])
      } else if (!isEqual(aval, bval)) {
        puts.set(`${prefix}${bkey}`, [aval, bval])
      }
      continue
    }
    if (aval && Array.isArray(aval)) { // updated in B
      if (isEqual(aval[0], bval[0])) {
        if (bval[1] != null && (aval[1] == null || !isEqual(aval[1], bval[1]))) {
          puts.set(`${prefix}${bkey}`, [aval[1] ?? null, bval[1]])
        }
        continue // updated value?
      }
      const res = await difference(blocks, aval[0], bval[0], `${prefix}${bkey}`)
      for (const shard of res.shards.additions) {
        additions.set(shard.cid.toString(), shard)
      }
      for (const shard of res.shards.removals) {
        removals.set(shard.cid.toString(), shard)
      }
      for (const [k, v] of res.kvs.puts) {
        puts.set(k, v)
      }
      for (const [k, v] of res.kvs.dels) {
        dels.set(k, v)
      }
    } else if (aval) { // updated in B value => link+value
      if (bval[1] == null) {
        puts.set(`${prefix}${bkey}`, [aval, null])
      } else if (!isEqual(aval, bval[1])) {
        puts.set(`${prefix}${bkey}`, [aval, bval[1]])
      }
      for await (const shard of collect(shards, bval[0])) {
        additions.set(shard.cid.toString(), shard)
      }
    } else { // added in B
      puts.set(`${prefix}${bkey}`, [null, bval[0]])
      for await (const shard of collect(shards, bval[0])) {
        additions.set(shard.cid.toString(), shard)
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
    kvs: { puts: [...puts.entries()], dels: [...dels.entries()] },
    shards: { additions: [...additions.values()], removals: [...removals.values()] }
  }
}

/**
 * @param {import('./shard').AnyLink} a
 * @param {import('./shard').AnyLink} b
 */
const isEqual = (a, b) => a.toString() === b.toString()

/**
 * @param {import('./shard').ShardFetcher} shards
 * @param {import('./shard').ShardLink} root
 * @returns {AsyncIterableIterator<import('./shard').ShardBlockView>}
 */
async function * collect (shards, root) {
  const shard = await shards.get(root)
  yield shard
  for (const [, v] of shard.value) {
    if (!Array.isArray(v)) continue
    yield * collect(shards, v[0])
  }
}
