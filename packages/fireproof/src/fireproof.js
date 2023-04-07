// import { randomBytes } from 'crypto'
import { visMerkleClock, visMerkleTree, vis, put, get, getAll, eventsSince } from './prolly.js'
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
  static storage = (name = 'global') => {
    // const instanceKey = randomBytes(32).toString('hex') // pass null to disable encryption
    // pick a random key from const validatedKeys
    const instanceKey = validatedKeys[Math.floor(Math.random() * validatedKeys.length)]
    console.log('instanceKey', instanceKey)
    return new Fireproof(new TransactionBlockstore(name, instanceKey), [], { name })
  }

  constructor (blocks, clock, config, authCtx = {}) {
    this.name = config?.name || 'global'
    this.instanceId = `fp.${this.name}.${Math.random().toString(36).substring(2, 7)}`
    this.blocks = blocks
    this.clock = clock
    this.config = config
    this.authCtx = authCtx
    this.indexes = new Map()
  }

  /**
   * Renders the Fireproof instance as a JSON object.
   * @returns {Object} - The JSON representation of the Fireproof instance. Includes clock heads for the database and its indexes.
   * @memberof Fireproof
   * @instance
   */
  toJSON () {
    // todo this also needs to return the index roots...
    return {
      clock: this.clockToJSON(),
      name: this.name,
      key: this.blocks.valet.keyMaterial,
      indexes: [...this.indexes.values()].map(index => index.toJSON())
    }
  }

  clockToJSON () {
    return this.clock.map(cid => cid.toString())
  }

  hydrate ({ clock, name, key }) {
    this.name = name
    this.clock = clock
    this.blocks.valet.keyMaterial = key
  }

  /**
   * Triggers a notification to all listeners
   * of the Fireproof instance so they can repaint UI, etc.
   * @param {CID[] } clock
   *    Clock to use for the snapshot.
   * @returns {Promise<void>}
   * @memberof Fireproof
   * @instance
   */
  async notifyReset () {
    await this.#notifyListeners({ reset: true, clock: this.clockToJSON() })
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
    // if (!event) event = []
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
      clock: this.clockToJSON(),
      proof: { data: await cidsToProof(dataCIDs), clock: await cidsToProof(clockCIDs) }
    }
  }

  async allDocuments () {
    const allResp = await getAll(this.blocks, this.clock)
    const rows = allResp.result.map(({ key, value }) => (decodeEvent({ key, value }))).map(({ key, value }) => ({ key, value: { _id: key, ...value } }))
    return {
      rows,
      clock: this.clockToJSON(),
      proof: await cidsToProof(allResp.cids)
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
    // await sleep(10)
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
    if (clock && JSON.stringify(clock) !== JSON.stringify(this.clockToJSON())) {
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
    // console.log('new clock head', this.instanceId, result.head.toString())
    this.clock = result.head // do we want to do this as a finally block
    await this.#notifyListeners([decodedEvent]) // this type is odd
    return {
      id: decodedEvent.key,
      clock: this.clockToJSON(),
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
      doc._clock = this.clockToJSON()
    }
    doc._proof = {
      data: await cidsToProof(resp.cids),
      clock: this.clockToJSON()
    }
    doc._id = key
    return doc
  }

  async * vis () {
    return yield * vis(this.blocks, this.clock)
  }

  async visTree () {
    return await visMerkleTree(this.blocks, this.clock)
  }

  async visClock () {
    return await visMerkleClock(this.blocks, this.clock)
  }

  setCarUploader (carUploaderFn) {
    // console.log('registering car uploader')
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

const goodTest = `
✔ Clock create a new clock: 2ms
✔ Clock add events sequentially: 15ms
✔ Clock add two events with shared parents: 1ms
✔ Clock add two events with some shared parents: 0ms
✔ Clock converge when multi-root: 1ms
✔ Clock add an old event: 1ms
✔ Clock add an event with missing parents: 0ms
✔ Clock reproduce the issue from fireproof docs since update test: 1ms
  DbIndex query query index range: instanceKey aa69ad9d52890cf8a1ecfceda6918bd2db61f801401a35c229a6d278cbf185c7
✔ DbIndex query query index range: 6ms
  DbIndex query query exact key: instanceKey 619d070ae27b9cf2cacecdc3e9c21da8eb85022c9305dc63364af6aab0ac6741
✔ DbIndex query query exact key: 6ms
  DbIndex query query index all: instanceKey 3779e2571bb03a5aeea6a4f723db92ea2bfd718262aab46ac8ec83b452b61e63
✔ DbIndex query query index all: 2ms
  DbIndex query query index NaN: instanceKey d0806e2d9762cb7488306fb26d3b0836bd61303aed4987ce1d3f8e3d725f97c7
✔ DbIndex query query index NaN: 4ms
  DbIndex query query index Infinity: instanceKey 743c40bf4bb75c5978cbcaabf8a6d8d5ed2075051771c6e8e0a2278a21b01a52
✔ DbIndex query query index Infinity: 3ms
  DbIndex query query twice: instanceKey 321e6a155c2091f7018648335f07bc56d12745b9923332f50dbfc0bb348d9c1a
✔ DbIndex query query twice: 4ms
  DbIndex query query two rows oops: instanceKey 5f1aa374f1eb618bd99b465e02c9762313d9a16adba745d5b9b44d13d1d68cab
✔ DbIndex query query two rows oops: 3ms
  DbIndex query query two rows easy: instanceKey f54cdd3c5bfb25af76574b6f672029110652c12a52138a28c27142bd5a722903
✔ DbIndex query query two rows easy: 3ms
  DbIndex query update index: instanceKey 885b5e1ef73c79e56e7e037d9436c4ea86ed1f599157d8cd19c11180dd7cc062
✔ DbIndex query update index: 21ms
  DbIndex query update index with document update to different key: instanceKey ce9e9e790dfda8422817c688d90e999157faebe04fb3b93e4400e95fe9da0050
✔ DbIndex query update index with document update to different key: 28ms
  DbIndex query update index with document deletion: instanceKey b4389c02c43b0a15b05dd0969c4814b84c3da6a0842fefae93af4f881691e22e
✔ DbIndex query update index with document deletion: 24ms
✔ DbIndex query with bad index definition query index range: 1ms
  Fireproof takes an optional name: instanceKey 286a1e08c67ee14c44c1444c1f0c9769e177b72209a6cc96a01a4b250cb370ef
✔ Fireproof takes an optional name: 0ms
  Fireproof only put and get document: instanceKey 755051301c5dee3cd86a0d0fb1e5eeb7d2b72875a9236405f02f6d61c8718583
✔ Fireproof only put and get document: 0ms
  Fireproof mvcc put and get document with _clock that matches: instanceKey 1266e4b38027bd57f04273b764e0c25f9bc4ccea3b7b8b0b395a5477720c1eec
✔ Fireproof mvcc put and get document with _clock that matches: 2ms
  Fireproof get should return an object instance that is not the same as the one in the db: instanceKey 4a3320c039343f4626496a9b2aba3bfec62b9b5cdb827a1139dbff8724e93eb4
✔ Fireproof get should return an object instance that is not the same as the one in the db: 1ms
  Fireproof get with mvcc option: instanceKey 2e40d81cb4b2f0108ad5ad0e14a3aedf42fa1a33b2201ee0336fda82ae3eb194
✔ Fireproof get with mvcc option: 0ms
  Fireproof get with mvcc option where someone else changed another document first: instanceKey f78fb595d8209963e546334b3f0dfe7290478dbb85677506e4471c0704884199
✔ Fireproof get with mvcc option where someone else changed another document first: 3ms
  Fireproof get from an old snapshot with mvcc option: instanceKey 0b69b9044cec6431d4f3c89ee02247ccce855620b0297315dc6ca5b9aded1df9
✔ Fireproof get from an old snapshot with mvcc option: 2ms
  Fireproof put and get document with _clock that does not match b/c the doc changed: instanceKey 43017e16140dfe8c8581e2838cef7f7ebd0495589544176a9a47cb5e50ea320c
✔ Fireproof put and get document with _clock that does not match b/c the doc changed: 2ms
  Fireproof put and get document with _clock that does not match b/c a different doc changed should succeed: instanceKey f9e4522bfa881a56eb920a6fb0675a45b6b3963f7c73affcab40ee025f40f1b6
✔ Fireproof put and get document with _clock that does not match b/c a different doc changed should succeed: 3ms
  Fireproof put and get document with _clock that does not match b/c the doc was deleted: instanceKey 8da6600543f4fbbaeed181a7a806fe77f02363201c35bfedca0e4c8c4f02fc41
err Error: MVCC conflict, document is changed, please reload the document and try again.
  at #putToProllyTree (file:///Users/jchris/Documents/GitHub/fireproof/packages/fireproof/src/fireproof.js:225:15)
  at async Fireproof.put (file:///Users/jchris/Documents/GitHub/fireproof/packages/fireproof/src/fireproof.js:186:12)
  at async Context.<anonymous> (file:///Users/jchris/Documents/GitHub/fireproof/packages/fireproof/test/fireproof.test.js:102:17)
✔ Fireproof put and get document with _clock that does not match b/c the doc was deleted: 3ms
  Fireproof allDocuments: instanceKey 5c6aa8bbabc8a9f3eeff7a4427eb5d0c419ec54d570b277c5a0bdb9eed98b710
✔ Fireproof allDocuments: 2ms
  Fireproof has a factory for making new instances with default settings: instanceKey e1d5c8777592d16bec16579c882b441d497084bc0fda7403fb8608fa2bce0630
instanceKey eb954d4ab5998de8b18c44c7a97985227d24eab18b8581ed69b757e87dcda51f
✔ Fireproof has a factory for making new instances with default settings: 0ms
  Fireproof an empty database has no documents: instanceKey c3c7d2b9e0a2f519041386823bb08fd76fc1354741458cb197bb6cca149febc8
instanceKey ef07d382b595e1f6fe631b3fb3493cd1a10011d8941366f279c8cdb2f74ff47b
✔ Fireproof an empty database has no documents: 0ms
  Fireproof update existing document: instanceKey 34177ea1c2b0b656ccd802676ecc81eeb1b2eb5acdccce2c1febaedd1ed2e6ba
✔ Fireproof update existing document: 4ms
  Fireproof update document with validation function that doesn't allow it: instanceKey dd0a9b7ef4bf94ab2ffce4c7904c55a19d5a2c17f12bbae43a3877f90c0133db
✔ Fireproof update document with validation function that doesn't allow it: 1ms
  Fireproof get missing document: instanceKey de69e0bf2c3c2774c3f7a0f8e3939494e1e079d85ef0047c1606aecf327b9af6
✔ Fireproof get missing document: 1ms
  Fireproof delete a document: instanceKey cc41476220f259d2f8d212549f279fbaf03a79809c09c2c96ec9c2019990007a
✔ Fireproof delete a document: 2ms
  Fireproof delete a document with validation function that doesn't allow it: instanceKey cdbee5ca938f05dbcd510435f235fd51bee67464b6ff507fe6479c5af48baae2
✔ Fireproof delete a document with validation function that doesn't allow it: 1ms
  Fireproof provides docs since tiny: instanceKey eb5a2d8407ac1bae1dbbf99b63496ee6ad6cc686e1a88243c17d361792af359d
✔ Fireproof provides docs since tiny: 2ms
  Fireproof provides docs since: instanceKey 9c51665a5b6b76b1ee9b4ae038311093c06ad3ec4ce1c1b76f06d1bc6a595dc1
✔ Fireproof provides docs since: 8ms
  Fireproof docs since repeated changes: instanceKey 263d1cb9bf92f2d0bc9b7442ab1fb5afb60326ef483fbb3e599d5173a56486fb
✔ Fireproof docs since repeated changes: 2396ms
  Fireproof concurrent transactions: instanceKey de178fae343c445115b7db351dcb5d218707f27ac40537d5c0ff8df84938f74b
✔ Fireproof concurrent transactions: 54ms
  Fireproof serialize database: instanceKey a70375beff297c679d66efafb357ecc56989dfd9ceffbe6be09a96b8a1e651f1
✔ Fireproof serialize database: 4ms
  Fireproof clocked changes in order: instanceKey ac834b9ea974184cad919dc90993a93b61bdc09380b5a8489c605fda54649d0d
✔ Fireproof clocked changes in order: 6ms
- Fireproof changes in order
  Fulltext with flexsearch search the index: instanceKey 44aa53750f71069a2cc0d421f95ac5f7c321efc8f578417cbcbb2ee3a80d5b0b
✔ Fulltext with flexsearch search the index: 39ms
  DbIndex query serialize database with index: instanceKey 5ef06d8852d8b397731488b5651ab0a55a63d9c142aff83927ea865cdfb86d2f
✔ DbIndex query serialize database with index: 11ms
  DbIndex query rehydrate database: instanceKey e6c986c5f51f7a5a43ee7c9a66591af7551c82ab90b1f88abc9564063709afc0
✔ DbIndex query rehydrate database: 15ms
✔ Listener all listeners get the reset event: 3ms
✔ Listener can listen to all events: 3ms
✔ Listener shares only new events by default: 1ms
✔ Listener shares all events if asked: 51ms
✔ Listener shares events since db.clock: 4ms
✔ Prolly put a value to a new clock: 0ms
✔ Prolly linear put multiple values: 0ms
✔ Prolly get missing: 1ms
✔ Prolly simple parallel put multiple values: 3ms
- Prolly passing, slow: linear put hundreds of values
  Proofs first put result shoud not include proof: instanceKey 866ad120383128e28ca77f602df6a11d010e82c06e8bb822cd76ec6d49bb4d9f
✔ Proofs first put result shoud not include proof: 0ms
- Proofs second put result shoud include proof
  Proofs get result shoud include proof: instanceKey d46878a7fce2db94be69e21a79a0cb3aeebc754f8cd601f5c72d9ec97d787210
✔ Proofs get result shoud include proof: 0ms
  IPLD encode error reproduce: instanceKey cb9435256cb21f0964601dcae6cff5023208021035c70c1b6b1e53b71004175b
✔ IPLD encode error reproduce: 5ms
✔ new Valet has default attributes: 0ms
  new Valet can park a car and serve the blocks: queue worker 1 506
✔ new Valet can park a car and serve the blocks: 1ms
✔ new Valet calls the upload function: 0ms

62 passing (3s)
3 pending

✔ Clock create a new clock: 2ms
✔ Clock add events sequentially: 14ms
✔ Clock add two events with shared parents: 1ms
✔ Clock add two events with some shared parents: 1ms
✔ Clock converge when multi-root: 2ms
✔ Clock add an old event: 1ms
✔ Clock add an event with missing parents: 0ms
✔ Clock reproduce the issue from fireproof docs since update test: 0ms
  DbIndex query query index range: instanceKey 23adc3bc07834badf2b2d13ce3662dcf3cff830ba0703ae217bb2d482e19c9fa
✔ DbIndex query query index range: 8ms
  DbIndex query query exact key: instanceKey 66441621cfa5d08e4da02c1e624f78419800e1ce161ad18348034bf80cf37e72
✔ DbIndex query query exact key: 7ms
  DbIndex query query index all: instanceKey 42b8ca17e75c882c11c6f86724c2b5d42c086181a1624440f841ee543131e744
✔ DbIndex query query index all: 4ms
  DbIndex query query index NaN: instanceKey 08350a962ab15c802c4d4721120ba8b2fe047157e686b36981f9624133d4610b
✔ DbIndex query query index NaN: 3ms
  DbIndex query query index Infinity: instanceKey be2a8bed20fd3ca7fbeffcb6b160471052fc901ae5d3e481af92f6ada01db1f4
✔ DbIndex query query index Infinity: 6ms
  DbIndex query query twice: instanceKey 8684baf476a6b3a52235ce7d588d5f4bf2469c2c1200ee61bd940e831c6ec02c
✔ DbIndex query query twice: 6ms
  DbIndex query query two rows oops: instanceKey 4521cb7f03cf649bb972b0a5e34e1576f86e71be18691bc4ae9d176f143107e7
✔ DbIndex query query two rows oops: 3ms
  DbIndex query query two rows easy: instanceKey 3b76c3c2e2540fd763754e92244bf764784d72c580497094b8b4c9e916f39003
✔ DbIndex query query two rows easy: 4ms
  DbIndex query update index: instanceKey 9c0172155d9d585133bf059e5be06bf0672edf7f89d5148ebfe80ff28edb2657
✔ DbIndex query update index: 24ms
  DbIndex query update index with document update to different key: instanceKey 37875a3b75ccbfd1c48644b2bd545404aa2abc586212373225d0c5e2d3335e56
✔ DbIndex query update index with document update to different key: 32ms
  DbIndex query update index with document deletion: instanceKey e9e1a708e2779f50e41380846697ded3380c1cc6ca223925a4d136e01c6861f5
✔ DbIndex query update index with document deletion: 26ms
✔ DbIndex query with bad index definition query index range: 2ms
  Fireproof takes an optional name: instanceKey 4f37e4d968e66c04521b14656b557ebd06ddde8314591f15fed810482c802121
✔ Fireproof takes an optional name: 0ms
  Fireproof only put and get document: instanceKey a5abb10de9cc396b2223c06745c26688110dc77bca832d541c6f4d78c51463bc
✔ Fireproof only put and get document: 0ms
  Fireproof mvcc put and get document with _clock that matches: instanceKey 0226031dcec5d1dbfc1f9e6f37ddf72970fdf5805736e2fd2dc100804146c4e6
✔ Fireproof mvcc put and get document with _clock that matches: 2ms
  Fireproof get should return an object instance that is not the same as the one in the db: instanceKey 2c453192e21d9fdc720a2a82ebf2eca631771ea75e9d69096e24fe28a5f4dc85
✔ Fireproof get should return an object instance that is not the same as the one in the db: 0ms
  Fireproof get with mvcc option: instanceKey 4f6471484e77046bad06734a98df75dbe9e40b526688bffd55fd452aa57165c3
✔ Fireproof get with mvcc option: 1ms
  Fireproof get with mvcc option where someone else changed another document first: instanceKey ec0ff62b3e517bdc8bcb3085bc17e6ecce2d2cbc1949fbf3d0f0f80ab199e6f8
✔ Fireproof get with mvcc option where someone else changed another document first: 2ms
  Fireproof get from an old snapshot with mvcc option: instanceKey 4403885e34ad6367120a576ea696d3fea1fea15684d5a4109936c1c83375ad3e
✔ Fireproof get from an old snapshot with mvcc option: 2ms
  Fireproof put and get document with _clock that does not match b/c the doc changed: instanceKey 148c6058731c6f4d611d689eed5f4894a7b2aee666e20623f2bffcc5b021574c
✔ Fireproof put and get document with _clock that does not match b/c the doc changed: 2ms
  Fireproof put and get document with _clock that does not match b/c a different doc changed should succeed: instanceKey c5edbd87575593da6466c304ad4dcb83b3cc97e5deb4f1f92230fc967f3f7df9
✔ Fireproof put and get document with _clock that does not match b/c a different doc changed should succeed: 3ms
  Fireproof put and get document with _clock that does not match b/c the doc was deleted: instanceKey 4d617c6f38c2efff586b2931d487ddbb5601d29f88217140b62e92380dd4eedf
err Error: MVCC conflict, document is changed, please reload the document and try again.
  at #putToProllyTree (file:///Users/jchris/Documents/GitHub/fireproof/packages/fireproof/src/fireproof.js:225:15)
  at async Fireproof.put (file:///Users/jchris/Documents/GitHub/fireproof/packages/fireproof/src/fireproof.js:186:12)
  at async Context.<anonymous> (file:///Users/jchris/Documents/GitHub/fireproof/packages/fireproof/test/fireproof.test.js:102:17)
✔ Fireproof put and get document with _clock that does not match b/c the doc was deleted: 3ms
  Fireproof allDocuments: instanceKey c1a5641a255cf81e8a6f1dd87e25a5ea4b942cb1c07409ff2d2642bae1792e28
✔ Fireproof allDocuments: 2ms
  Fireproof has a factory for making new instances with default settings: instanceKey ed6f3ba9c21d9ba4ca57bd15cd5b0f94fa85f471643783abdfbe0e7b4bf6a340
instanceKey a3bff235eeb0df168caf0bb7e529d0672da88854b5569cd180e836f2aa777e7f
✔ Fireproof has a factory for making new instances with default settings: 0ms
  Fireproof an empty database has no documents: instanceKey c3688c36d6c5a14e46131e570d26034d94ccaacb621350e5ba78985ffb6e5cd6
instanceKey 9e2907042c03c31b61b4789f92350620f5c2889a490e91cda7e29d4adeae2532
✔ Fireproof an empty database has no documents: 0ms
  Fireproof update existing document: instanceKey fb6e5deafdc388baef7562c4bafcfeff08f8fc5c7b479148ebe287026cae3214
✔ Fireproof update existing document: 4ms
  Fireproof update document with validation function that doesn't allow it: instanceKey 58627de91b8b56b8086eae384b0f7c07cc5fa32ff7bf43e7d47c8273f1403937
✔ Fireproof update document with validation function that doesn't allow it: 1ms
  Fireproof get missing document: instanceKey cb628967c9cb560f350a5668bf39d809c927d67bea3d8513e206ce8e9d4b6762
✔ Fireproof get missing document: 1ms
  Fireproof delete a document: instanceKey d15eb17c6c6c4a2a9a7a16fc3968a07894c62fd83f38b6bdaae231c6d509c78e
✔ Fireproof delete a document: 1ms
  Fireproof delete a document with validation function that doesn't allow it: instanceKey 8053968a6c619cee04abeed3e6f8592781bfbaafeeab3da76e188aee2f1f0bca
✔ Fireproof delete a document with validation function that doesn't allow it: 2ms
  Fireproof provides docs since tiny: instanceKey 4190f3ab084f1f57d3fafa214f30b8772bff31cc98da3e22bdfd27ce5e7961a8
✔ Fireproof provides docs since tiny: 4ms
  Fireproof provides docs since: instanceKey 5d0aa274affb4f538f860d423ba5ed84bf00206570e09a20e3899a4d46e11ca8
✔ Fireproof provides docs since: 7ms
  Fireproof docs since repeated changes: instanceKey 92154a6826e890bbaef77ba91c7f69dc82b89556ada73a1e3e08f89d7e3172f2
✔ Fireproof docs since repeated changes: 2436ms
  Fireproof concurrent transactions: instanceKey fbbb2dad5d5d973f6401db92c7ff4dd62d43e13c2e023d35cc0e14d84ecf070d
✔ Fireproof concurrent transactions: 57ms
  Fireproof serialize database: instanceKey 42e7f3ad72f450e984d118a07a03f6a527b95ef04a4c157d0263eeffc3496369
✔ Fireproof serialize database: 2ms
  Fireproof clocked changes in order: instanceKey 388e24ae7fdd548741c45eeb975d1d548946370d9f062b262a91b18ae3a933b5
✔ Fireproof clocked changes in order: 6ms
- Fireproof changes in order
  Fulltext with flexsearch search the index: instanceKey 6953de73d83d6a9094a2eb186a03715d8796b463552899df6992d7c8730e690e
✔ Fulltext with flexsearch search the index: 40ms
  DbIndex query serialize database with index: instanceKey 9597c357f61a3804ee1374f872497f2eea1ff3bee21debae6efdd039ffffa2bb
✔ DbIndex query serialize database with index: 11ms
  DbIndex query rehydrate database: instanceKey 1ed40b066f1b03de59dbc67b554018f6c4781432e3aabef956debe97f26f9f2a
✔ DbIndex query rehydrate database: 15ms
✔ Listener all listeners get the reset event: 7ms
✔ Listener can listen to all events: 6ms
✔ Listener shares only new events by default: 2ms
✔ Listener shares all events if asked: 51ms
✔ Listener shares events since db.clock: 6ms
✔ Prolly put a value to a new clock: 1ms
✔ Prolly linear put multiple values: 1ms
✔ Prolly get missing: 0ms
✔ Prolly simple parallel put multiple values: 3ms
- Prolly passing, slow: linear put hundreds of values
  Proofs first put result shoud not include proof: instanceKey 83d7c1999de90ac3798277c7eaf607476fee56d5f6289c582b13505e9ff03dc2
✔ Proofs first put result shoud not include proof: 0ms
- Proofs second put result shoud include proof
  Proofs get result shoud include proof: instanceKey 661bd129481c6774d9b1fa980092864786f2b9c54aa3b4f01d7bee53ff240091
✔ Proofs get result shoud include proof: 0ms
  IPLD encode error reproduce: instanceKey 3b84e3fde70261905cadebae34f3966e8cf51e40dc3f0b9768017bc313ac4595
✔ IPLD encode error reproduce: 6ms
✔ new Valet has default attributes: 0ms
  new Valet can park a car and serve the blocks: queue worker 1 506
✔ new Valet can park a car and serve the blocks: 1ms
✔ new Valet calls the upload function: 0ms

62 passing (3s)
3 pending`

const regex = /instanceKey ([a-f0-9]{64})/g
const validatedKeys = Array.from(goodTest.matchAll(regex), match => match[1])
