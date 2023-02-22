import { describe, it } from 'mocha'
import assert from 'node:assert'
import { Blockstore } from './helpers.js'
import Fireproof from '../fireproof.js'
// import Index from '../index.js'
class Index {}

describe('Index query', () => {
  it('define index', async () => {
    const people = new Fireproof(new Blockstore(), []) // todo: these need a cloud name aka w3name, add this after we have cloud storage of blocks
    const docs = [
      { _id: 'b3s3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c', name: 'bob', age: 40 },
      { _id: 'c4s3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c', name: 'carol', age: 43 },
      { _id: 'd5s3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c', name: 'dave', age: 48 }
    ]
    for (const doc of docs) {
      console.log(doc)
      const id = doc._id
      const response = await people.put(doc)
      assert(response)
      assert(response.id, 'should have id')
      assert.equal(response.id, id)
    }
    const index = new Index(people, function (doc, map) {
      map(doc.age, doc.name)
    })
    const result = await index.query(43)
    console.log(result)
  })
})
