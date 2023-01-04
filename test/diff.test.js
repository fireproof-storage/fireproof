import { describe, it } from 'node:test'
import assert from 'node:assert'
import { ShardBlock, put } from '../index.js'
import { difference } from '../diff.js'
import { Blockstore, randomCID } from './helpers.js'

describe('diff', () => {
  it('diffs a non-sharded addition', async () => {
    const empty = await ShardBlock.create()
    const blocks = new Blockstore()
    await blocks.put(empty.cid, empty.bytes)

    /** @type {Array<[string, import('../shard').AnyLink]>} */
    const testdata = [
      ['a', await randomCID(32)]
    ]

    /** @type {import('../shard').ShardLink} */
    let root = empty.cid
    for (const [k, v] of testdata) {
      const res = await put(blocks, root, k, v)
      for (const b of res.additions) {
        await blocks.put(b.cid, b.bytes)
      }
      root = res.root
    }

    const diff = await difference(blocks, empty.cid, root)

    assert.equal(diff.removals.length, 1)
    assert.equal(diff.removals[0].cid.toString(), empty.cid.toString())
    assert.equal(diff.additions.length, 1)
    assert.equal(diff.additions[0].cid.toString(), root.toString())
  })
})
