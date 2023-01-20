import { describe, it } from 'mocha'
import assert from 'node:assert'
import { ShardBlock, put, get, del } from '../index.js'
import { Blockstore, randomCID } from './helpers.js'

describe('del', () => {
  it('deletes a value', async () => {
    const empty = await ShardBlock.create()
    const blocks = new Blockstore()
    await blocks.put(empty.cid, empty.bytes)

    const dataCID = await randomCID(32)

    const { root: root0, additions: additions0 } = await put(blocks, empty.cid, 'test', dataCID)
    for (const b of additions0) {
      await blocks.put(b.cid, b.bytes)
    }

    const { root: root1, additions: additions1 } = await del(blocks, root0, 'test')
    for (const b of additions1) {
      await blocks.put(b.cid, b.bytes)
    }

    const res = await get(blocks, root1, 'test')
    assert.strictEqual(res, undefined)
  })
})
