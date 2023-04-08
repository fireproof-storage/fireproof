import { describe, it, beforeEach } from 'mocha'
import assert from 'node:assert'
import Fireproof from '../src/fireproof.js'
import DbIndex from '../src/db-index.js'
import Hydrator from '../src/hydrator.js'

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
    }, null, { name: 'names_by_age' })
  })
  it('serialize database with index', async () => {
    await database.put({ _id: 'rehy', name: 'drate', age: 1 })
    assert.equal((await database.changesSince()).rows.length, 7)
    const result = await index.query({ range: [0, 54] })
    assert.equal(result.rows[0].value, 'drate')
    const serialized = database.toJSON()
    // console.log('serialized', serialized)
    assert.equal(serialized.name, 'global')
    if (database.blocks.valet.keyId !== 'null') {
      assert.equal(serialized.key.length, 64)
    }
    assert.equal(serialized.clock.length, 1)
    assert.equal(serialized.clock[0].constructor.name, 'String')
    assert.equal(serialized.indexes.length, 1)
    assert.equal(serialized.indexes[0].code, `function (doc, map) {
      map(doc.age, doc.name)
    }`)
    assert.equal(serialized.indexes[0].name, 'names_by_age')

    assert.equal(serialized.indexes[0].clock.byId.constructor.name, 'String')
    assert.equal(serialized.indexes[0].clock.byKey.constructor.name, 'String')
    assert.equal(serialized.indexes[0].clock.db[0].constructor.name, 'String')
  })
  it('rehydrate database', async () => {
    await database.put({ _id: 'rehy', name: 'drate', age: 1 })
    assert.equal((await database.changesSince()).rows.length, 7)
    const result = await index.query({ range: [0, 54] })
    assert.equal(result.rows[0].value, 'drate')

    const serialized = JSON.parse(JSON.stringify(database))
    // console.log('serialized', JSON.stringify(serialized))
    // connect it to the same blockstore for testing
    const newDb = Hydrator.fromJSON(serialized, database)
    assert.equal(newDb.name, 'global')
    assert.equal(newDb.clock.length, 1)
    assert.equal((await newDb.changesSince()).rows.length, 7)
    const newIndex = [...newDb.indexes.values()][0]
    assert.equal(newIndex.mapFn, `function (doc, map) {
      map(doc.age, doc.name)
    }`)
    assert.equal(newIndex.indexById.cid, 'bafyreifuz54ugnq77fur47vwv3dwab7p3gpnf5to6hlnbhv5p4kwo7auoi')
    // assert.equal(newIndex.indexById.root, null)

    assert.equal(newIndex.indexByKey.cid, 'bafyreicr5rpvsxnqchcwk5rxlmdvd3fah2vexmbsp2dvr4cfdxd2q2ycgu')
    // assert.equal(newIndex.indexByKey.root, null)

    assert.equal(newIndex.name, 'names_by_age')

    const newResult = await newIndex.query({ range: [0, 54] })
    assert.equal(newResult.rows[0].value, 'drate')
  })
})
