import { put, get, getAll, eventsSince } from './prolly.js'
import TransactionBlockstore, { doTransaction } from './blockstore.js'
import charwise from 'charwise'

// const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * @class Fireproof
 * @classdesc Fireproof stores data in IndexedDB and provides a Merkle clock.
 *  This is the main class for saving and loading JSON and other documents with the database. You can find additional examples and
 *  usage guides in the repository README.
 *
 * @param {Blockstore} blocks - The block storage instance to use documents and indexes
 * @param {CID[]} clock - The Merkle clock head to use for the Fireproof instance.
 * @param {object} [config] - Optional configuration options for the Fireproof instance.
 * @param {object} [authCtx] - Optional authorization context object to use for any authentication checks.
 *
 */
export default class Fireproof {
  #listeners = new Set()

  /**
   * @function storage
   * @memberof Fireproof
   * Creates a new Fireproof instance with default storage settings
   * Most apps should use this and not worry about the details.
   * @static
   * @returns {Fireproof} - a new Fireproof instance
   */
  static storage = (name) => {
    return new Fireproof(new TransactionBlockstore(name), [], { name })
  }

  constructor (blocks, clock, config, authCtx = {}) {
    this.name = config?.name || 'global'
    this.instanceId = `fp.${this.name}.${Math.random().toString(36).substring(2, 7)}`
    this.blocks = blocks
    this.clock = clock
    this.config = config
    this.authCtx = authCtx
  }

  /**
   * Returns a snapshot of the current Fireproof instance as a new instance.
   * @function snapshot
   * @param {CID[]} clock - The Merkle clock head to use for the snapshot.
   * @returns {Fireproof}
   *    A new Fireproof instance representing the snapshot.
   * @memberof Fireproof
   * @instance
   */
  snapshot (clock) {
    // how to handle listeners, views, and config?
    // todo needs a test for listeners, views, and config
    return new Fireproof(this.blocks, clock || this.clock)
  }

  /**
   * Move the current instance to a new point in time. This triggers a notification to all listeners
   * of the Fireproof instance so they can repaint UI, etc.
   * @param {CID[] } clock
   *    Clock to use for the snapshot.
   * @returns {Promise<void>}
   * @memberof Fireproof
   * @instance
   */
  async setClock (clock) {
    // console.log('setClock', this.instanceId, clock)
    this.clock = clock.map((item) => (item['/'] ? item['/'] : item))
    await this.#notifyListeners({ reset: true, clock })
  }

  /**
   * Renders the Fireproof instance as a JSON object.
   * @returns {Object} - The JSON representation of the Fireproof instance. Includes clock heads for the database and its indexes.
   * @memberof Fireproof
   * @instance
   */
  toJSON () {
    // todo this also needs to return the index roots...
    return { clock: this.clock }
  }

  /**
   * Returns the changes made to the Fireproof instance since the specified event.
   * @function changesSince
   * @param {CID[]} [event] - The clock head to retrieve changes since. If null or undefined, retrieves all changes.
   * @returns {Object<{rows : Object[], clock: CID[]}>} An object containing the rows and the head of the instance's clock.
   * @memberof Fireproof
   * @instance
   */
  async changesSince (event) {
    // console.log('changesSince', this.instanceId, event, this.clock)
    let rows, dataCIDs, clockCIDs
    if (event) {
      const resp = await eventsSince(this.blocks, this.clock, event)
      const docsMap = new Map()
      for (const { key, type, value } of resp.result.map(decodeEvent)) {
        if (type === 'del') {
          docsMap.set(key, { key, del: true })
        } else {
          docsMap.set(key, { key, value })
        }
      }
      rows = Array.from(docsMap.values())
      clockCIDs = resp.cids
      // console.log('change rows', this.instanceId, rows)
    } else {
      const allResp = await getAll(this.blocks, this.clock)
      rows = allResp.result.map(({ key, value }) => (decodeEvent({ key, value })))
      dataCIDs = allResp.cids
      // console.log('dbdoc rows', this.instanceId, rows)
    }
    return {
      rows,
      clock: this.clock,
      proof: { data: await cidsToProof(dataCIDs), clock: await cidsToProof(clockCIDs) }
    }
  }

  /**
   * Registers a Listener to be called when the Fireproof instance's clock is updated.
   * Recieves live changes from the database after they are committed.
   * @param {Function} listener - The listener to be called when the clock is updated.
   * @returns {Function} - A function that can be called to unregister the listener.
   * @memberof Fireproof
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
   * Runs validation on the specified document using the Fireproof instance's configuration. Throws an error if the document is invalid.
   *
   * @param {Object} doc - The document to validate.
   * @returns {Promise<void>}
   * @throws {Error} - Throws an error if the document is invalid.
   * @memberof Fireproof
   * @instance
   */
  async #runValidation (doc) {
    if (this.config && this.config.validateChange) {
      const oldDoc = await this.get(doc._id)
        .then((doc) => doc)
        .catch(() => ({}))
      this.config.validateChange(doc, oldDoc, this.authCtx)
    }
  }

  /**
   * Adds a new document to the database, or updates an existing document. Returns the ID of the document and the new clock head.
   *
   * @param {Object} doc - the document to be added
   * @param {string} doc._id - the document ID. If not provided, a random ID will be generated.
   * @param {Object} doc.* - the document data to be added
   * @returns {Object<{ id: string, clock: CID[]  }>} - The result of adding the document to the database
   * @memberof Fireproof
   * @instance
   */
  async put ({ _id, _proof, ...doc }) {
    const id = _id || 'f' + Math.random().toString(36).slice(2)
    await this.#runValidation({ _id: id, ...doc })
    return await this.#putToProllyTree({ key: id, value: doc }, doc._clock)
  }

  /**
   * Deletes a document from the database
   * @param {string} id - the document ID
   * @returns {Object<{ id: string, clock: CID[] }>} - The result of deleting the document from the database
   * @memberof Fireproof
   * @instance
   */
  async del (docOrId) {
    let id
    let clock = null
    if (docOrId._id) {
      id = docOrId._id
      clock = docOrId._clock
    } else {
      id = docOrId
    }
    await this.#runValidation({ _id: id, _deleted: true })
    // return await this.#putToProllyTree({ key: id, del: true }) // not working at prolly tree layer?
    // this tombstone is temporary until we can get the prolly tree to delete
    return await this.#putToProllyTree({ key: id, value: null }, clock)
  }

  /**
   * Updates the underlying storage with the specified event.
   * @private
   * @param {Object<{key : string, value: any}>} event - the event to add
   * @returns {Object<{ id: string, clock: CID[] }>} - The result of adding the event to storage
   */
  async #putToProllyTree (decodedEvent, clock = null) {
    const event = encodeEvent(decodedEvent)
    if (clock && JSON.stringify(clock) !== JSON.stringify(this.clock)) {
      // we need to check and see what version of the document exists at the clock specified
      // if it is the same as the one we are trying to put, then we can proceed
      const resp = await eventsSince(this.blocks, this.clock, event.value._clock)
      const missedChange = resp.result.find(({ key }) => key === event.key)
      if (missedChange) {
        throw new Error('MVCC conflict, document is changed, please reload the document and try again.')
      }
    }
    const result = await doTransaction(
      '#putToProllyTree',
      this.blocks,
      async (blocks) => await put(blocks, this.clock, event)
    )
    if (!result) {
      console.error('failed', event)
      throw new Error('failed to put at storage layer')
    }
    this.clock = result.head // do we want to do this as a finally block
    await this.#notifyListeners([decodedEvent]) // this type is odd
    return {
      id: decodedEvent.key,
      clock: this.clock,
      proof: { data: await cidsToProof(result.cids), clock: await cidsToProof(result.clockCIDs) }
    }
    // todo should include additions (or split clock)
  }

  //   /**
  //    * Advances the clock to the specified event and updates the root CID
  //    *   Will be used by replication
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
   * @param {Object} [opts] - options
   * @returns {Object<{_id: string, ...doc: Object}>} - the document with the specified ID
   * @memberof Fireproof
   * @instance
   */
  async get (key, opts = {}) {
    const clock = opts.clock || this.clock
    const resp = await get(this.blocks, clock, charwise.encode(key))

    // this tombstone is temporary until we can get the prolly tree to delete
    if (!resp || resp.result === null) {
      throw new Error('Not found')
    }
    const doc = resp.result
    if (opts.mvcc === true) {
      doc._clock = this.clock
    }
    doc._proof = {
      data: await cidsToProof(resp.cids),
      clock: this.clock
    }
    doc._id = key
    return doc
  }

  setCarUploader (carUploaderFn) {
    console.log('registering car uploader')
    // https://en.wikipedia.org/wiki/Law_of_Demeter - this is a violation of the law of demeter
    this.blocks.valet.uploadFunction = carUploaderFn
  }

  setRemoteBlockReader (remoteBlockReaderFn) {
    // console.log('registering remote block reader')
    this.blocks.valet.remoteBlockFunction = remoteBlockReaderFn
  }
}

export async function cidsToProof (cids) {
  if (!cids || !cids.all) return []
  const all = await cids.all()
  return [...all].map((cid) => cid.toString())
}

function decodeEvent (event) {
  const decodedKey = charwise.decode(event.key)
  return { ...event, key: decodedKey }
}

function encodeEvent (event) {
  if (!(event && event.key)) return
  const encodedKey = charwise.encode(event.key)
  return { ...event, key: encodedKey }
}
