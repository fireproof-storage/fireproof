import { describe, it, beforeEach } from 'mocha'
import assert from 'node:assert'
import Blockstore from '../src/blockstore.js'
import Fireproof from '../src/fireproof.js'
import DbIndex from '../src/db-index.js'
import Hydrator from '../src/hydrator.js'
console.x = function () {}

describe('DbIndex query', () => {
  let database, index
  beforeEach(async () => {
    database = Fireproof.storage()
    const docs = [
      { _id: 'a1s3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c', name: 'alice', age: 40 },
      { _id: 'b2s3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c', name: 'bob', age: 40 },
      { _id: 'c3s3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c', name: 'carol', age: 43 },
      { _id: 'd4s3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c', name: 'dave', age: 48 },
      { _id: 'e4s3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c', name: 'emily', age: 4 },
      { _id: 'f4s3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c', name: 'frank', age: 7 }
    ]
    for (const doc of docs) {
      const id = doc._id
      const response = await database.put(doc)
      assert(response)
      assert(response.id, 'should have id')
      assert.equal(response.id, id)
    }
    index = new DbIndex(database, function (doc, map) {
      map(doc.age, doc.name)
    })
  })
  it('query index range', async () => {
    const result = await index.query({ range: [41, 49] })
    assert(result, 'did return result')
    assert(result.rows)
    assert.equal(result.rows.length, 2, 'two row matched')
    assert.equal(result.rows[0].key, 43)
    assert(result.rows[0].value === 'carol', 'correct value')
  })
  it('query exact key', async () => {
    let result = await index.query({ range: [41, 44] })
    assert(result.rows[0].key === 43, 'correct key')
    result = await index.query({ key: 43 })
    assert(result, 'did return result')
    assert(result.rows)
    assert.equal(result.rows.length, 1, 'one row matched')
    assert.equal(result.rows[0].key, 43)
    assert(result.rows[0].value === 'carol', 'correct value')
  })
  it('query index all', async () => {
    const result = await index.query()
    assert(result, 'did return result')
    assert(result.rows)
    assert.equal(result.rows.length, 6, 'six row matched')
    assert.equal(result.rows[0].key, 4)
    assert.equal(result.rows[0].value, 'emily')
  })
  it('query twice', async () => {
    let result = await index.query({ range: [41, 44] })
    assert(result, 'did return result')
    assert(result.rows)
    assert.equal(result.rows.length, 1, 'one row matched')
    result = await index.query({ range: [41, 44] })
    assert(result.rows[0].key === 43, 'correct key')
    assert(result.rows[0].value === 'carol', 'correct value')
  })
  it('query two rows oops', async () => {
    const result = await index.query({ range: [39, 41] })
    assert(result, 'did return result')
    assert(result.rows)
    assert.equal(result.rows[0].key, 40, 'correct key') // TODO fix this is currently collating as strings - use gson?
    assert.equal(result.rows.length, 2, '2 row matched')
    assert(result.rows[0].value === 'alice', 'correct value')
  })
  it('query two rows easy', async () => {
    const result = await index.query({ range: [40, 41] })
    assert(result, 'did return result')
    assert(result.rows)
    assert.equal(result.rows.length, 2, '2 row matched')
    assert(result.rows[0].key === 40, 'correct key')
    assert(result.rows[0].value === 'alice', 'correct value')
  })
  it('update index', async () => {
    const bresult = await index.query({ range: [2, 90] })
    assert(bresult, 'did return bresult')
    // console.x('bresult.rows', bresult.rows)
    assert.equal(bresult.rows.length, 6, 'all row matched')

    const snapClock = database.clock

    const notYet = await database.get('xxxx-3c3a-4b5e-9c1c-8c5c0c5c0c5c').catch((e) => e)
    assert.equal(notYet.message, 'Not found', 'not yet there')
    console.x('initial Xander 53', notYet)
    const response = await database.put({ _id: 'xxxx-3c3a-4b5e-9c1c-8c5c0c5c0c5c', name: 'Xander', age: 53 })
    assert(response)
    assert(response.id, 'should have id')

    const gotX = await database.get(response.id)
    assert(gotX)
    assert(gotX.name === 'Xander', 'got Xander')
    console.x('got X')

    const snap = Hydrator.snapshot(database, snapClock)

    const aliceOld = await snap.get('a1s3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')// .catch((e) => e)
    console.x('aliceOld', aliceOld)
    assert.equal(aliceOld.name, 'alice', 'alice old')

    const noX = await snap.get(response.id).catch((e) => e)
    assert.equal(noX.message, 'Not found', 'not yet there')

    const allresult = await index.query({ range: [2, 90] })
    assert.equal(allresult.rows.length, 7, 'all row matched')

    const result = await index.query({ range: [51, 54] })
    assert(result, 'did return result')
    assert(result.rows)
    assert.equal(result.rows.length, 1, '1 row matched')
    assert(result.rows[0].key === 53, 'correct key')
  })
  it('update index with document update to different key', async () => {
    await index.query({ range: [51, 54] })

    console.x('--- make Xander 53')
    const DOCID = 'xander-doc'
    const r1 = await database.put({ _id: DOCID, name: 'Xander', age: 53 })
    assert(r1.id, 'should have id')

    const result = await index.query({ range: [51, 54] })
    assert(result, 'did return result')
    assert(result.rows)
    console.x('result.rows', result.rows)
    assert.equal(result.rows.length, 1, '1 row matched')
    assert(result.rows[0].key === 53, 'correct key')

    const snap = Hydrator.snapshot(database)

    console.x('--- make Xander 63')
    const response = await database.put({ _id: DOCID, name: 'Xander', age: 63 })
    assert(response)
    assert(response.id, 'should have id')

    const oldXander = await snap.get(r1.id)
    assert.equal(oldXander.age, 53, 'old xander')
    // console.x('--- test snapshot', snap.clock)

    const newZander = await database.get(r1.id)
    assert.equal(newZander.age, 63, 'new xander')

    // console.x('--- test liveshot', database.clock)

    const result2 = await index.query({ range: [61, 64] })
    assert(result2, 'did return result')
    assert(result2.rows)
    assert.equal(result2.rows.length, 1, '1 row matched')
    assert(result2.rows[0].key === 63, 'correct key')

    const resultempty = await index.query({ range: [51, 54] })
    assert(resultempty, 'did return resultempty')
    assert(resultempty.rows)
    console.x('resultempty.rows', resultempty.rows)
    assert(resultempty.rows.length === 0, 'old Xander should be gone')

    const allresult = await index.query({ range: [2, 90] })
    console.x('allresult.rows', allresult.rows)
    // todo
    assert.equal(allresult.rows.length, 7, 'all row matched')
  })
  it('update index with document deletion', async () => {
    await index.query({ range: [51, 54] })

    console.x('--- make Xander 53')
    const DOCID = 'xxxx-3c3a-4b5e-9c1c-8c5c0c5c0c5c'
    const r1 = await database.put({ _id: DOCID, name: 'Xander', age: 53 })
    assert(r1.id, 'should have id')

    const result = await index.query({ range: [51, 54] })
    assert(result, 'did return result')
    assert(result.rows)
    console.x('result.rows', result.rows)
    assert.equal(result.rows.length, 1, '1 row matched')
    assert(result.rows[0].key === 53, 'correct key')

    const snap = Hydrator.snapshot(database)

    console.x('--- delete Xander 53')
    const response = await database.del(DOCID)
    assert(response)
    assert(response.id, 'should have id')

    const oldXander = await snap.get(r1.id)
    assert.equal(oldXander.age, 53, 'old xander')
    // console.x('--- test snapshot', snap.clock)

    const newZander = await database.get(r1.id).catch((e) => e)
    assert.equal(newZander.message, 'Not found', 'new xander')
    // console.x('--- test liveshot', database.clock)

    const allresult = await index.query({ range: [2, 90] })
    console.x('allresult.rows', allresult.rows)
    // todo
    assert.equal(allresult.rows.length, 6, 'all row matched')

    const result2 = await index.query({ range: [51, 54] })
    assert(result2, 'did return result')
    assert(result2.rows)
    assert.equal(result2.rows.length, 0, '0 row matched')
  })
})

describe('DbIndex query with bad index definition', () => {
  let database, index
  beforeEach(async () => {
    database = new Fireproof(new Blockstore(), []) // todo: these need a cloud name aka w3name, add this after we have cloud storage of blocks
    await database.put({ _id: 'a1s3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c', name: 'alice', age: 40 })
    index = new DbIndex(database, function (doc, map) {
      map(doc.oops.missingField, doc.name)
    })
  })
  it('query index range', async () => {
    const oldErrFn = console.error
    console.error = () => {}
    await index.query({ range: [41, 44] }).catch((e) => {
      assert(/missingField/.test(e.message))
      console.error = oldErrFn
    })
  })
})
