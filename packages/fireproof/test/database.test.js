/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable mocha/max-top-level-suites */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { assert, equals, notEquals, matches, resetDirectory } from './helpers.js'
import { Database } from '../dist/test/database.esm.js'
// import { Doc } from '../dist/test/types.d.esm.js'
import { MetaStore } from '../dist/test/store-fs.esm.js'

/**
 * @typedef {Object.<string, any>} DocBody
 */

/**
 * @typedef {Object} Doc
 * @property {string} _id
 * @property {DocBody} [property] - an additional property
 */

describe('basic Database', function () {
  /** @type {Database} */
  let db
  beforeEach(function () {
    db = new Database()
  })
  it('should put', async function () {
    /** @type {Doc} */
    const doc = { _id: 'hello', value: 'world' }
    const ok = await db.put(doc)
    equals(ok.id, 'hello')
  })
  it('get missing should throw', async function () {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
    const e = await (db.get('missing')).catch(e => e)
    matches(e.message, /Not found/)
  })
  it('del missing should result in deleted state', async function () {
    await db.del('missing')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
    const e = await (db.get('missing')).catch(e => e)
    matches(e.message, /Not found/)
  })
  it('has no changes', async function () {
    const { rows } = await db.changes([])
    equals(rows.length, 0)
  })
})

describe('basic Database with record', function () {
  /** @type {Database} */
  let db
  beforeEach(async function () {
    db = new Database()
    /** @type {Doc} */
    const doc = { _id: 'hello', value: 'world' }
    const ok = await db.put(doc)
    equals(ok.id, 'hello')
  })
  it('should get', async function () {
    const doc = await db.get('hello')
    assert(doc)
    equals(doc._id, 'hello')
    equals(doc.value, 'world')
  })
  it('should update', async function () {
    const ok = await db.put({ _id: 'hello', value: 'universe' })
    equals(ok.id, 'hello')
    const doc = await db.get('hello')
    assert(doc)
    equals(doc._id, 'hello')
    equals(doc.value, 'universe')
  })
  it('should del last record', async function () {
    const ok = await db.del('hello')
    equals(ok.id, 'hello')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    const e = await (db.get('hello')).catch(e => e)
    matches(e.message, /Not found/)
  })
  it('has changes', async function () {
    const { rows } = await db.changes([])
    equals(rows.length, 1)
    equals(rows[0].key, 'hello')
    equals(rows[0].value._id, 'hello')
  })
  it('is not persisted', async function () {
    const db2 = new Database()
    const { rows } = await db2.changes([])
    equals(rows.length, 0)
    const doc = await db2.get('hello').catch(e => e)
    assert(doc.message)
  })
})

describe('named Database with record', function () {
  /** @type {Database} */
  let db
  beforeEach(async function () {
    await resetDirectory(MetaStore.dataDir, 'test-db-name')

    db = new Database('test-db-name')
    /** @type {Doc} */
    const doc = { _id: 'hello', value: 'world' }
    const ok = await db.put(doc)
    equals(ok.id, 'hello')
  })
  it('should get', async function () {
    const doc = await db.get('hello')
    assert(doc)
    equals(doc._id, 'hello')
    equals(doc.value, 'world')
  })
  it('should update', async function () {
    const ok = await db.put({ _id: 'hello', value: 'universe' })
    equals(ok.id, 'hello')
    const doc = await db.get('hello')
    assert(doc)
    equals(doc._id, 'hello')
    equals(doc.value, 'universe')
  })
  it('should del last record', async function () {
    const ok = await db.del('hello')
    equals(ok.id, 'hello')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    const e = await (db.get('hello')).catch(e => e)
    matches(e.message, /Not found/)
  })
  it('has changes', async function () {
    const { rows } = await db.changes([])
    equals(rows.length, 1)
    equals(rows[0].key, 'hello')
    equals(rows[0].value._id, 'hello')
  })
  it('should have a key', async function () {
    const { rows } = await db.changes([])
    equals(rows.length, 1)
    const loader = db._crdt.blocks.loader
    await loader.ready
    equals(loader.key.length, 64)
    equals(loader.keyId.length, 64)
    notEquals(loader.key, loader.keyId)
  })
  it('should work right with a sequence of changes', async function () {
    const numDocs = 10
    for (let i = 0; i < numDocs; i++) {
      const doc = { _id: `id-${i}`, hello: 'world' }
      const ok = await db.put(doc)
      equals(ok.id, `id-${i}`)
    }
    const { rows } = await db.changes([])
    equals(rows.length, numDocs + 1)

    const ok6 = await db.put({ _id: `id-${6}`, hello: 'block' })
    equals(ok6.id, `id-${6}`)

    for (let i = 0; i < numDocs; i++) {
      const id = `id-${i}`
      const doc = await db.get(id)
      assert(doc)
      equals(doc._id, id)
      equals(doc.hello.length, 5)
    }

    const { rows: rows2 } = await db.changes([])
    equals(rows2.length, numDocs + 1)

    const ok7 = await db.del(`id-${7}`)
    equals(ok7.id, `id-${7}`)

    const { rows: rows3 } = await db.changes([])
    equals(rows3.length, numDocs + 1)
    equals(rows3[numDocs].key, `id-${7}`)
    equals(rows3[numDocs].value._deleted, true)

    // test limit
    const { rows: rows4 } = await db.changes([], { limit: 5 })
    equals(rows4.length, 5)
  })

  it('should work right after compaction', async function () {
    const numDocs = 10
    for (let i = 0; i < numDocs; i++) {
      const doc = { _id: `id-${i}`, hello: 'world' }
      const ok = await db.put(doc)
      equals(ok.id, `id-${i}`)
    }
    const { rows } = await db.changes([])
    equals(rows.length, numDocs + 1)

    await db.compact()

    const { rows: rows3 } = await db.changes([], { dirty: true })
    equals(rows3.length, numDocs + 1)

    const { rows: rows4 } = await db.changes([], { dirty: false })
    equals(rows4.length, numDocs + 1)
  })
})

// describe('basic Database parallel writes / public', function () {
//   /** @type {Database} */
//   let db
//   const writes = []
//   beforeEach(async function () {
//     await resetDirectory(MetaStore.dataDir, 'test-parallel-writes')
//     db = new Database('test-parallel-writes', { public: true })
//     /** @type {Doc} */
//     for (let i = 0; i < 10; i++) {
//       const doc = { _id: `id-${i}`, hello: 'world' }
//       writes.push(db.put(doc))
//     }
//     await Promise.all(writes)
//   })

describe('basic Database parallel writes / public', function () {
  /** @type {Database} */
  let db
  const writes = []
  beforeEach(async function () {
    await resetDirectory(MetaStore.dataDir, 'test-parallel-writes')
    db = new Database('test-parallel-writes', { public: true })
    /** @type {Doc} */
    for (let i = 0; i < 10; i++) {
      const doc = { _id: `id-${i}`, hello: 'world' }
      writes.push(db.put(doc))
    }
    await Promise.all(writes)
  })
  it('should have one head', function () {
    const crdt = db._crdt
    equals(crdt.clock.head.length, 1)
  })
  it('should write all', async function () {
    for (let i = 0; i < 10; i++) {
      const id = `id-${i}`
      const doc = await db.get(id)
      assert(doc)
      equals(doc._id, id)
      equals(doc.hello, 'world')
    }
  })
  it('should del all', async function () {
    for (let i = 0; i < 10; i++) {
      const id = `id-${i}`
      const ok = await db.del(id)
      equals(ok.id, id)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      const e = await (db.get(id)).catch(e => e)
      matches(e.message, /Not found/)
    }
  })
  it('should delete all in parallel', async function () {
    const deletes = []
    for (let i = 0; i < 10; i++) {
      const id = `id-${i}`
      deletes.push(db.del(id))
    }
    await Promise.all(deletes)
    for (let i = 0; i < 10; i++) {
      const id = `id-${i}`
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      const e = await (db.get(id)).catch(e => e)
      matches(e.message, /Not found/)
    }
  })
  it('has changes', async function () {
    const { rows } = await db.changes([])
    equals(rows.length, 10)
    for (let i = 0; i < 10; i++) {
      equals(rows[i].key, 'id-' + i)
    }
  })
  it('should not have a key', async function () {
    const { rows } = await db.changes([])
    equals(rows.length, 10)
    assert(db.opts.public)
    assert(db._crdt.opts.public)
    const loader = db._crdt.blocks.loader
    await loader.ready
    equals(loader.key, undefined)
    equals(loader.keyId, undefined)
  })
})

describe('basic Database with subscription', function () {
  /** @type {Database} */
  let db, didRun, unsubscribe
  beforeEach(function () {
    db = new Database()
    didRun = 0
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    unsubscribe = db.subscribe((docs) => {
      assert(docs[0]._id)
      didRun++
    })
  })
  it('should run on put', async function () {
    /** @type {Doc} */
    const doc = { _id: 'hello', message: 'world' }
    const ok = await db.put(doc)
    equals(ok.id, 'hello')
    equals(didRun, 1)
  })
  it('should unsubscribe', async function () {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    unsubscribe()
    /** @type {Doc} */
    const doc = { _id: 'hello', message: 'again' }
    const ok = await db.put(doc)
    equals(ok.id, 'hello')
    equals(didRun, 0)
  })
})
