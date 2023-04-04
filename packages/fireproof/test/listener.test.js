import { describe, it, beforeEach } from 'mocha'
import assert from 'node:assert'
import Blockstore from '../src/blockstore.js'
import Fireproof from '../src/fireproof.js'
import Listener from '../src/listener.js'
import Hydrator from '../src/hydrator.js'

let database, listener, star

describe('Listener', () => {
  beforeEach(async () => {
    database = new Fireproof(new Blockstore(), []) // todo: these need a cloud name aka w3name, add this after we have cloud storage of blocks
    const docs = [ // dave is first today
      { _id: 'd4s3b32a-3c3a', name: 'dave', age: 48 },
      { _id: 'a1s3b32a-3c3a', name: 'alice', age: 40 },
      { _id: 'b2s3b32a-3c3a', name: 'bob', age: 40 },
      { _id: 'c3s3b32a-3c3a', name: 'carol', age: 43 },
      { _id: 'e4s3b32a-3c3a', name: 'emily', age: 4 },
      { _id: 'f4s3b32a-3c3a', name: 'frank', age: 7 }
    ]
    for (const doc of docs) {
      const id = doc._id
      const response = await database.put(doc)
      assert(response)
      assert(response.id, 'should have id')
      assert.equal(response.id, id)
    }
    listener = new Listener(database, function (doc, emit) {
      if (doc.name) { emit('person') }
    })
    star = new Listener(database)
  })
  it('all listeners get the reset event', (done) => {
    let count = 0
    const check = () => {
      count++
      if (count === 3) done()
    }
    const startClock = database.clock
    database.put({ _id: 'k645-87tk', name: 'karl' }).then((ok) => {
      listener.on('person', check)
      listener.on('not-found', check)
      star.on('*', check)
      database.put({ _id: 'k645-87tk', name: 'karl2' }).then((ok) => {
        assert(ok.id)
        assert.notEqual(database.clock, startClock)
        Hydrator.zoom(database, startClock)
      }).catch(done)
    })
  })

  it('can listen to all events', (done) => {
    star.on('*', (key) => {
      assert.equal(key, 'i645-87ti')
      done()
    })
    database.put({ _id: 'i645-87ti', name: 'isaac' }).then((ok) => {
      assert(ok.id)
    }).catch(done)
  })
  it('shares only new events by default', (done) => {
    listener.on('person', (key) => {
      assert.equal(key, 'g645-87tg')
      done()
    })
    database.put({ _id: 'g645-87tg', name: 'gwen' }).then((ok) => {
      assert(ok.id)
    }).catch(done)
  }).timeout(200)
  it('shares all events if asked', async () => {
    let people = 0
    listener.on('person', (key) => {
      people++
    }, null)
    // this has to take longer than the database save operation
    // it's safe to make this number longer if it start failing
    await sleep(50)
    assert.equal(people, 6)
  }).timeout(2000)
  it('shares events since db.clock', (done) => {
    const clock = database.clock
    const afterEvent = () => {
      database.put({ _id: 'j645-87tj', name: 'jimmy' })
    }
    let people = 0
    database.put({ _id: 'h645-87th', name: 'harold' }).then(newPerson => {
      assert(newPerson.id)
      listener.on('person', (key) => {
        people++
        if (people === 1) {
          assert.equal(key, 'h645-87th')
        } else {
          assert.equal(key, 'j645-87tj')
          done()
        }
        if (people === 1) afterEvent()
      }, clock)
    })
  }).timeout(2000)
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
