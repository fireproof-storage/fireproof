// add needed imports
import { advance, vis } from './clock.js'
import { put, get, getAll, root, eventsSince } from './prolly.js'

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
   * @param {Object} doc
   * @returns {Promise<import('./prolly').PutResult>}
   */
  async put (doc) {
    const id = doc._id || Math.random().toString(36).slice(2)
    // delete doc._id
    const result = await put(this.blocks, this.head, id, doc)
    if (!result) {
      console.log('failed', id, doc)
    }
    this.blocks.putSync(result.event.cid, result.event.bytes)
    result.additions.forEach((a) => this.blocks.putSync(a.cid, a.bytes))
    this.head = result.head
    this.root = result.root.cid
    // this difference probably matters, but we need to test it
    // this.root = await root(this.blocks, this.head)
    // console.log('prolly PUT', id, value, { head: result.head, additions: result.additions.map(a => a.cid), event: result.event.cid })
    result.id = id
    return result
  }

  /** @param {import('../clock').EventLink<import('../crdt').EventData>} event */
  async advance (event) {
    this.head = await advance(this.blocks, this.head, event)
    this.root = await root(this.blocks, this.head)
    return this.head
  }

  async docsSince (event) {
    if (!event) {
      const entries = await getAll(this.blocks, this.head)
      return { rows: entries.map(({ value }) => value), head: this.head }
    } else {
      console.log('getting events since', event)
      const events = await eventsSince(this.blocks, event)
      console.log('events', events)
      return { rows: events, head: this.head }
    }
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
