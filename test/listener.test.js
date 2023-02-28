import { describe, it, beforeEach } from 'mocha'
import assert from 'node:assert'
import Blockstore from '../src/blockstore.js'
import Fireproof from '../src/fireproof.js'
import Listener from '../src/listener.js'

let database, listener

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
      console.log('person', key)
      people++
    }, null)
    await sleep(1)
    assert.equal(people, 6)
  }).timeout(200)
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
  }).timeout(200)
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
