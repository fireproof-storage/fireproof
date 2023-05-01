import { describe, it, beforeEach } from 'mocha'
import assert from 'node:assert'
import { Fireproof, Sync } from '../src/fireproof.js'

describe('Sync valet', () => {
  let database
  beforeEach(async () => {
    database = Fireproof.storage('test-sync-full')
    await setupDb(database)
  })
  it('can sync to an empty database', async () => {
    const database2 = Fireproof.storage('test-full-empty')
    await setupSync(database, database2)

    const result2 = await database2.get('a1s35c')
    assert.equal(result2.name, 'alice')
    const result3 = await database2.get('b2s35c')
    assert.equal(result3.name, 'bob')
    const result4 = await database2.get('f4s35c')
    assert.equal(result4.name, 'frank')
  })
})

describe('Sync', () => {
  let database
  beforeEach(async () => {
    database = Fireproof.storage()
    await setupDb(database)
  })
  it('can save as an encrypted car', async () => {
    const car = await Sync.makeCar(database)
    assert(car.cid)
  })
  it('can save as a clear car', async () => {
    const car = await Sync.makeCar(database, null)
    assert(car.cid)
  })
  it('can sync to an empty database', async () => {
    const database2 = Fireproof.storage()
    await setupSync(database, database2)

    const result2 = await database2.get('a1s35c')
    assert.equal(result2.name, 'alice')
    const result3 = await database2.get('b2s35c')
    assert.equal(result3.name, 'bob')
    const result4 = await database2.get('f4s35c')
    assert.equal(result4.name, 'frank')
  })

  it('continues to sync', async () => {
    const database2 = Fireproof.storage()
    await setupSync(database, database2)

    const result2 = await database2.get('a1s35c')
    assert.equal(result2.name, 'alice')
    const result3 = await database2.get('b2s35c')
    assert.equal(result3.name, 'bob')
    const result4 = await database2.get('f4s35c')
    assert.equal(result4.name, 'frank')

    console.log('sync complete')

    let done
    const doneP = new Promise((resolve) => { done = resolve })

    database2.registerListener(async (event) => {
      const result5 = await database2.get('carol')
      assert.equal(result5.name, 'carol')
      done()
    })
    await database.put({ _id: 'carol', name: 'carol' })
    return doneP
  })

  it("two identical databases don't send cars", async () => {
    const database3 = Fireproof.storage()
    await setupDb(database3)
    assert.deepEqual(database.clockToJSON(), database3.clockToJSON())

    const sync = new Sync(database, MockPeer)
    const sync2 = new Sync(database3, MockPeer)

    const offer = await sync.offer()
    const accept = await sync2.accept(offer)

    // test stuff
    sync.peer.that = sync2.peer
    sync2.peer.that = sync.peer

    sync.peer.send = function (message) {
      assert(JSON.parse(message), 'not a car')
      this.that.do('data', message)
    }

    sync.connect(accept)
    const result = await sync.backlog()
    assert(result)
    assert.equal(result.ok, true)

    const resultB = await sync2.backlog()
    assert(resultB)
    assert.equal(resultB.ok, true)
  })
  it('can sync to a database with a different clock', async () => {
    const database4 = Fireproof.storage()
    await setupDb(database4)

    assert.deepEqual(database.clockToJSON(), database4.clockToJSON())

    const docs = [ // capitalized
      { _id: 'a1s35c', name: 'Alice', age: 40 },
      { _id: 'b2s35c', name: 'Bob', age: 40 },
      { _id: 'f4s35c', name: 'Frank', age: 7 }
    ]
    for (const doc of docs) {
      const id = doc._id
      // await database4.put(doc)
      const response = await database4.put(doc)
      assert(response)
      assert(response.id, 'should have id')
      assert.equal(response.id, id)
    }
    // const newClock = database4.clockToJSON()

    await setupSync(database, database4)
    // console.log('clock0', database.clockToJSON())
    // console.log('clock4', database4.clockToJSON())
    // assert.deepEqual(database.clockToJSON(), database4.clockToJSON())

    // const vs = await database.visClock()
    // console.log(vs.vis)

    const result2 = await database.get('a1s35c')
    assert.equal(result2.name, 'Alice')

    // const result3 = await database.get('b2s35c')
    // assert.equal(result3.name, 'Bob')

    // const result4 = await database.get('f4s35c')
    // assert.equal(result4.name, 'Frank')
  })
  it('with a complex clock', async () => {
    const db2 = Fireproof.storage()
    await setupDb(db2)

    assert.deepEqual(database.clockToJSON(), db2.clockToJSON())

    for (const i of Array(10).keys()) {
      const response = await db2.put({ _id: 'id' + i, name: 'two' + i })
      assert(response)
      assert(response.id, 'should have id')

      const db1resp = await database.put({ _id: 'id' + i, name: 'one' + i })
      assert(db1resp)
      assert(db1resp.id, 'should have id')
    }

    const result2 = await database.get('id1')
    assert.equal(result2.name, 'one1')

    // const newClock = database4.clockToJSON()

    await setupSync(database, db2)

    for (const i of Array(20).keys()) {
      const response = await db2.put({ _id: 'id' + i, name: 'two' + i })
      assert(response)
      assert(response.id, 'should have id')

      const db1resp = await database.put({ _id: 'id' + i, name: 'one' + i })
      assert(db1resp)
      assert(db1resp.id, 'should have id')
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    await sleep(3000)

    const result3 = await db2.get('id1')
    const result4 = await database.get('id1')
    assert.equal(result4._id, result3._id)
    // assert.equal(result4.name, result3.name)

    // console.log('clock0', database.clockToJSON())
    // console.log('clock4', db2.clockToJSON())
    // assert.deepEqual(database.clockToJSON(), database4.clockToJSON())

    const r5 = await db2.put({ _id: 'after', name: 'after' })
    assert(r5.id)
    await sleep(2000)

    console.log('do get')

    const after = await db2.get('after')
    assert.equal(after.name, 'after')

    // const clvis = await db2.visClock()
    // console.log(clvis.vis)

    // const result3 = await database.get('b2s35c')
    // assert.equal(result3.name, 'Bob')

    // const result4 = await database.get('f4s35c')
    // assert.equal(result4.name, 'Frank')
  }).timeout(10000)
})

async function setupSync (dbA, dbB) {
  const sync = new Sync(dbA, MockPeer)
  const sync2 = new Sync(dbB, MockPeer)

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
}

class MockPeer {
  constructor (opts) {
    this.opts = opts
    this.initiator = opts.initiator
    this.messages = []
    this.handlers = new Map()
    this.that = null
    this.do('signal', { signal: true })

    // setTimeout(() => {
    //   // this.do('connect')
    //   this.do('signal', { signal: true })
    // }, 0)
  }

  send (message) {
    this.that.do('data', message)
  }

  signal (message) {
    // console.log('signal', message)
    this.do('connect')
    // this.that.do('connect')
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
