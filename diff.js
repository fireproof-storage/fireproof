import { ShardFetcher } from './shard.js'

/**
 * @param {import('./shard').BlockFetcher} blocks Bucket block storage.
 * @param {import('./shard').ShardLink} a Base DAG.
 * @param {import('./shard').ShardLink} b Comparison DAG.
 * @returns {Promise<import('./index').ShardDiff>}
 */
export async function diff (blocks, a, b) {
  if (isEqual(a, b)) return { additions: [], removals: [] }

  const shards = new ShardFetcher(blocks)
  const [ashard, bshard] = await Promise.all([shards.get(a), shards.get(b)])

  const aents = new Map(ashard.value)
  const bents = new Map(bshard.value)

  const additions = new Map([[bshard.cid.toString(), bshard]])
  const removals = new Map([[ashard.cid.toString(), ashard]])

  // find shards removed in B
  for (const aent of ashard.value) {
    const bent = bents.get(aent[0])
    if (bent) continue
    if (!Array.isArray(aent[1])) continue
    for await (const shard of collect(shards, aent[1][0])) {
      removals.set(shard.cid.toString(), shard)
    }
  }

  // find shards added or updated in B
  for (const bent of bshard.value) {
    if (!Array.isArray(bent)) continue

    const aent = aents.get(bent[0])
    if (aent) { // updated in B
      if (isEqual(aent[1][0], bent[1][0])) continue // updated value?
      const res = await diff(blocks, aent[1][0], bent[1][0])
      for (const shard of res.additions) {
        additions.set(shard.cid.toString(), shard)
      }
      for (const shard of res.removals) {
        removals.set(shard.cid.toString(), shard)
      }
    } else { // added in B
      for await (const shard of collect(shards, bent[1][0])) {
        additions.set(shard.cid.toString(), shard)
      }
    }
  }

  return {
    additions: Array.from(additions.values()),
    removals: Array.from(removals.values()).filter(shard => !additions.has(shard.cid.toString()))
  }
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
