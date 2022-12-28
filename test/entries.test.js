import { describe, it } from 'node:test'
import assert from 'node:assert'
import { ShardBlock, put, entries } from '../index.js'
import { Blockstore, randomCID } from './helpers.js'

describe('entries', () => {
  it('lists entries in lexicographical order', async () => {
    const emptyShard = await ShardBlock.create()
    const blocks = new Blockstore()
    await blocks.put(emptyShard.cid, emptyShard.bytes)

    /** @type {Array<[string, import('../shard').AnyLink]>} */
    const testdata = [
      ['c', await randomCID(32)],
      ['d', await randomCID(32)],
      ['a', await randomCID(32)],
      ['b', await randomCID(32)]
    ]

    /** @type {import('../shard').ShardLink} */
    let root = emptyShard.cid
    for (const [k, v] of testdata) {
      const res = await put(blocks, root, k, v)
      for (const b of res.additions) {
        await blocks.put(b.cid, b.bytes)
      }
      root = res.root
    }

    const results = []
    for await (const entry of entries(blocks, root)) {
      results.push(entry)
    }

    for (const [i, key] of testdata.map(d => d[0]).sort().entries()) {
      assert.equal(results[i][0], key)
    }
  })

  // it('lists entries by prefix')
})
