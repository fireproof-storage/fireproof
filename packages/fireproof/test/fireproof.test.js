import { describe, it, beforeEach } from 'mocha'
import assert from 'node:assert'
import Blockstore from '../src/blockstore.js'
import Fireproof from '../src/fireproof.js'

let database, resp0

// const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
  it('mvcc put and get document with _clock that matches', async () => {
    assert(resp0.clock, 'should have clock')
    assert.equal(resp0.clock[0].toString(), 'bafyreieth2ckopwivda5mf6vu76xwqvox3q5wsaxgbmxy2dgrd4hfuzmma')
    const theDoc = await database.get('1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')
    theDoc._clock = database.clock
    const put2 = await database.put(theDoc)
    assert.equal(put2.id, '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')
    assert.equal(put2.clock[0].toString(), 'bafyreida2c2ckhjfoz5ulmbbfe66ey4svvedrl4tzbvtoxags2qck7lj2i')
  })
  it('get should return an object instance that is not the same as the one in the db', async () => {
    const theDoc = await database.get('1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')
    const theDoc2 = await database.get('1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')
    assert.notEqual(theDoc, theDoc2)
    theDoc.name = 'really alice'
    assert.equal(theDoc.name, 'really alice')
    assert.equal(theDoc2.name, 'alice')
  })
  it('get with mvcc option', async () => {
    const theDoc = await database.get('1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c', { mvcc: true })
    assert(theDoc._clock, 'should have _clock')
    assert.equal(theDoc._clock[0].toString(), 'bafyreieth2ckopwivda5mf6vu76xwqvox3q5wsaxgbmxy2dgrd4hfuzmma')
  })
  it('get with mvcc option where someone else changed another document first', async () => {
    const put2 = await database.put({ something: 'else' })
    assert(put2.clock, 'should have id')
    assert.notEqual(put2.clock.toString(), resp0.clock.toString())
    const theDoc = await database.get('1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c', { mvcc: true })
    assert(theDoc._clock, 'should have _clock')
    assert.equal(theDoc._clock.toString(), resp0.clock.toString())
  })
  it('get from an old snapshot with mvcc option', async () => {
    const ogClock = resp0.clock
    const theDoc = await database.get('1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')
    theDoc.name = 'not alice'
    const put2 = await database.put(theDoc)
    assert.equal(put2.id, '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')
    assert.notEqual(put2.clock.toString(), ogClock.toString())
    const theDoc2 = await database.get('1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c', { clock: ogClock })
    assert.equal(theDoc2.name, 'alice')
  })
  it('put and get document with _clock that does not match b/c the doc changed', async () => {
    const theDoc = await database.get('1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c', { mvcc: true })
    theDoc.name = 'not alice'
    const put2 = await database.put(theDoc)
    assert.equal(put2.id, '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')
    assert.notEqual(put2.clock.toString(), theDoc._clock.toString())

    const err = await database.put(theDoc).catch((err) => err)
    assert.match(err.message, /MVCC conflict/)
  })
  it('put and get document with _clock that does not match b/c a different doc changed should succeed', async () => {
    const theDoc = await database.get('1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c', { mvcc: true })
    assert.equal(theDoc.name, 'alice')

    const putAnotherDoc = await database.put({ nothing: 'to see here' })
    assert.notEqual(putAnotherDoc.clock.toString(), theDoc._clock.toString())

    const ok = await database.put({ name: "isn't alice", ...theDoc })
    assert.equal(ok.id, '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')
  })
  it('put and get document with _clock that does not match b/c the doc was deleted', async () => {
    const theDoc = await database.get('1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c', { mvcc: true })
    assert.equal(theDoc.name, 'alice')
    const del = await database.del(theDoc)
    assert(del.id)
    const err = await database.put(theDoc).catch((err) => err)
    console.log('err', err)
    assert.match(err.message, /MVCC conflict/)
  })

  it('has a factory for making new instances with default settings', async () => {
    // TODO if you pass it an email it asks the local keyring, and if no key, does the email validation thing
    const db = await Fireproof.storage({ email: 'jchris@gmail.com' })
    assert(db instanceof Fireproof)
  })
  it('an empty database has no documents', async () => {
    const db = Fireproof.storage()
    assert(db instanceof Fireproof)
    const e = await db.get('8c5c0c5c0c5c').catch((err) => err)
    assert.equal(e.message, 'Not found')
    const changes = await db.changesSince()
    assert.equal(changes.rows.length, 0)
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

    let e = await validationDatabase
      .put({
        _id: '222-bob',
        name: 'bob',
        age: 11
      })
      .catch((e) => e)
    assert.equal(e.message, 'no bobs allowed')

    e = await validationDatabase.get('222-bob').catch((e) => e)
    assert.equal(e.message, 'Not found')
  })

  it('get missing document', async () => {
    const e = await database.get('missing').catch((e) => e)
    assert.equal(e.message, 'Not found')
  })
  it('delete a document', async () => {
    const id = '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c'
    const found = await database.get(id)
    assert.equal(found._id, id)
    const deleted = await database.del(id)
    assert.equal(deleted.id, id)
    const e = await database
      .get(id)
      .then((doc) => assert.equal('should be deleted', JSON.stringify(doc)))
      .catch((e) => {
        if (e.message !== 'Not found') {
          throw e
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

    const e = await validationDatabase
      .put({
        _id: '222-bob',
        name: 'bob',
        age: 12
      })
      .catch((e) => e)
    assert.equal(e.message, 'no changing bob')

    let prevBob = await validationDatabase.get('222-bob')
    assert.equal(prevBob.name, 'bob')
    assert.equal(prevBob.age, 11)

    const e2 = await validationDatabase.del('222-bob').catch((e) => e)
    assert.equal(e2.message, 'no changing bob')

    prevBob = await validationDatabase.get('222-bob')
    assert.equal(prevBob.name, 'bob')
    assert.equal(prevBob.age, 11)
  })

  it('provides docs since', async () => {
    const result = await database.changesSince()
    assert.equal(result.rows.length, 1)
    assert.equal(result.rows[0].key, '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')

    const result2 = await database.changesSince(result.clock)
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

    const res3 = await database.changesSince(result2.clock)
    assert.equal(res3.rows.length, 1)

    const res4 = await database.changesSince(res3.clock)
    assert.equal(res4.rows.length, 0)
    assert.equal(res4.clock[0], res3.clock[0])
    assert.equal(res4.clock.length, res3.clock.length)

    const cKey = 'cefecef-3c3a-4b5e-9c1c-bbbbbb'
    const value = {
      _id: cKey,
      name: 'carol',
      age: 44
    }
    const response2 = await database.put(value)
    assert(response2.id, 'should have id')
    assert.equal(response2.id, cKey)

    const res5 = await database.changesSince(res4.clock)

    // await database.visClock()

    assert.equal(res5.rows.length, 1)

    const res6 = await database.changesSince(result2.clock)
    assert.equal(res6.rows.length, 2)

    const resultAll = await database.changesSince()
    assert.equal(resultAll.rows.length, 3)
    assert.equal(resultAll.rows[0].key, '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')

    const res7 = await database.changesSince(resultAll.clock)
    assert.equal(res7.rows.length, 0)

    const valueCupdate = {
      _id: cKey,
      name: 'carol update',
      age: 45
    }
    const responseUpdate = await database.put(valueCupdate)
    assert(responseUpdate.id)

    const res8 = await database.changesSince(resultAll.clock)
    assert.equal(res8.rows.length, 1)

    const res9 = await database.changesSince(res8.clock)
    assert.equal(res9.rows.length, 0)
  })

  it.skip('docs since repeated changes', async () => {
    assert.equal((await database.changesSince()).rows.length, 1)
    let resp, doc, changes
    for (let index = 0; index < 200; index++) {
      const id = '' + (300 - index).toString()
      resp = await database.put({ index, _id: id }).catch(e => {
        assert.equal(e.message, 'put failed on  _id: ' + id)
      })
      assert(resp.id)
      doc = await database.get(resp.id).catch(e => {
        console.trace('failed', e)
        assert.equal(e.message, 'get failed on _id: ' + id)
      })
      assert.equal(doc.index, index)
      changes = await database.changesSince().catch(e => {
        assert.equal(e.message, 'changesSince failed on  _id: ' + id)
      })
      assert.equal(changes.rows.length, index + 2)
    }
  }).timeout(20000)
  it('concurrent transactions', async () => {
    assert.equal((await database.changesSince()).rows.length, 1)
    const promises = []
    let putYes = 0
    for (let index = 0; index < 20; index++) {
      const id = 'a' + (300 - index).toString()
      promises.push(database.put({ index, _id: id }).catch(e => {
        assert.equal(e.message, 'put failed on  _id: ' + id)
      }).then(r => {
        if (r.id) {
          putYes++
          return database.get(r.id).catch(e => {
            // assert.equal(e.message, 'get failed on _id: ' + r.id)
          }).then(d => {
            // assert.equal(d.index, index)
            return r.id
          })
        }
      }))
      promises.push(database.changesSince().catch(e => {
        assert.equal(e.message, 'changesSince failed')
      }).then(c => {
        assert(c.rows.length > 0)
        return c.rows.length
      }))
    }
    const got = await Promise.all(promises)
    assert.equal(got.length, putYes * 2)
    // console.log('putYes', putYes)
    // await sleep(1000)
    assert.equal((await database.changesSince()).rows.length, 2)
  }).timeout(20000)
})
