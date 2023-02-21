// add needed imports
import { advance, vis } from '../clock.js'
import { put, get, root } from '../prolly.js'

export default class Fireproof {
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
    if (!result) {
      console.log('failed', key, value)
    }
    this.blocks.putSync(result.event.cid, result.event.bytes)
    result.additions.forEach((a) => this.blocks.putSync(a.cid, a.bytes))
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
    const shortLink = (l) => `${String(l).slice(0, 4)}..${String(l).slice(-4)}`
    /** @type {(e: import('../clock').EventBlockView<import('../crdt').EventData>) => string} */
    const renderNodeLabel = (event) => {
      return event.value.data.type === 'put'
        ? `${shortLink(event.cid)}\\nput(${event.value.data.key}, ${shortLink(
            event.value.data.value
          )})`
        : `${shortLink(event.cid)}\\ndel(${event.value.data.key})`
    }
    for await (const line of vis(this.blocks, result.head, {
      renderNodeLabel
    })) {
      console.log(line)
    }
    return result
  }

  /** @param {string} key */
  async get (key) {
    return get(this.blocks, this.head, key)
  }
}
