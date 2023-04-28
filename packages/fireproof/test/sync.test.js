import { describe, it, beforeEach } from 'mocha'
import assert from 'node:assert'
import { Fireproof, Sync } from '../src/fireproof.js'

describe('Sync', () => {
  let database
  beforeEach(async () => {
    database = Fireproof.storage()
    setupDb(database)
  })
  it('can save as an encrypted car', async () => {
    const car = await Sync.makeCar(database)
    assert(car.cid)
    // todo asserts abount read
    // console.log(car)
  })
  it('can save as a clear car', async () => {
    const car = await Sync.makeCar(database, null)
    assert(car.cid)
    // todo asserts abount read
    // console.log(car)
  })
  it('can sync to an empty database', async () => {
    const database2 = Fireproof.storage()
    const sync = new Sync(database, MockPeer)
    const sync2 = new Sync(database2, MockPeer)

    // console.log('sync', sync)

    const offer = await sync.offer()
    const accept = await sync2.accept(offer)

    // test stuff
    sync.peer.that = sync2.peer
    sync2.peer.that = sync.peer

    sync.connect(accept)

    const result = await sync.backlog()
    assert(result)
    assert.equal(result.ok, true)

    const resultB = await sync2.backlog()
    assert(resultB)
    assert.equal(resultB.ok, true)

    const result2 = await database2.get('a1s35c')
    assert.equal(result2.name, 'alice')
    const result3 = await database2.get('b2s35c')
    assert.equal(result3.name, 'bob')
    const result4 = await database2.get('f4s35c')
    assert.equal(result4.name, 'frank')
  })
  it("two identical databases don't send cars", async () => {

  })
})

class MockPeer {
  constructor (opts) {
    this.opts = opts
    this.initiator = opts.initiator
    this.messages = []
    this.handlers = new Map()
    this.that = null
    setTimeout(() => {
      // this.do('connect')
      this.do('signal', { signal: true })
    }, 0)
  }

  send (message) {
    // console.log('sending')
    this.that.do('data', message)
  }

  signal (message) {
    // console.log('signal', message)
    this.do('connect')
  }

  on (event, callback) {
    this.handlers.set(event, callback)
  }

  do (event, message) {
    setTimeout(() => {
      // console.log('do', event)
      this.handlers.get(event)(message)
    }, 10)
  }
}

const setupDb = async (database) => {
  const docs = [
    { _id: 'a1s35c', name: 'alice', age: 40 },
    { _id: 'b2s35c', name: 'bob', age: 40 },
    { _id: 'f4s35c', name: 'frank', age: 7 }
  ]
  for (const doc of docs) {
    const id = doc._id
    const response = await database.put(doc)
    assert(response)
    assert(response.id, 'should have id')
    assert.equal(response.id, id)
  }
}
