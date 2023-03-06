// import { vis } from './clock.js'
import { put, get, getAll, eventsSince } from './prolly.js'
import Blockstore, { doTransaction } from './blockstore.js'

// const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Represents a Fireproof instance that wraps a ProllyDB instance and Merkle clock head.
 *
 * @class Fireproof
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
  #listeners = new Set()

  constructor (blocks, clock, config = {}, authCtx = {}) {
    this.blocks = blocks
    this.clock = clock
    this.config = config
    this.authCtx = authCtx
    this.instanceId = 'db.' + Math.random().toString(36).substring(2, 7)
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
    // how to handle listeners, views, and config?
    // todo needs a test for that
    return new Fireproof(this.blocks, clock || this.clock)
  }

  /**
   * This triggers a notification to all listeners of the Fireproof instance.
   */
  async setClock (clock) {
    // console.log('setClock', this.instanceId, clock)
    this.clock = clock.map((item) => (item['/'] ? item['/'] : item))
    await this.#notifyListeners({ reset: true, clock })
  }

  toJSON () {
    // todo this also needs to return the index roots...
    return { clock: this.clock }
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
    // console.log('changesSince', this.instanceId, event, this.clock)
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
      // console.log('change rows', this.instanceId, rows)
    } else {
      rows = (await getAll(this.blocks, this.clock)).map(({ key, value }) => ({ key, value }))
      // console.log('dbdoc rows', this.instanceId, rows)
    }
    return { rows, clock: this.clock }
  }

  /**
   * Registers a Listener to be called when the Fireproof instance's clock is updated.
   * Recieves live changes from the database after they are committed.
   * @param {Function} listener - The listener to be called when the clock is updated.
   * @returns {Function} - A function that can be called to unregister the listener.
   */
  registerListener (listener) {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  async #notifyListeners (changes) {
    // await sleep(0)
    for (const listener of this.#listeners) {
      await listener(changes)
    }
  }

  /**
   * Runs validation on the specified document using the Fireproof instance's configuration.
   *
   * @param {Object} doc - The document to validate.
   */
  async runValidation (doc) {
    if (this.config && this.config.validateChange) {
      const oldDoc = await this.get(doc._id)
        .then((doc) => doc)
        .catch(() => ({}))
      this.config.validateChange(doc, oldDoc, this.authCtx)
    }
  }

  /**
   * Adds a new document to the database, or updates an existing document.
   *
   * @param {Object} doc - the document to be added
   * @param {string} doc._id - the document ID. If not provided, a random ID will be generated.
   * @param {Object} doc.* - the document data to be added
   * @returns {Promise<import('./prolly').PutResult>} - the result of adding the document
   */
  async put ({ _id, ...doc }) {
    const id = _id || 'f' + Math.random().toString(36).slice(2)
    await this.runValidation({ _id: id, ...doc })
    return await this.putToProllyTree({ key: id, value: doc })
  }

  /**
   * Deletes a document from the database
   * @param {string} id - the document ID
   * @returns {Promise<import('./prolly').PutResult>} - the result of deleting the document
   */
  async del (id) {
    await this.runValidation({ _id: id, _deleted: true })
    // return await this.putToProllyTree({ key: id, del: true }) // not working at prolly tree layer?
    // this tombstone is temporary until we can get the prolly tree to delete
    return await this.putToProllyTree({ key: id, value: null })
  }

  async putToProllyTree (event) {
    const result = await doTransaction(
      'putToProllyTree',
      this.blocks,
      async (blocks) => await put(blocks, this.clock, event)
    )
    if (!result) {
      console.error('failed', event)
      throw new Error('failed to put at storage layer')
    }
    this.clock = result.head // do we want to do this as a finally block
    result.id = event.key
    await this.#notifyListeners([event])
    return { id: result.id, clock: this.clock }
  }

  //   /**
  //    * Advances the clock to the specified event and updates the root CID
  //    *   Will be used by replication
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

  setCarUploader (carUploaderFn) {
    console.log('registering car uploader')
    // https://en.wikipedia.org/wiki/Law_of_Demeter - this is a violation of the law of demeter
    this.blocks.valet.uploadFunction = carUploaderFn
  }

  setRemoteBlockReader (remoteBlockReaderFn) {
    // console.log('registering remote block reader')
    // this.blocks.valet.remoteBlockFunction = remoteBlockReaderFn
  }
}

/**
 * Creates a new Fireproof instance.
 *
 * @returns {Fireproof} - a new Fireproof instance
*/
Fireproof.storage = (_email) => {
  return new Fireproof(new Blockstore(), [])
}
