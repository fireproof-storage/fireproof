import { describe, it, beforeEach } from 'mocha'
import assert from 'node:assert'
import Blockstore from '../src/blockstore.js'
import Fireproof from '../src/fireproof.js'

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
  it('has a factory for making new instances with default settings', async () => {
    // TODO if you pass it an email it asks the local keyring, and if no key, does the email validation thing
    const db = await Fireproof.storage({ email: 'jchris@gmail.com' })
    assert(db instanceof Fireproof)
  })
  it('update existing document', async () => {
    // const alice = await database.get('1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')
    // assert.equal(alice.name, 'alice')

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
    const oldClock = database.clock

    const avalue = await database.get(dogKey)
    assert.equal(avalue.name, value.name)
    assert.equal(avalue.age, value.age)
    assert.equal(avalue._id, dogKey)

    avalue.age = 3
    const response2 = await database.put(avalue)
    assert(response2.id, 'should have id')
    assert.equal(response2.id, dogKey)

    const bvalue = await database.get(dogKey)
    assert.equal(bvalue.name, value.name)
    assert.equal(bvalue.age, 3)
    assert.equal(bvalue._id, dogKey)

    const snapshot = database.snapshot(oldClock)
    const snapdoc = await snapshot.get(dogKey)
    // console.log('snapdoc', snapdoc)
    // assert(snapdoc.id, 'should have id')
    assert.equal(snapdoc._id, dogKey)
    assert.equal(snapdoc.age, 2)
  })
  it("update document with validation function that doesn't allow it", async () => {
    const validationDatabase = new Fireproof(new Blockstore(), [], {
      validateChange: (newDoc, oldDoc, authCtx) => {
        if (newDoc.name === 'bob') {
          throw new Error('no bobs allowed')
        }
      }
    })
    const validResp = await validationDatabase.put({
      _id: '111-alice',
      name: 'alice',
      age: 42
    })
    const getResp = await validationDatabase.get(validResp.id)
    assert.equal(getResp.name, 'alice')

    let e = await validationDatabase.put({
      _id: '222-bob',
      name: 'bob',
      age: 11
    }).catch(e => e)
    assert.equal(e.message, 'no bobs allowed')

    e = await validationDatabase.get('222-bob').catch(e => e)
    assert.equal(e.message, 'Not found')
  })

  it('get missing document', async () => {
    const e = await database.get('missing').catch(e => e)
    assert.equal(e.message, 'Not found')
  })
  it('delete a document', async () => {
    const id = '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c'
    const found = await database.get(id)
    assert.equal(found._id, id)
    const deleted = await database.del(id)
    assert.equal(deleted.id, id)
    const e = await database.get(id).then((doc) => assert.equal('should be deleted', JSON.stringify(doc))).catch(e => {
      if (e.message !== 'Not found') {
        throw (e)
      }
      return e
    })
    assert.equal(e.message, 'Not found')
  })

  it("delete a document with validation function that doesn't allow it", async () => {
    const validationDatabase = new Fireproof(new Blockstore(), [], {
      validateChange: (newDoc, oldDoc, authCtx) => {
        if (oldDoc.name === 'bob') {
          throw new Error('no changing bob')
        }
      }
    })
    const validResp = await validationDatabase.put({
      _id: '222-bob',
      name: 'bob',
      age: 11
    })
    const getResp = await validationDatabase.get(validResp.id)
    assert.equal(getResp.name, 'bob')

    const e = await validationDatabase.put({
      _id: '222-bob',
      name: 'bob',
      age: 12
    }).catch(e => e)
    assert.equal(e.message, 'no changing bob')

    let prevBob = await validationDatabase.get('222-bob')
    assert.equal(prevBob.name, 'bob')
    assert.equal(prevBob.age, 11)

    const e2 = await validationDatabase.del('222-bob').catch(e => e)
    assert.equal(e2.message, 'no changing bob')

    prevBob = await validationDatabase.get('222-bob')
    assert.equal(prevBob.name, 'bob')
    assert.equal(prevBob.age, 11)
  })

  it('provides docs since', async () => {
    const result = await database.changesSince()
    assert.equal(result.rows.length, 1)
    assert.equal(result.rows[0].key, '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')

    const result2 = await database.changesSince(result.head)
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

    const res3 = await database.changesSince(result2.head)
    assert.equal(res3.rows.length, 1)

    const res4 = await database.changesSince(res3.head)
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
    assert(response2.id, 'should have id')
    assert.equal(response2.id, cKey)

    const res5 = await database.changesSince(res4.head)

    // await database.visClock()

    assert.equal(res5.rows.length, 1)

    const res6 = await database.changesSince(result2.head)
    assert.equal(res6.rows.length, 2)

    const resultAll = await database.changesSince()
    assert.equal(resultAll.rows.length, 3)
    assert.equal(resultAll.rows[0].key, '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')

    const res7 = await database.changesSince(resultAll.head)
    assert.equal(res7.rows.length, 0)

    const valueCupdate = {
      _id: cKey,
      name: 'carol update',
      age: 45
    }
    const responseUpdate = await database.put(valueCupdate)
    assert(responseUpdate.id)

    const res8 = await database.changesSince(resultAll.head)
    assert.equal(res8.rows.length, 1)

    const res9 = await database.changesSince(res8.head)
    assert.equal(res9.rows.length, 0)
  })
})
