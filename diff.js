import { ShardFetcher } from './shard.js'

/**
 * @param {import('./shard').BlockFetcher} blocks Bucket block storage.
 * @param {import('./shard').ShardLink} a Base DAG.
 * @param {import('./shard').ShardLink} b Comparison DAG.
 * @returns {Promise<import('./index').ShardDiff>}
 */
export async function difference (blocks, a, b) {
  if (isEqual(a, b)) return { additions: [], removals: [] }

  const shards = new ShardFetcher(blocks)
  const [ashard, bshard] = await Promise.all([shards.get(a), shards.get(b)])

  const aents = new Map(ashard.value)
  const bents = new Map(bshard.value)

  const additions = new Map([[bshard.cid.toString(), bshard]])
  const removals = new Map([[ashard.cid.toString(), ashard]])

  // find shards removed in B
  for (const [akey, aval] of ashard.value) {
    const bval = bents.get(akey)
    if (bval) continue
    if (!Array.isArray(aval)) continue
    for await (const shard of collect(shards, aval[0])) {
      removals.set(shard.cid.toString(), shard)
    }
  }

  // find shards added or updated in B
  for (const [bkey, bval] of bshard.value) {
    if (!Array.isArray(bval)) continue

    const aval = aents.get(bkey)
    if (aval) { // updated in B
      if (isEqual(aval[0], bval[0])) continue // updated value?
      const res = await difference(blocks, aval[0], bval[0])
      for (const shard of res.additions) {
        additions.set(shard.cid.toString(), shard)
      }
      for (const shard of res.removals) {
        removals.set(shard.cid.toString(), shard)
      }
    } else { // added in B
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

  return { additions: [...additions.values()], removals: [...removals.values()] }
}

/**
 * @param {import('./shard').ShardLink} a
 * @param {import('./shard').ShardLink} b
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
