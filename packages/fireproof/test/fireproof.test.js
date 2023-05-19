import { describe, it, beforeEach } from 'mocha'
import assert from 'node:assert'
import { Fireproof } from '../src/fireproof.js'
import { Loader } from '../src/loader.js'
import { join } from 'path'
import { rmSync, readdirSync } from 'node:fs'
// import * as codec from '@ipld/dag-cbor'

let database = Fireproof.storage()

let resp0

// const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

describe('Fireproof', () => {
  beforeEach(async () => {
    const loader = new Loader('helloName')

    const files = readdirSync(loader.config.dataDir)

    for (const file of files) {
      if (file.match(/fptest/)) {
        // console.log('removing', file)
        rmSync(join(loader.config.dataDir, file), { recursive: true, force: true })
      }
    }

    database = Fireproof.storage('fptest-hello-name')
    assert.equal(database.clock.length, 0)
    resp0 = await database.put({
      _id: '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c',
      name: 'alice',
      age: 42
    })
  })
  it('takes an optional name', () => {
    assert.equal(database.name, 'fptest-hello-name')
    const km = database.blocks.valet.getKeyMaterial()
    if (process.env.NO_ENCRYPT) { assert.equal(km, null) } else { assert.equal(km.length, 64) }
    // uncomment to test in browser
    // const x = database.blocks.valet.idb
    // const keyId = database.blocks.valet.keyId
    // assert.equal(x.name.toString(), `fp.${keyId}.helloName.valet`)
  })
  it('only put and get document', async () => {
    assert(resp0.id, 'should have id')
    assert.equal(resp0.id, '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')
    const avalue = await database.get('1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')
    assert.equal(avalue.name, 'alice')
    assert.equal(avalue.age, 42)
    assert.equal(avalue._id, '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')
  })
  it('only put document with null key', async () => {
    assert(resp0.id, 'should have id')
    assert.equal(resp0.id, '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')
    const put2 = await database.put({ _id: null, field: 'foo' })
    assert.notEqual(put2.id, null)
  })
  it('mvcc put and get document with _clock that matches', async () => {
    assert(resp0.clock, 'should have clock')
    assert.equal(resp0.clock.length, 1)
    assert.equal(resp0.clock[0].toString(), 'bafyreiad55hjvlzse7dxt5qwf6xsv4zucuyoracvpcqifpi6pmdaavdkoa')
    const theDoc = await database.get('1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')
    theDoc._clock = database.clock
    assert.equal(database.clock.length, 1)
    const put2 = await database.put(theDoc)
    assert.equal(put2.id, '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')
    assert.equal(put2.clock.length, 1)
    assert.equal(put2.clock[0].toString(), 'bafyreifupxoz3rrdonecu7zekknjc6itt5w3osxwp3cb6ptigypbsvyf2i')
  })
  it('get should return an object instance that is not the same as the one in the db', async () => {
    const theDoc = await database.get('1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')
    const theDoc2 = await database.get('1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')
    assert.equal(JSON.stringify(theDoc), JSON.stringify(theDoc2))
    assert.notEqual(theDoc, theDoc2)
    theDoc.name = 'really alice'
    assert.equal(theDoc.name, 'really alice')
    assert.equal(theDoc2.name, 'alice')
  })
  it('get with mvcc option', async () => {
    const theDoc = await database.get('1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c', { mvcc: true })
    assert(theDoc._clock, 'should have _clock')
    assert.equal(theDoc._clock[0].toString(), 'bafyreiad55hjvlzse7dxt5qwf6xsv4zucuyoracvpcqifpi6pmdaavdkoa')
  })
  it('get with mvcc option where someone else changed another document first', async () => {
    const theDoc = await database.get('1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c', { mvcc: true })
    const put2 = await database.put({ something: 'else' })
    assert(put2.clock, 'should have clock')
    assert.notEqual(put2.clock.toString(), resp0.clock.toString())
    assert.equal(theDoc._clock.toString(), resp0.clock.toString())
    theDoc.name = 'somone else'
    const put3works = await database.put(theDoc)
    assert(put3works.clock, 'should have id')
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
  it('allDocuments', async () => {
    await database.put({ name: 'bob' })
    const allDocs = await database.allDocuments()
    assert.equal(allDocs.rows.length, 2)
  })
  it('allCids', async () => {
    const allCids = await database.allCIDs()
    assert.equal(allCids.length, 2)
    const storedCids = await database.allStoredCIDs()
    assert.equal(storedCids.length, 2)
  })

  it('has a factory for making new instances with default settings', async () => {
    // TODO if you pass it an email it asks the local keyring, and if no key, does the email validation thing
    const db = await Fireproof.storage('fptest')
    assert.equal(db.name, 'fptest')
  })
  it('an empty database has no documents', async () => {
    const db = Fireproof.storage()
    const e = await db.get('8c5c0c5c0c5c').catch((err) => err)
    assert.equal(e.message, 'Not found')
    const changes = await db.changesSince()
    assert.equal(changes.rows.length, 0)
  })
  it('delete on an empty database', async () => {
    const db = Fireproof.storage()
    const e = await db.del('8c5c0c5c0c5c').catch((err) => err)
    assert.equal(e.id, '8c5c0c5c0c5c')
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
    const snapshot = Fireproof.snapshot(database)

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

    const snapdoc = await snapshot.get(dogKey)
    // console.log('snapdoc', snapdoc)
    // assert(snapdoc.id, 'should have id')
    assert.equal(snapdoc._id, dogKey)
    assert.equal(snapdoc.age, 2)
  })
  it("update document with validation function that doesn't allow it", async () => {
    const validationDatabase = Fireproof.storage('fptest-validation', {
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
  it('delete the only document', async () => {
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

  it('delete not last document', async () => {
    const resp1 = await database.put({
      _id: 'second',
      name: 'bob',
      age: 39
    })

    // const id = '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c'
    const id = resp1.id
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
    const validationDatabase = Fireproof.storage('fptest-validation', {
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

  it('provides docs since tiny', async () => {
    const result = await database.changesSince()
    assert.equal(result.rows.length, 1)
    assert.equal(result.rows[0].key, '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c')

    // console.log('result', result)

    // const result2 = await database.changesSince(result.clock)
    // console.log('result2', result2)
    // assert.equal(result2.rows.length, 0)

    const bKey = 'befbef-3c3a-4b5e-9c1c-bbbbbb'
    const bvalue = {
      _id: bKey,
      name: 'bob',
      age: 44
    }
    const response = await database.put(bvalue)
    assert(response.id, 'should have id')
    assert.equal(response.id, bKey)

    const res3 = await database.changesSince()
    assert.equal(res3.rows.length, 2)

    const res4 = await database.changesSince(result.clock)
    assert.equal(res4.rows.length, 1)
  })

  it('provides docs since long', async () => {
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

  it('docs since repeated changes', async () => {
    assert.equal((await database.changesSince()).rows.length, 1)
    let resp, doc, changes
    for (let index = 0; index < 30; index++) {
      const id = '1' + (301 - index).toString()
      // console.log(`Putting id: ${id}, index: ${index}`)
      resp = await database.put({ index, _id: id }).catch(e => {
        assert.fail(`put failed on _id: ${id}, error: ${e.message}`)
      })
      assert(resp.id, `Failed to obtain resp.id for _id: ${id}`)

      // console.log(`vis for update id: ${id}, index:`, index)
      // for await (const line of database.vis()) {
      //   console.log(line)
      // }

      doc = await database.get(resp.id).catch(e => {
        console.log('failed', e)
        assert.fail(`get failed on _id: ${id}, error: ${e.message}`)
      })

      assert.equal(doc.index, index, `doc.index is not equal to index for _id: ${id}`)
      changes = await database.changesSince().catch(async e => {
        assert.fail(`changesSince failed on _id: ${id}, error: ${e.message}`)
      })
      changes.rows.forEach(row => {
        for (const key in row) {
          const value = row[key]
          assert(!/^bafy/.test(value), `Unexpected "bafy..." value found at index ${index} in row ${JSON.stringify(row)}`)
        }
      })

      database.blocks.clearCommittedCache() // clear cache to force re-reading from encrypted store

      doc = await database.get(resp.id).catch(e => {
        console.log('failed', e)
        assert.fail(`get failed on _id: ${id}, error: ${e.message}`)
      })

      assert.equal(doc.index, index, `doc.index is not equal to index for _id: ${id}`)
      changes = await database.changesSince().catch(async e => {
        assert.fail(`changesSince failed on _id: ${id}, error: ${e.message}`)
      })
      changes.rows.forEach(row => {
        for (const key in row) {
          const value = row[key]
          assert(!/^bafy/.test(value), `Unexpected "bafy..." value found at index ${index} in row ${JSON.stringify(row)}`)
        }
      })

      // console.log('changes: ', index, changes.rows.length, JSON.stringify(changes.rows))
      assert.equal(changes.rows.length, index + 2, `failed on ${index}, with ${changes.rows.length} ${id}`)
    }
  }).timeout(30000)

  it('concurrent transactions', async () => {
    assert.equal((await database.changesSince()).rows.length, 1)
    const promises = []
    let putYes = 0
    for (let index = 0; index < 20; index++) {
      const id = 'a' + (300 - index).toString()
      promises.push(database.put({ index, _id: id }).catch(e => {
        assert.equal(e.message, 'put failed on  _id: ' + id)
      }).then(r => {
        putYes++
        return database.get(r.id).catch(e => {
          // assert.equal(e.message, 'get failed on _id: ' + r.id)
        }).then(d => {
          // assert.equal(d.index, index)
          return r.id
        })
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
    // console.log('all', await database.allDocuments())
    assert.equal((await database.changesSince()).rows.length, 21)
    assert.equal((await database.allDocuments()).rows.length, 21)
  }).timeout(20000)
  it('serialize database', async () => {
    await database.put({ _id: 'rehy', name: 'drate' })
    assert.equal((await database.changesSince()).rows.length, 2)
    const serialized = JSON.parse(JSON.stringify(database))
    assert.equal(serialized.name, 'fptest-hello-name')
    assert.equal(serialized.clock.length, 1)
  })
  it('clocked changes in order', async () => {
    await database.put({ _id: '2' })
    await database.put({ _id: 'three' })
    await database.put({ _id: '4' })
    const changes = await database.changesSince(resp0.clock)
    assert.equal(changes.rows.length, 3)
    assert.equal(changes.rows[0].key, '2')
    assert.equal(changes.rows[1].key, 'three')
    assert.equal(changes.rows[2].key, '4')
  })
  const PERF_REPS = 50
  it('perf many changes in order', async () => {
    for (const i of Array(PERF_REPS).keys()) {
      await database.put({ _id: i.toString() })
    }
    for (const i of Array(PERF_REPS).keys()) {
      const doc = await database.get(i.toString())
      assert.equal(doc._id, i.toString())
    }
  }).timeout(10000)

  it('perf many changes in parallel', async () => {
    const ops = []
    for (const i of Array(PERF_REPS).keys()) {
      // console.log('putting', i)
      ops.push(database.put({ _id: i.toString() }))
    }
    await Promise.all(ops)
    for (const i of Array(PERF_REPS).keys()) {
      const doc = await database.get(i.toString())
      assert.equal(doc._id, i.toString())
    }
  }).timeout(10000)

  it.skip('changes in order', async () => {
    await database.put({ _id: '2' })
    await database.put({ _id: 'three' })
    await database.put({ _id: '4' })
    const changes = await database.changesSince()
    assert.equal(changes.rows.length, 4)
    assert.equal(changes.rows[0].key, resp0.id)
    assert.equal(changes.rows[1].key, '2')
    assert.equal(changes.rows[2].key, 'three')
    assert.equal(changes.rows[3].key, '4')
  })
})
