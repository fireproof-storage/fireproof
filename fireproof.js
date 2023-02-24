// add needed imports
import { advance, vis } from './clock.js'
import { put, get, getAll, root, eventsSince } from './prolly.js'

export default class Fireproof {
  /**
   * @param {Blockstore} blocks
   * @param {import('../clock').EventLink<import('../crdt').EventData>[]} clock
   */
  constructor (blocks, clock) {
    this.blocks = blocks
    this.clock = clock
    /** @type {import('../shard.js').ShardLink?} */
    // this.rootCid = null
  }

  snapshot (clock) {
    return new Fireproof(this.blocks, clock)
  }

  /**
   * @param {Object} doc
   * @returns {Promise<import('./prolly').PutResult>}
   */
  async put ({ _id, ...doc }) {
    const id = _id || Math.random().toString(36).slice(2)
    // console.log('fireproof put', id)
    const result = await put(this.blocks, this.clock, id, doc)
    if (!result) {
      console.log('failed', id, doc)
    }
    this.blocks.putSync(result.event.cid, result.event.bytes)
    result.additions.forEach((a) => this.blocks.putSync(a.cid, a.bytes))
    this.clock = result.head
    // this.rootCid = result.root.cid
    // this difference probably matters, but we need to test it
    // this.rootCid = await root(this.blocks, this.clock)
    // console.log('prolly PUT', id, value, { clock: result.clock, additions: result.additions.map(a => a.cid), event: result.event.cid })
    result.id = id
    return result
  }

  //   /** @param {import('../clock').EventLink<import('../crdt').EventData>} event */
  //   async advance (event) {
  //     this.clock = await advance(this.blocks, this.clock, event)
  //     this.rootCid = await root(this.blocks, this.clock)
  //     return this.clock
  //   }

  async changesSince (event) {
    let rows
    if (event) {
      const resp = await eventsSince(this.blocks, this.clock, event)
      const docsMap = new Map()
      for (const { key, type, value } of resp) {
        console.log('event', key, type, value)
        if (type === 'del') {
          docsMap.set(key, { key, del: true })
        } else {
          docsMap.set(key, { key, value })
        }
      }
      rows = Array.from(docsMap.values())
      console.log('rows length', rows.length)
    } else {
      // todo old format
      rows = (await getAll(this.blocks, this.clock)).map(({ key, value }) => ({ key, value }))
    }
    return { rows, head: this.clock }
  }

  async visClock () {
    /** @param {import('../link').AnyLink} l */
    const shortLink = (l) => `${String(l).slice(0, 4)}..${String(l).slice(-4)}`
    /** @type {(e: import('../clock').EventBlockView<import('../crdt').EventData>) => string} */
    const renderNodeLabel = (event) => {
      return event.value.data.type === 'put'
        ? `${shortLink(event.cid)}\\nput(${shortLink(event.value.data.key)}, {${
          Object.values(event.value.data.value)
          }})`
        : `${shortLink(event.cid)}\\ndel(${event.value.data.key})`
    }
    for await (const line of vis(this.blocks, this.clock, {
      renderNodeLabel
    })) {
      console.log(line)
    }
    // return result
  }

  /** @param {string} key */
  async get (key) {
    // console.log('fireproof get', key)
    const got = await get(this.blocks, this.clock, key)
    // console.log('fireproof got', key, got)
    got._id = key
    return got
  }
}
