import { describe, it } from 'node:test'
import assert from 'node:assert'
import { ShardBlock, put, get } from '../index.js'
import { Blockstore, randomCID } from './helpers.js'

describe('get', () => {
  it('get from root shard', async () => {
    const emptyShard = await ShardBlock.create()
    const blocks = new Blockstore()
    await blocks.put(emptyShard.cid, emptyShard.bytes)

    const dataCID = await randomCID(32)
    const { root, additions } = await put(blocks, emptyShard.cid, 'test', dataCID)

    for (const b of additions) {
      await blocks.put(b.cid, b.bytes)
    }

    const res = await get(blocks, root, 'test')

    assert(res)
    assert(res.toString(), dataCID.toString())
  })

  it('returns undefined when not found', async () => {
    const emptyShard = await ShardBlock.create()
    const blocks = new Blockstore()
    await blocks.put(emptyShard.cid, emptyShard.bytes)

    const res = await get(blocks, emptyShard.cid, 'test')
    assert.strictEqual(res, undefined)
  })

  // TODO: test get when key is also shard link
})
