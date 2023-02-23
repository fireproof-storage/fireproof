import { describe, it, before } from 'mocha'
import assert from 'node:assert'
import { Blockstore } from './helpers.js'
import Fireproof from '../fireproof.js'
import Index from '../db-index.js'

let database, index

describe('Index query', () => {
  before(async () => {
    database = new Fireproof(new Blockstore(), []) // todo: these need a cloud name aka w3name, add this after we have cloud storage of blocks
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
    index = new Index(database, function (doc, map) {
      map(doc.age, doc.name)
    })
  })
  it('define index', async () => {
    const result = await index.query({ range: [41, 44] })
    assert(result, 'did return result')
    assert(result.rows)
    assert.equal(result.rows.length, 1, 'one row matched')
    assert(result.rows[0].key === 43, 'correct key')
    assert(result.rows[0].value === 'carol', 'correct value')
  })
  it('query twice', async () => {
    const result = await index.query({ range: [41, 44] })
    assert(result, 'did return result')
    assert(result.rows)
    assert.equal(result.rows.length, 1, 'one row matched')
    assert(result.rows[0].key === 43, 'correct key')
    assert(result.rows[0].value === 'carol', 'correct value')
  })
  it.skip('query two rows oops', async () => {
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
    // const dave = database.get('d4s3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')

    // console.log()

    const bresult = await index.query({ range: [2, 90] })
    assert(bresult, 'did return bresult')
    assert(bresult.rows)
    // console.log('bresult.rows', bresult.rows)
    assert.equal(bresult.rows.length, 6, 'all row matched')

    const response = await database.put({ _id: 'xxxx-3c3a-4b5e-9c1c-8c5c0c5c0c5c', name: 'Xander', age: 53 })
    assert(response)
    assert(response.id, 'should have id')
    const allresult = await index.query({ range: [2, 90] })
    // console.log('allresult.rows 6', allresult.rows)
    // todo
    // assert.equal(allresult.rows.length, 7, 'all row matched')

    const result = await index.query({ range: [51, 54] })
    assert(result, 'did return result')
    assert(result.rows)
    assert.equal(result.rows.length, 1, '1 row matched')
    assert(result.rows[0].key === 53, 'correct key')
  })
  it('update index with document update to different key', async () => {
    const r1 = await database.put({ _id: 'dxxxx-3c3a-4b5e-9c1c-8c5c0c5c0c5c', name: 'dXander', age: 53 })
    assert(r1.id, 'should have id')

    const result = await index.query({ range: [51, 54] })
    assert(result, 'did return result')
    assert(result.rows)
    console.log('result.rows', result.rows)
    // assert.equal(result.rows.length, 1, '1 row matched')
    assert(result.rows[0].key === 53, 'correct key')

    const response = await database.put({ _id: 'xxxx-3c3a-4b5e-9c1c-8c5c0c5c0c5c', name: 'Xander', age: 63 })
    assert(response)
    assert(response.id, 'should have id')
    const allresult = await index.query({ range: [2, 90] })
    console.log('allresult.rows', allresult.rows)
    // todo
    // assert.equal(allresult.rows.length, 6, 'all row matched')

    const result2 = await index.query({ range: [61, 64] })
    assert(result2, 'did return result')
    assert(result2.rows)
    assert.equal(result2.rows.length, 1, '1 row matched')
    assert(result2.rows[0].key === 63, 'correct key')
  })
  it.skip('update index with document deletion', async () => {})
})
