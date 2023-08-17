/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Index, index } from '../dist/test/index.esm.js'
import { Database, database } from '../dist/test/database.esm.js'
import { CRDT } from '../dist/test/crdt.esm.js'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { assert, matches, equals, resetDirectory, notEquals, equalsJSON } from './helpers.js'

import { testConfig } from '../dist/test/store-fs.esm.js'

describe('basic Index', function () {
  let db, indexer, didMap
  beforeEach(async function () {
    await resetDirectory(testConfig.dataDir, 'test-indexer')

    db = new Database('test-indexer')
    await db.put({ title: 'amazing' })
    await db.put({ title: 'creative' })
    await db.put({ title: 'bazillas' })
    indexer = new Index(db._crdt, 'hello', (doc) => {
      didMap = true
      return doc.title
    })
  })
  it('should have properties', function () {
    equals(indexer.crdt, db._crdt)
    equals(indexer.name, 'hello')
    assert(indexer.mapFn)
  })
  it('should call the map function on first query', async function () {
    didMap = false
    await indexer.query()
    assert(didMap)
  })
  it('should not call the map function on second query', async function () {
    await indexer.query()
    didMap = false
    await indexer.query()
    assert(!didMap)
  })
  it('should get results', async function () {
    const result = await indexer.query()
    assert(result)
    assert(result.rows)
    equals(result.rows.length, 3)
  })
  it('should be in order', async function () {
    const { rows } = await indexer.query()
    equals(rows[0].key, 'amazing')
  })
  it('should work with limit', async function () {
    const { rows } = await indexer.query({ limit: 1 })
    equals(rows.length, 1)
  })
  it('should work with descending', async function () {
    const { rows } = await indexer.query({ descending: true })
    equals(rows[0].key, 'creative')
  })
  it('should range query all', async function () {
    const { rows } = await indexer.query({ range: ['a', 'z'] })
    equals(rows[0].key, 'amazing')
    equals(rows.length, 3)
  })
  it('should range query', async function () {
    const { rows } = await indexer.query({ range: ['b', 'd'] })
    equals(rows[0].key, 'bazillas')
  })
  it('should key query', async function () {
    const { rows } = await indexer.query({ key: 'bazillas' })
    equals(rows.length, 1)
  })
  it('should include docs', async function () {
    const { rows } = await indexer.query({ includeDocs: true })
    assert(rows[0].doc)
    equals(rows[0].doc._id, rows[0].id)
  })
})

// eslint-disable-next-line mocha/max-top-level-suites
describe('Index query with compound key', function () {
  let db, indexer
  beforeEach(async function () {
    await resetDirectory(testConfig.dataDir, 'test-indexer')
    db = new Database('test-indexer')
    await db.put({ title: 'amazing', score: 1 })
    await db.put({ title: 'creative', score: 2 })
    await db.put({ title: 'creative', score: 20 })
    await db.put({ title: 'bazillas', score: 3 })
    indexer = new Index(db._crdt, 'hello', (doc) => {
      return [doc.title, doc.score]
    })
  })
  it('should prefix query', async function () {
    const { rows } = await indexer.query({ prefix: 'creative' })
    equals(rows.length, 2)
    equalsJSON(rows[0].key, ['creative', 2])
    equalsJSON(rows[1].key, ['creative', 20])
  })
})

describe('basic Index with map fun', function () {
  let db, indexer
  beforeEach(async function () {
    await resetDirectory(testConfig.dataDir, 'test-indexer')

    db = new Database('test-indexer')
    await db.put({ title: 'amazing' })
    await db.put({ title: 'creative' })
    await db.put({ title: 'bazillas' })
    indexer = new Index(db._crdt, 'hello', (doc, map) => {
      map(doc.title)
    })
  })
  it('should get results', async function () {
    const result = await indexer.query()
    assert(result)
    assert(result.rows)
    equals(result.rows.length, 3)
  })
})

describe('basic Index with string fun', function () {
  let db, indexer
  beforeEach(async function () {
    await resetDirectory(testConfig.dataDir, 'test-indexer')

    db = new Database('test-indexer')
    await db.put({ title: 'amazing' })
    await db.put({ title: 'creative' })
    await db.put({ title: 'bazillas' })
    indexer = new Index(db._crdt, 'title')
  })
  it('should get results', async function () {
    const result = await indexer.query()
    assert(result)
    assert(result.rows)
    equals(result.rows.length, 3)
  })
  it('should include docs', async function () {
    const { rows } = await indexer.query()
    assert(rows[0].doc)
  })
})

describe('basic Index upon cold start', function () {
  let crdt, indexer, result, didMap, mapFn
  beforeEach(async function () {
    await resetDirectory(testConfig.dataDir, 'test-indexer-cold')
    await resetDirectory(testConfig.dataDir, 'test-indexer-cold.idx')

    // db = database()
    crdt = new CRDT('test-indexer-cold')
    await crdt.bulk([
      { key: 'abc1', value: { title: 'amazing' } },
      { key: 'abc2', value: { title: 'creative' } },
      { key: 'abc3', value: { title: 'bazillas' } }])
    didMap = 0
    mapFn = (doc) => {
      didMap++
      return doc.title
    }
    indexer = await index({ _crdt: crdt }, 'hello', mapFn)
    // new Index(db._crdt.indexBlocks, db._crdt, 'hello', mapFn)
    result = await indexer.query()
    equalsJSON(indexer.indexHead, crdt._head)
  })
  it('should call map on first query', function () {
    assert(didMap)
    equals(didMap, 3)
  })
  it('should get results on first query', function () {
    assert(result)
    assert(result.rows)
    equals(result.rows.length, 3)
  })
  it('should work on cold load', async function () {
    const crdt2 = new CRDT('test-indexer-cold')
    const { result, head } = await crdt2.changes()
    assert(result)
    await crdt2.ready
    const indexer2 = await index({ _crdt: crdt2 }, 'hello', mapFn)
    await indexer2.ready
    equalsJSON(indexer2.indexHead, head)
    const result2 = await indexer2.query()
    assert(result2)
    equals(result2.rows.length, 3)
    equalsJSON(indexer2.indexHead, head)
  })
  it('should not rerun the map function on seen changes', async function () {
    didMap = 0
    const crdt2 = new CRDT('test-indexer-cold')
    const indexer2 = await index({ _crdt: crdt2 }, 'hello', mapFn)
    const { result, head } = await crdt2.changes([])
    equals(result.length, 3)
    equals(head.length, 1)
    const { result: ch2, head: h2 } = await crdt2.changes(head)
    equals(ch2.length, 0)
    equals(h2.length, 1)
    equalsJSON(h2, head)
    const result2 = await indexer2.query()
    equalsJSON(indexer2.indexHead, head)
    assert(result2)
    equals(result2.rows.length, 3)
    equals(didMap, 0)
    await crdt2.bulk([
      { key: 'abc4', value: { title: 'despicable' } }])

    const { result: ch3, head: h3 } = await crdt2.changes(head)
    equals(ch3.length, 1)
    equals(h3.length, 1)
    const result3 = await indexer2.query()
    assert(result3)
    equals(result3.rows.length, 4)
    equals(didMap, 1)
  })
  it('shouldnt allow map function definiton to change', async function () {
    const crdt2 = new CRDT('test-indexer-cold')
    const e = await index({ _crdt: crdt2 }, 'hello', (doc) => doc.title).query().catch((e) => e)
    matches(e.message, /cannot apply/)
  })
})

describe('basic Index with no data', function () {
  let db, indexer, didMap
  beforeEach(async function () {
    await resetDirectory(testConfig.dataDir, 'test-indexer')

    db = new Database('test-indexer')
    indexer = new Index(db._crdt, 'hello', (doc) => {
      didMap = true
      return doc.title
    })
  })
  it('should have properties', function () {
    equals(indexer.crdt, db._crdt)
    equals(indexer.name, 'hello')
    assert(indexer.mapFn)
  })
  it('should not call the map function on first query', async function () {
    didMap = false
    await indexer.query()
    assert(!didMap)
  })
  it('should not call the map function on second query', async function () {
    await indexer.query()
    didMap = false
    await indexer.query()
    assert(!didMap)
  })
  it('should get results', async function () {
    const result = await indexer.query()
    assert(result)
    assert(result.rows)
    equals(result.rows.length, 0)
  })
})
