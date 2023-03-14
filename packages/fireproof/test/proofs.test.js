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
    doc = await database.get(ok.id, { mvcc: true })
  })

  // it('put result shoud include proof', async () => {
  //   assert(ok.proof)
  //   assert.equal(ok.proof.indexOf(database.clock[0]), 4)
  // })
  it('get result shoud include proof', async () => {
    assert(doc._clock)
    assert(doc._proof)

    assert(doc._proof.data)
    assert(doc._proof.clock)
    assert.equal(doc._proof.data.length, 1)
    assert.equal(doc._proof.clock.length, 1)

    // should the proof split clock from data? yes
    // assert.equal(doc._proof[0], 'bafyreibsbxxd4ueujryihk6xza2ekwhzsh6pzuu5fysft5ilz7cbw6bjju')
    // assert.equal(doc._clock.toString(), 'bafyreibsbxxd4ueujryihk6xza2ekwhzsh6pzuu5fysft5ilz7cbw6bjju')
    // assert.equal(doc._proof.indexOf(database.clock[0]), 4)
  })
})
