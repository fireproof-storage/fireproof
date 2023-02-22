import { describe, it } from 'mocha'
import assert from 'node:assert'
import { Blockstore } from './helpers.js'
import Fireproof from '../fireproof.js'

describe('Fireproof', () => {
  it('put and get document', async () => {
    const people = new Fireproof(new Blockstore(), []) // todo: these need a cloud name aka w3name, add this after we have cloud storage of blocks
    const aKey = '1ef3b32a-3c3a-4b5e-9c1c-8c5c0c5c0c5c'
    const value = {
      _id: aKey,
      name: 'alice',
      age: 42
    }
    const response = await people.put(value)
    assert(response)
    assert(response.id, 'should have id')
    assert.equal(response.id, aKey)

    const avalue = await people.get(aKey)
    assert(avalue)
    assert.equal(avalue.name, value.name)
    assert.equal(avalue.age, value.age)
    assert.equal(avalue._id, value.aKey)
  })
})
