import { advance, vis } from './clock.js'
import { put, get, getAll, root, eventsSince } from './prolly.js'

export default class Fireproof {
  /**
   * @param {Blockstore} blocks
   * @param {import('../clock').EventLink<import('../crdt').EventData>[]} clock
   */
  constructor (blocks, clock, config) {
    this.blocks = blocks
    this.clock = clock
    this.config = config
    this.authCtx = {}
  }

  /**
   * Returns a snapshot of the current Fireproof instance.
   *
   * @param {import('../clock').EventLink<import('../crdt').EventData>[]} clock
   *    Clock to use for the snapshot.
   * @returns {Fireproof}
   *    A new Fireproof instance representing the snapshot.
   */
  snapshot (clock) {
    if (!clock) clock = this.clock
    return new Fireproof(this.blocks, clock)
  }

  /**
   * Returns the changes made to the Fireproof instance since the specified event.
   *
   * @param {import('../clock').EventLink<import('../crdt').EventData>?} event -
   * The event to retrieve changes since. If null or undefined, retrieves all changes.
   * @returns {Promise<{
   *   rows: { key: string, value?: any, del?: boolean }[],
   *   head: import('../clock').EventLink<import('../crdt').EventData>[]
   * }>} - An object containing the rows and the head of the instance's clock.
   */
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
      rows = (await getAll(this.blocks, this.clock)).map(({ key, value }) => ({ key, value }))
    }
    return { rows, head: this.clock }
  }

  /**
   * Runs validation on the specified document using the Fireproof instance's configuration.
   *
   * @param {Object} doc - The document to validate.
   */
  runValidation (doc) {
    const oldDoc = this.get(doc._id).catch(() => null)
    const ok = this.config.validateChange(doc, oldDoc, this.authCtx)
  }

  /**
   * Adds a new document to the database
   *
   * @param {Object} doc - the document to be added
   * @param {string} doc._id - the document ID. If not provided, a random ID will be generated.
   * @param {Object} doc.* - the document data to be added
   * @returns {Promise<import('./prolly').PutResult>} - the result of adding the document
   */
  async put ({ _id, ...doc }) {
    const id = _id || Math.random().toString(36).slice(2)

    if (this.config && this.config.validateChange) {
      this.runValidation({ _id: id, ...doc })
    }

    const result = await put(this.blocks, this.clock, id, doc)
    if (!result) {
      console.log('failed', id, doc)
    }
    this.blocks.putSync(result.event.cid, result.event.bytes)
    result.additions.forEach((a) => this.blocks.putSync(a.cid, a.bytes))
    this.clock = result.head
    result.id = id
    return result
  }

  /**
   * Advances the clock to the specified event and updates the root CID
   *
   * @param {import('../clock').EventLink<import('../crdt').EventData>} event - the event to advance to
   * @returns {import('../clock').EventLink<import('../crdt').EventData>[]} - the new clock after advancing
   */
  //   async advance (event) {
  //     this.clock = await advance(this.blocks, this.clock, event)
  //     this.rootCid = await root(this.blocks, this.clock)
  //     return this.clock
  //   }

  /**
   * Displays a visualization of the current clock in the console
   */
  async visClock () {
    /**
     * A function that returns a shortened link string
     *
     * @param {import('../link').AnyLink} l - the link to be shortened
     * @returns {string} - the shortened link string
     */
    const shortLink = (l) => `${String(l).slice(0, 4)}..${String(l).slice(-4)}`

    /**
     * A function that returns a label for an event in the visualization
     *
     * @param {import('../clock').EventBlockView<import('../crdt').EventData>} event - the event to label
     * @returns {string} - the label for the event
     */
    const renderNodeLabel = (event) => {
      return event.value.data.type === 'put'
        ? `${shortLink(event.cid)}\\nput(${shortLink(event.value.data.key)}, 
        {${Object.values(event.value.data.value)}})`
        : `${shortLink(event.cid)}\\ndel(${event.value.data.key})`
    }

    for await (const line of vis(this.blocks, this.clock, {
      renderNodeLabel
    })) {
      console.log(line)
    }
  }

  /**
   * Retrieves the document with the specified ID from the database
   *
   * @param {string} key - the ID of the document to retrieve
   * @returns {Promise<import('./prolly').GetResult>} - the document with the specified ID
   */
  async get (key) {
    const got = await get(this.blocks, this.clock, key)
    got._id = key
    return got
  }
}
