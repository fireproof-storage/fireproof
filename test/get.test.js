import { describe, it } from 'mocha'
import assert from 'node:assert'
import { ShardBlock, put, get } from '../index.js'
import { Blockstore, randomCID } from './helpers.js'

describe('get', () => {
  it('get from root shard', async () => {
    const empty = await ShardBlock.create()
    const blocks = new Blockstore()
    await blocks.put(empty.cid, empty.bytes)

    const dataCID = await randomCID(32)
    const { root, additions } = await put(blocks, empty.cid, 'test', dataCID)

    for (const b of additions) {
      await blocks.put(b.cid, b.bytes)
    }

    const res = await get(blocks, root, 'test')

    assert(res)
    assert(res.toString(), dataCID.toString())
  })

  it('returns undefined when not found', async () => {
    const empty = await ShardBlock.create()
    const blocks = new Blockstore()
    await blocks.put(empty.cid, empty.bytes)

    const res = await get(blocks, empty.cid, 'test')
    assert.strictEqual(res, undefined)
  })

  // TODO: test get when key is also shard link
})
