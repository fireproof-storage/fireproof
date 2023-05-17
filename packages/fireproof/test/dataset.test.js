import { describe, it, beforeEach } from 'mocha'
import assert from 'node:assert'
import { Fireproof } from '../src/fireproof.js'

describe('Create a dataset', () => {
  let database = Fireproof.storage()
  beforeEach(async () => {
    database = Fireproof.storage('name')

    const numDocs = 100
    for (let i = 0; i < numDocs; i++) {
      const doc = { _id: `doc${i}`, name: `name${i}`, age: i }
      const response = await database.put(doc)
      assert(response)
      assert(response.id, 'should have id')
      assert.equal(response.id, doc._id)
    }
  })
  it.skip('gets all docs', async () => {
    const response = await database.allDocuments()
    assert.equal(response.rows.length, 100)
  }).timeout(10000)
})
