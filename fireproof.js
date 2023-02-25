// import { vis } from './clock.js'
import { put, get, getAll, eventsSince } from './prolly.js'
import { doTransaction } from './blockstore.js'

/**
 * Represents a Fireproof instance that wraps a ProllyDB instance and Merkle clock head.
 *
 * @class
 * @classdesc A Fireproof instance can be used to store and retrieve values from a ProllyDB instance.
 *
 * @param {Blockstore} blocks - The block storage instance to use for the underlying ProllyDB instance.
 * @param {import('../clock').EventLink<import('../crdt').EventData>[]} clock - The Merkle clock head to use for the Fireproof instance.
 * @param {object} [config] - Optional configuration options for the Fireproof instance.
 * @param {object} [authCtx] - Optional authorization context object to use for any authentication checks.
 *
 */

export default class Fireproof {
  /**
   * @param {Blockstore} blocks
   * @param {import('../clock').EventLink<import('../crdt').EventData>[]} clock
   */
  constructor (blocks, clock, config = {}, authCtx = {}) {
    this.blocks = blocks
    this.clock = clock
    this.config = config
    this.authCtx = authCtx
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
    return new Fireproof(this.blocks, clock || this.clock)
  }

  /**
   * Returns the changes made to the Fireproof instance since the specified event.
   *
   * @param {import('../clock').EventLink<import('../crdt').EventData>?} event -
   * The event to retrieve changes since. If null or undefined, retrieves all changes.
   * @returns {Promise<{
   *   rows: { key: string, value?: any, del?: boolean }[],
   *   head: import('../clock').EventLink<import('../crdt').EventData>[]
   * }>} - An object `{rows : [...{key, value, del}], head}` containing the rows and the head of the instance's clock.
   */
  async changesSince (event) {
    let rows
    if (event) {
      const resp = await eventsSince(this.blocks, this.clock, event)
      const docsMap = new Map()
      for (const { key, type, value } of resp) {
        if (type === 'del') {
          docsMap.set(key, { key, del: true })
        } else {
          docsMap.set(key, { key, value })
        }
      }
      rows = Array.from(docsMap.values())
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
    this.config.validateChange(doc, oldDoc, this.authCtx)
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
    return await this.#doPut({ key: id, value: doc })
  }

  /**
   * Deletes a document from the database
   * @param {string} id - the document ID
   * @returns {Promise<import('./prolly').PutResult>} - the result of deleting the document
   */
  async del (id) {
    // return await this.#doPut({ key: id, del: true }) // not working at prolly tree layer?
    // this tombstone is temporary until we can get the prolly tree to delete
    return await this.#doPut({ key: id, value: null })
  }

  async #doPut (event) {
    const result = await doTransaction(this.blocks, async (blocks) => await put(blocks, this.clock, event))
    if (!result) {
      console.log('failed', event)
    }
    this.clock = result.head
    result.id = event.key
    return result // todo what if these returned the EventData?
  }

  //   /**
  //    * Advances the clock to the specified event and updates the root CID
  //    *
  //    * @param {import('../clock').EventLink<import('../crdt').EventData>} event - the event to advance to
  //    * @returns {import('../clock').EventLink<import('../crdt').EventData>[]} - the new clock after advancing
  //    */
  //     async advance (event) {
  //       this.clock = await advance(this.blocks, this.clock, event)
  //       this.rootCid = await root(this.blocks, this.clock)
  //       return this.clock
  //     }

  /**
   * Displays a visualization of the current clock in the console
   */
  //   async visClock () {
  //     const shortLink = (l) => `${String(l).slice(0, 4)}..${String(l).slice(-4)}`
  //     const renderNodeLabel = (event) => {
  //       return event.value.data.type === 'put'
  //         ? `${shortLink(event.cid)}\\nput(${shortLink(event.value.data.key)},
  //         {${Object.values(event.value.data.value)}})`
  //         : `${shortLink(event.cid)}\\ndel(${event.value.data.key})`
  //     }
  //     for await (const line of vis(this.blocks, this.clock, { renderNodeLabel })) console.log(line)
  //   }

  /**
   * Retrieves the document with the specified ID from the database
   *
   * @param {string} key - the ID of the document to retrieve
   * @returns {Promise<import('./prolly').GetResult>} - the document with the specified ID
   */
  async get (key) {
    const got = await get(this.blocks, this.clock, key)
    // this tombstone is temporary until we can get the prolly tree to delete
    if (got === null) {
      throw new Error('Not found')
    }
    got._id = key
    return got
  }
}
