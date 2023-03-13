import { describe, it, beforeEach } from 'mocha'
import assert from 'node:assert'
import Fireproof from '../src/fireproof.js'

let database, ok, doc

describe('Proofs', () => {
  beforeEach(async () => {
    database = Fireproof.storage()
    ok = await database.put({
      _id: 'test1',
      score: 75
    })
    doc = await database.get('test1', { proof: true })
  })

  it('put result shoud include proof', async () => {
    assert(ok.proof)
    assert.equal(ok.proof.indexOf(database.clock[0]), 4)
  })
  it('get result shoud include proof', async () => {
    assert(doc._proof)
    assert.equal(doc._proof.indexOf(database.clock[0]), 4)
  })
})
