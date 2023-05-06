import { describe, it, beforeEach } from 'mocha'
import assert from 'node:assert'
import { Fireproof } from '../src/fireproof.js'

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

  it('first put result should include empty proof', async () => {
    assert(ok.proof)
    assert(ok.proof.data)
    assert(ok.proof.clock)
    // console.log('ok', ok)
    assert.equal(ok.proof.data.length, 0)
    assert.equal(ok.proof.clock.length, 0)

    // assert.equal(ok.proof.data[0], 'bafyreibsbxxd4ueujryihk6xza2ekwhzsh6pzuu5fysft5ilz7cbw6bjju')
    // assert.equal(ok.proof.clock[0].toString(), 'bafyreiactx5vku7zueq27i5zdrgcjnczxvepceo5yszjqb2exufwrwxg44')
  })

  it.skip('second put result shoud include proof', async () => {
    const ok2 = await database.put({ ...doc, winner: true })
    assert(ok2.proof)
    assert(ok2.proof.data)
    assert(ok2.proof.clock)
    // console.log('ok2', ok2)
    assert.equal(ok2.proof.data.length, 1)
    assert.equal(ok2.proof.clock.length, 1)

    // assert.equal(ok.proof.data[0], 'bafyreibsbxxd4ueujryihk6xza2ekwhzsh6pzuu5fysft5ilz7cbw6bjju')
    // assert.equal(ok.proof.clock[0].toString(), 'bafyreiactx5vku7zueq27i5zdrgcjnczxvepceo5yszjqb2exufwrwxg44')
  })

  it('get result shoud include proof', async () => {
    assert(doc._clock)
    assert(doc._proof)

    assert(doc._proof.data)
    assert(doc._proof.clock)
    assert.equal(doc._proof.data.length, 1)
    assert.equal(doc._proof.clock.length, 1)
    assert.equal(doc._proof.data[0], 'bafyreieilmvxq6wudu46i2ssmuyrmaszr4onzlqxzlvngrczbn7ppyvloq')
    assert.equal(doc._proof.clock[0].toString(), 'bafyreicj6o5qtersjpqjrgk7thtxnwqwimfnz4cgkw2eme3dcmxkekzvam')
  })
})
