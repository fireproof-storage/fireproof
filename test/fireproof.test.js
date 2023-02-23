import { describe, it, before } from 'mocha'
import assert from 'node:assert'
import { Blockstore } from './helpers.js'
import Fireproof from '../fireproof.js'

let database

describe('Fireproof', () => {
  before(async () => {
    database = new Fireproof(new Blockstore(), []) // todo: these need a cloud name aka w3name, add this after we have cloud storage of blocks
  })

  it('put and get document', async () => {
    const aKey = '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c'
    const value = {
      _id: aKey,
      name: 'alice',
      age: 42
    }
    const response = await database.put(value)
    assert(response)
    assert(response.id, 'should have id')
    assert.equal(response.id, aKey)

    const avalue = await database.get(aKey)
    assert(avalue)
    assert.equal(avalue.name, value.name)
    assert.equal(avalue.age, value.age)
    assert.equal(avalue._id, aKey)
  })
  it('provides docs since', async () => {
    const result = await database.docsSince()
    assert(result)
    assert(result.rows)
    assert.equal(result.rows.length, 1)
    assert.equal(result.rows[0]._id, '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')

    const result2 = await database.docsSince(result.head)
    assert(result2)
    assert(result2.rows)
    assert.equal(result2.rows.length, 0)

    const bKey = 'befbef-3c3a-4b5e-9c1c-bbbbbb'
    const bvalue = {
      _id: bKey,
      name: 'bob',
      age: 44
    }
    const response = await database.put(bvalue)
    assert(response)
    assert(response.id, 'should have id')
    assert.equal(response.id, bKey)

    const res3 = await database.docsSince(result2.head)
    assert(res3)
    assert(res3.rows)
    assert.equal(res3.rows.length, 1)

    const res4 = await database.docsSince(res3.head)
    assert(res4)
    assert(res4.rows)
    assert.equal(res4.rows.length, 0)
    assert.equal(res4.head[0], res3.head[0])
    assert.equal(res4.head.length, res3.head.length)

    const cKey = 'cefecef-3c3a-4b5e-9c1c-bbbbbb'
    const value = {
      _id: cKey,
      name: 'carol',
      age: 44
    }
    const response2 = await database.put(value)
    assert(response2)
    assert(response2.id, 'should have id')
    assert.equal(response2.id, cKey)

    const res5 = await database.docsSince(res3.head) // res3
    assert(res5)
    assert(res5.rows)
    assert.equal(res5.rows.length, 1)

    const res6 = await database.docsSince(result2.head) // res3
    assert(res6)
    assert(res6.rows)
    assert.equal(res6.rows.length, 2)

    const resultAll = await database.docsSince()
    assert(resultAll)
    assert(resultAll.rows)
    assert.equal(resultAll.rows.length, 3)
    assert.equal(resultAll.rows[0]._id, '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')

    const res7 = await database.docsSince(resultAll.head) // res3
    assert(res7)
    assert(res7.rows)
    assert.equal(res7.rows.length, 0)
  })
})
