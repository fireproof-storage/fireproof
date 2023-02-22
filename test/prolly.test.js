import { describe, it } from 'mocha'
import assert from 'node:assert'
import { advance, vis } from '../clock.js'

import { put, get, root } from '../prolly.js'
import { Blockstore, randomCID } from './helpers.js'

describe('Prolly', () => {
  it('put a value to a new clock', async () => {
    const blocks = new Blockstore()
    const alice = new TestPail(blocks, [])
    const key = 'key'
    const value = await randomCID(32)
    const { event, head } = await alice.putAndVis(key, value)

    assert.equal(event.value.data.type, 'put')
    assert.equal(event.value.data.key, key)
    assert.equal(event.value.data.value.toString(), value.toString())
    assert.equal(head.length, 1)
    assert.equal(head[0].toString(), event.cid.toString())

    const avalue = await alice.get('key')
    assert(avalue)
    assert.equal(JSON.stringify(avalue), JSON.stringify(value))
  })

  it('linear put multiple values', async () => {
    const blocks = new Blockstore()
    const alice = new TestPail(blocks, [])

    const key0 = 'key0'
    const value0 = await randomCID(32)
    await alice.put(key0, value0)

    const key1 = 'key1'
    const value1 = await randomCID(32)
    const result = await alice.putAndVis(key1, value1)

    assert.equal(result.event.value.data.type, 'put')
    assert.equal(result.event.value.data.key, key1)
    assert.equal(result.event.value.data.value.toString(), value1.toString())
    assert.equal(result.head.length, 1)
    assert.equal(result.head[0].toString(), result.event.cid.toString())
  })

  it('simple parallel put multiple values', async () => {
    const blocks = new Blockstore()
    const alice = new TestPail(blocks, [])
    await alice.put('key0', await randomCID(32))
    const bob = new TestPail(blocks, alice.head)

    /** @type {Array<[string, import('../link').AnyLink]>} */
    const data = [
      ['key1', await randomCID(32)],
      ['key2', await randomCID(32)],
      ['key3', await randomCID(32)],
      ['key4', await randomCID(32)]
    ]

    const { event: aevent0 } = await alice.put(data[0][0], data[0][1])
    const { event: bevent0 } = await bob.put(data[1][0], data[1][1])
    const { event: bevent1 } = await bob.put(data[2][0], data[2][1])

    await alice.advance(bevent0.cid)
    await alice.advance(bevent1.cid)
    await bob.advance(aevent0.cid)

    const { event: aevent1 } = await alice.putAndVis(data[3][0], data[3][1])

    await bob.advance(aevent1.cid)

    assert(alice.root)
    assert(bob.root)
    assert.equal(alice.root.toString(), bob.root.toString())

    // get item put to bob
    const avalue = await alice.get(data[1][0])
    assert(avalue)
    assert.equal(avalue.toString(), data[1][1].toString())

    // get item put to alice
    const bvalue = await bob.get(data[0][0])
    assert(bvalue)
    assert.equal(bvalue.toString(), data[0][1].toString())
  })

  it('linear put hundreds of values', async () => {
    const blocks = new Blockstore()
    const alice = new TestPail(blocks, [])

    // generate an array of 1000 random cids
    const cids = (await Promise.all(Array.from({ length: 100 }, () => randomCID(32)))).map((cid, i) => [`key${i}`, cid])

    for (const [key, value] of cids) {
      await alice.put(key, value)
    }

    for (const [key, value] of cids) {
      const vx = await alice.get(key)
      assert.equal(vx.toString(), value.toString())
    }
    console.log('blocks', Array.from(blocks.entries()).length)
  }).timeout(10000)
})

class TestPail {
  /**
   * @param {Blockstore} blocks
   * @param {import('../clock').EventLink<import('../crdt').EventData>[]} head
   */
  constructor (blocks, head) {
    this.blocks = blocks
    this.head = head
    /** @type {import('../shard.js').ShardLink?} */
    this.root = null
  }

  /**
   * @param {string} key
   * @param {import('../link').AnyLink} value
   */
  async put (key, value) {
    const result = await put(this.blocks, this.head, key, value)
    if (!result) { console.log('failed', key, value) }
    this.blocks.putSync(result.event.cid, result.event.bytes)
    result.additions.forEach(a => this.blocks.putSync(a.cid, a.bytes))
    this.head = result.head
    this.root = result.root.cid
    // this difference probably matters, but we need to test it
    // this.root = await root(this.blocks, this.head)
    // console.log('prolly PUT', key, value, { head: result.head, additions: result.additions.map(a => a.cid), event: result.event.cid })
    return result
  }

  /** @param {import('../clock').EventLink<import('../crdt').EventData>} event */
  async advance (event) {
    this.head = await advance(this.blocks, this.head, event)
    this.root = await root(this.blocks, this.head)
    return this.head
  }

  /**
   * @param {string} key
   * @param {import('../link.js').AnyLink} value
   */
  async putAndVis (key, value) {
    const result = await this.put(key, value)
    /** @param {import('../link').AnyLink} l */
    const shortLink = l => `${String(l).slice(0, 4)}..${String(l).slice(-4)}`
    /** @type {(e: import('../clock').EventBlockView<import('../crdt').EventData>) => string} */
    const renderNodeLabel = event => {
      return event.value.data.type === 'put'
        ? `${shortLink(event.cid)}\\nput(${event.value.data.key}, ${shortLink(event.value.data.value)})`
        : `${shortLink(event.cid)}\\ndel(${event.value.data.key})`
    }
    for await (const line of vis(this.blocks, result.head, { renderNodeLabel })) {
      console.log(line)
    }
    return result
  }

  /** @param {string} key */
  async get (key) {
    return get(this.blocks, this.head, key)
  }
}
