import { describe, it, beforeEach } from 'mocha'
import assert from 'node:assert'
import { Blockstore } from './helpers.js'
import Fireproof from '../fireproof.js'

let database, resp0

describe('Fireproof', () => {
  beforeEach(async () => {
    database = new Fireproof(new Blockstore(), []) // todo: these need a cloud name aka w3name, add this after we have cloud storage of blocks
    resp0 = await database.put({
      _id: '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c',
      name: 'alice',
      age: 42
    })
  })

  it('put and get document', async () => {
    assert(resp0.id, 'should have id')
    assert.equal(resp0.id, '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')

    const avalue = await database.get('1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')
    assert.equal(avalue.name, 'alice')
    assert.equal(avalue.age, 42)
    assert.equal(avalue._id, '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')
  })
  it('update existing document', async () => {
    const dogKey = 'aster-3c3a-4b5e-9c1c-8c5c0c5c0c5c'
    const value = {
      _id: dogKey,
      name: 'aster',
      age: 2
    }
    const response = await database.put(value)
    assert(response.id, 'should have id')
    assert.equal(response.id, dogKey)
    assert.equal(value._id, dogKey)

    const avalue = await database.get(dogKey)
    assert.equal(avalue.name, value.name)
    assert.equal(avalue.age, value.age)
    assert.equal(avalue._id, dogKey)

    avalue.age = 3
    // console.log('update value', avalue)
    const response2 = await database.put(avalue)
    assert(response2.id, 'should have id')
    assert.equal(response2.id, dogKey)

    const bvalue = await database.get(dogKey)
    assert.equal(bvalue.name, value.name)
    assert.equal(bvalue.age, 3)
    assert.equal(bvalue._id, dogKey)
  })
  it('provides docs since', async () => {
    console.log('provides docs since')
    const result = await database.docsSince()
    assert.equal(result.rows.length, 1)
    assert.equal(result.rows[0]._id, '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')

    const result2 = await database.docsSince(result.head)
    assert.equal(result2.rows.length, 0)

    const bKey = 'befbef-3c3a-4b5e-9c1c-bbbbbb'
    const bvalue = {
      _id: bKey,
      name: 'bob',
      age: 44
    }
    const response = await database.put(bvalue)
    assert(response.id, 'should have id')
    assert.equal(response.id, bKey)

    const res3 = await database.docsSince(result2.head)
    assert.equal(res3.rows.length, 1)

    const res4 = await database.docsSince(res3.head)
    assert.equal(res4.rows.length, 0)
    assert.equal(res4.head[0], res3.head[0])
    assert.equal(res4.head.length, res3.head.length)

    console.log('add carol')

    const cKey = 'cefecef-3c3a-4b5e-9c1c-bbbbbb'
    const value = {
      _id: cKey,
      name: 'carol',
      age: 44
    }
    const response2 = await database.put(value)
    assert(response2.id, 'should have id')
    assert.equal(response2.id, cKey)

    const res5 = await database.docsSince(res4.head)
    console.log('res5', res5.rows)

    await database.visClock()

    assert.equal(res5.rows.length, 1)

    const res6 = await database.docsSince(result2.head)
    assert.equal(res6.rows.length, 2)

    const resultAll = await database.docsSince()
    assert.equal(resultAll.rows.length, 3)
    assert.equal(resultAll.rows[0]._id, '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')

    const res7 = await database.docsSince(resultAll.head)
    assert.equal(res7.rows.length, 0)

    console.log('update carol')

    const valueCupdate = {
      _id: cKey,
      name: 'carol update',
      age: 45
    }
    const responseUpdate = await database.put(valueCupdate)
    assert(responseUpdate.id)

    const res8 = await database.docsSince(resultAll.head)
    console.log('res8', res8)
    assert.equal(res8.rows.length, 1)

    const res9 = await database.docsSince(res8.head)
    console.log('res9', res9)
    assert.equal(res9.rows.length, 0)
  })
})
