import { describe, it, beforeEach } from 'mocha'
import assert from 'node:assert'
import Fireproof from '../src/fireproof.js'
import flexsearch from 'flexsearch'
const { Index } = flexsearch
// this is an illustration of how to use the flexsearch library

let database, flexed

describe('Fulltext with flexsearch', () => {
  beforeEach(async () => {
    database = Fireproof.storage()
    flexed = withFlexsearch(database) // this is a function that adds the flexsearch library to the database object

    const messages = [
      'Hello World, this is a test',
      'We are testing the flexsearch library',
      'When we test we test',
      'Apples are red',
      'Bananas are yellow',
      'Oranges are orange',
      'Pears are green',
      'Grapes are purple',
      'Strawberries are red',
      'Blueberries are blue',
      'Raspberries are red',
      'Watermelons are green',
      'Pineapples are yellow',
    ]
    for (let i = 0, len = messages.length; i < len; i++) {
      await database.put({
        _id: `message-${i}`,
        message: messages[i],
      })
    }
  })

  it('search the index', async () => {
    const changes = await database.changesSince()
    assert.equal(changes.rows.length, 13)
    const results = await flexed.search('red')
    assert.equal(results.length, 3)
    for (let i = 0, len = results.length; i < len; i++) {
      const doc = await database.get(results[i])
      assert.match(doc.message, /red/)
    }
  })
  // it('add more docs and search again', async () => {})
  // it('delete some docs and search again', async () => {})
  // it('update some docs and search again', async () => {})
})

function withFlexsearch (database, flexsearchOptions = {}) {
  const index = new Index(flexsearchOptions)
  let clock = null
  const search = async (query, options) => {
    const changes = await database.changesSince(clock)
    clock = changes.clock
    for (let i = 0; i < changes.rows.length; i++) {
      const { key, value } = changes.rows[i]
      await index.add(key, value.message)
    }
    return index.search(query, options)
  }
  return { search }
}
