import { describe, it, beforeEach } from 'mocha'
import assert from 'node:assert'
import { Fireproof } from '../src/fireproof.js'
import { DbIndex } from '../src/db-index.js'

describe('DbIndex query', () => {
  let database = Fireproof.storage()
  let index = new DbIndex(database, () => {})
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
    index = new DbIndex(
      database,
      'namesByAge',
      function (doc, map) {
        map(doc.age, doc.name)
      },
      null
    )
  })
  it('has a name', () => {
    assert.equal(index.name, 'namesByAge')
  })
  it('can get by name from db', () => {
    assert.equal(database.index(index.name), index)
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
    assert.equal(result.rows[result.rows.length - 1].value, 'dave')
  })
  it('query index limit', async () => {
    const result = await index.query({ limit: 3 })
    assert(result, 'did return result')
    assert(result.rows)
    assert.equal(result.rows.length, 3, 'six row matched')
    assert.equal(result.rows[0].key, 4)
    assert.equal(result.rows[0].value, 'emily')
  })
  it('query index NaN', async () => {
    const result = await index.query({ range: [NaN, 44] })
    assert(result, 'did return result')
    assert(result.rows)
    assert.equal(result.rows.length, 5, 'six row matched')
    assert.equal(result.rows[0].key, 4)
    assert.equal(result.rows[0].value, 'emily')
    assert.equal(result.rows[result.rows.length - 1].value, 'carol')
  })
  it('query index Infinity', async () => {
    const result = await index.query({ range: [42, Infinity] })
    assert(result, 'did return result')
    assert(result.rows)
    assert.equal(result.rows.length, 2, 'six row matched')
    assert.equal(result.rows[0].key, 43)
    assert.equal(result.rows[0].value, 'carol')
    assert.equal(result.rows[result.rows.length - 1].value, 'dave')
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
    assert.equal(bresult.rows.length, 6, 'all row matched')

    const snapClock = database.clock

    const notYet = await database.get('xxxx-3c3a-4b5e-9c1c-8c5c0c5c0c5c').catch(e => e)
    assert.equal(notYet.message, 'Not found', 'not yet there')
    const response = await database.put({ _id: 'xxxx-3c3a-4b5e-9c1c-8c5c0c5c0c5c', name: 'Xander', age: 53 })
    assert(response)
    assert(response.id, 'should have id')

    const gotX = await database.get(response.id)
    assert(gotX)
    assert(gotX.name === 'Xander', 'got Xander')

    const snap = Fireproof.snapshot(database, snapClock)

    const aliceOld = await snap.get('a1s3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c') // .catch((e) => e)
    assert.equal(aliceOld.name, 'alice', 'alice old')

    const noX = await snap.get(response.id).catch(e => e)
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

    const DOCID = 'xander-doc'
    const r1 = await database.put({ _id: DOCID, name: 'Xander', age: 53 })
    assert(r1.id, 'should have id')

    const result = await index.query({ range: [51, 54] })
    assert(result, 'did return result')
    assert(result.rows)
    assert.equal(result.rows.length, 1, '1 row matched')
    assert(result.rows[0].key === 53, 'correct key')

    const snap = Fireproof.snapshot(database)

    const response = await database.put({ _id: DOCID, name: 'Xander', age: 63 })
    assert(response)
    assert(response.id, 'should have id')

    const oldXander = await snap.get(r1.id)
    assert.equal(oldXander.age, 53, 'old xander')

    const newZander = await database.get(r1.id)
    assert.equal(newZander.age, 63, 'new xander')

    const result2 = await index.query({ range: [61, 64] })
    assert(result2, 'did return result')
    assert(result2.rows)
    assert.equal(result2.rows.length, 1, '1 row matched')
    assert(result2.rows[0].key === 63, 'correct key')

    const resultempty = await index.query({ range: [51, 54] })
    assert(resultempty, 'did return resultempty')
    assert(resultempty.rows)
    assert(resultempty.rows.length === 0, 'old Xander should be gone')

    const allresult = await index.query({ range: [2, 90] })
    // todo
    assert.equal(allresult.rows.length, 7, 'all row matched')
  })
  it('update index with document deletion', async () => {
    await index.query({ range: [51, 54] })

    const DOCID = 'xxxx-3c3a-4b5e-9c1c-8c5c0c5c0c5c'
    const r1 = await database.put({ _id: DOCID, name: 'Xander', age: 53 })
    assert(r1.id, 'should have id')

    const result = await index.query({ range: [51, 54] })
    assert(result, 'did return result')
    assert(result.rows)
    assert.equal(result.rows.length, 1, '1 row matched')
    assert(result.rows[0].key === 53, 'correct key')

    const snap = Fireproof.snapshot(database)

    const response = await database.del(DOCID)
    assert(response)
    assert(response.id, 'should have id')

    const oldXander = await snap.get(r1.id)
    assert.equal(oldXander.age, 53, 'old xander')

    const newZander = await database.get(r1.id).catch(e => e)
    assert.equal(newZander.message, 'Not found', 'new xander')

    const allresult = await index.query({ range: [2, 90] })
    // todo
    assert.equal(allresult.rows.length, 6, 'all row matched')

    const result2 = await index.query({ range: [51, 54] })
    assert(result2, 'did return result')
    assert(result2.rows)
    assert.equal(result2.rows.length, 0, '0 row matched')
  })
  it('update index with deletion all rows', async () => {
    await index.query({ range: [51, 54] })

    const DOCID = 'xxxx-3c3a-4b5e-9c1c-8c5c0c5c0c5c'
    const r1 = await database.put({ _id: DOCID, name: 'Xander', age: 53 })
    assert(r1.id, 'should have id')

    const result = await index.query({ range: [51, 54] })
    assert(result, 'did return result')
    assert(result.rows)
    assert.equal(result.rows.length, 1, '1 row matched')
    assert(result.rows[0].key === 53, 'correct key')

    const response = await database.del(DOCID)
    assert(response)
    assert(response.id, 'should have id')

    const allresult = await index.query({ range: [2, 90] })
    // todo
    assert.equal(allresult.rows.length, 6, 'all row matched')

    const all = await Promise.all(allresult.rows.map(({ id }) => database.del(id)))

    assert.equal(all.length, 6)

    const result2 = await index.query({ range: [51, 54] })
    assert(result2, 'did return result')
    assert(result2.rows)
    assert.equal(result2.rows.length, 0, '0 row matched')

    const rafter = await database.put({ _id: '98a6sdfy', name: 'Adam', age: 20 })
    assert.equal(rafter.id, '98a6sdfy')

    const result3 = await index.query()
    assert(result3, 'did return result')
    assert(result3.rows)
    assert.equal(result3.rows.length, 1, '1 row matched')
  })
  it('with includeDocs = true', async () => {
    const result = await index.query({ range: [39, 44], includeDocs: true })
    assert.equal(result.rows[0].value, 'alice')
    assert(result.rows[0].doc, 'doc should be included')
    assert.equal(result.rows[0].doc.name, 'alice')
  })
  it('defaults to includeDocs = false', async () => {
    const result = await index.query({ range: [39, 44] })
    assert.equal(result.rows[0].value, 'alice')
    assert(!result.rows[0].doc, 'doc should not be included')
  })
})

describe('DbIndex query with bad index definition', () => {
  let database, index
  beforeEach(async () => {
    database = Fireproof.storage()
    await database.put({ _id: 'a1s3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c', name: 'alice', age: 40 })
    index = new DbIndex(database, null, function (doc, map) {
      map(doc.oops.missingField, doc.name)
    })
  })
  it('has a default name', () => {
    assert.equal(index.name, 'doc.oops.missingField, doc.name')
  })
  it('query index range', async () => {
    const oldErrFn = console.error
    console.error = () => {}
    await index.query({ range: [39, 44] }).catch(e => {
      assert(/missingField/.test(e.message))
      console.error = oldErrFn
    })
  })
})

describe('DbIndex query with compound key', () => {
  let database, index
  beforeEach(async () => {
    database = Fireproof.storage()
    await database.put({ _id: 'a1s', name: 'alice', age: 40 })
    await database.put({ _id: 'b3x', name: 'bob', age: 4 })
    await database.put({ _id: 'b4f', name: 'bob', age: 24 })
    await database.put({ _id: 'c4f', name: 'carol', age: 21 })
    index = new DbIndex(database, null, doc => [doc.name, doc.age])
  })
  it('sets string fn', () => {
    assert.equal(index.mapFnString, 'doc => [doc.name, doc.age]')
  })
  it('has a default name', () => {
    assert.equal(index.name, '[doc.name, doc.age]')
  })
  it('query index range', async () => {
    const result = await index.query({
      range: [
        ['alice', NaN],
        ['alice', Infinity]
      ]
    })
    assert.equal(result.rows.length, 1)
    assert.equal(result.rows[0].value, null)
    assert.deepEqual(result.rows[0].key, ['alice', 40])
  })
  it('query index prefix', async () => {
    const result = await index.query({ prefix: ['alice'] })
    assert.equal(result.rows.length, 1)
    assert.equal(result.rows[0].value, null)
    assert.deepEqual(result.rows[0].key, ['alice', 40])
  })
  it('query index range two', async () => {
    const result = await index.query({
      range: [
        ['bob', NaN],
        ['bob', Infinity]
      ]
    })
    assert.equal(result.rows.length, 2)
    assert.equal(result.rows[0].value, null)
    assert.deepEqual(result.rows[0].key, ['bob', 4])
  })
  it('query index prefix two', async () => {
    const result = await index.query({ prefix: 'bob' })
    assert.equal(result.rows.length, 2)
    assert.equal(result.rows[0].value, null)
    assert.deepEqual(result.rows[0].key, ['bob', 4])
  })
})

describe('DbIndex query with concise index definition', () => {
  let database, index
  beforeEach(async () => {
    database = Fireproof.storage()
    await database.put({ _id: 'a1s3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c', name: 'alice', age: 40 })
    index = new DbIndex(database, null, doc => doc.age)
  })
  it('sets string fn', () => {
    assert.equal(index.mapFnString, 'doc => doc.age')
  })
  it('has a default name', () => {
    assert.equal(index.name, 'doc.age')
  })
  it('query index range', async () => {
    const result = await index.query({ range: [39, 44] })
    assert.equal(result.rows.length, 1)
    assert.equal(result.rows[0].value, null)
  })
  it('defaults to includeDocs = true', async () => {
    const result = await index.query({ range: [39, 44] })
    assert.equal(result.rows[0].value, null)
    assert(result.rows[0].doc, 'doc is included')
    assert.equal(result.rows[0].doc.name, 'alice')
  })
  it('with includeDocs = false', async () => {
    const result = await index.query({ range: [39, 44], includeDocs: false })
    assert.equal(result.rows[0].value, null)
    assert(!result.rows[0].doc, 'doc should not be included')
  })
  it('query index range descending', async () => {
    await database.put({ _id: 'randy-1234', name: 'randy', age: 41 })
    const result = await index.query({ range: [39, 44], descending: true })
    assert.equal(result.rows.length, 2)
    assert.equal(result.rows[0].key, 41)
  })
})
