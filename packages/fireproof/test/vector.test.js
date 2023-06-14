import { describe, it, beforeEach } from 'mocha'
import assert from 'node:assert'
import { Fireproof } from '../src/fireproof.js'
import { VectorStorage } from 'vector-storage'

let database, vectored

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (OPENAI_API_KEY) {
  describe('Vector with OpenAI', () => {
    beforeEach(async () => {
      database = Fireproof.storage()
      vectored = withVectorSearch(database, doc => doc.message, {
        openAIApiKey: OPENAI_API_KEY
      })

      const messages = [
        'Hello World, this is a test',
        'We are testing the vector library',
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
        'Pineapples are yellow'
      ]
      for (let i = 0, len = messages.length; i < len; i++) {
        await database.put({
          _id: `message-${i}`,
          message: messages[i]
        })
      }
    })

    it('search the index', async () => {
      const changes = await database.changesSince()
      assert.equal(changes.rows.length, 13)
      const results = await vectored.search('test', { limit: 3 })
      // console.log('results', results)
      assert.equal(results.length, 3)
      for (let i = 0, len = results.length; i < len; i++) {
        const doc = results[i].doc
        assert.match(doc.message, /test/)
      }
    })
    it('add more docs and search again', async () => {
      const messages = [
        'Trees are green',
        'Grass is green',
        'Flowers are colorful',
        'Logs are brown',
        'Moss is green',
        'Leaves are green'
      ]
      for (let i = 0, len = messages.length; i < len; i++) {
        await database.put({
          message: messages[i]
        })
      }
      const results = await vectored.search('bonsai', { limit: 3 })
      console.log('results', results)
      assert.equal(results.length, 3)
    })
    // it('delete some docs and search again', async () => {})
    // it('update some docs and search again', async () => {})
  })

  function withVectorSearch (database, mapFn, vectorOptions = {}) {
    // Create an instance of VectorStorage
    const vectorStore = new VectorStorage(vectorOptions)

    let clock = null
    const search = async (query, options = {}) => {
      const queryObj = { query }
      if (options.limit) {
        queryObj.k = options.limit
      }
      const changes = await database.changesSince(clock)
      clock = changes.clock
      if (changes.rows.length > 0) {
        const entries = vectorEntriesForChanges(changes.rows, mapFn)
        await vectorStore.addTexts(
          entries.map(e => e.text),
          entries.map(e => ({ id: e._id }))
        )
      }
      const result = await vectorStore.similaritySearch(queryObj, options)
      return await Promise.all(
        result.similarItems.map(async item => {
          const doc = await database.get(item.metadata.id)
          return { doc, score: item.score }
        })
      )
    }
    return { search }
  }
  const makeDoc = ({ key, value }) => ({ _id: key, ...value })

  const vectorEntriesForChanges = (changes, mapFn) => {
    const vectorEntries = []
    changes.forEach(({ key: _id, value, del }) => {
      // key is _id, value is the document
      if (del || !value) return
      let mapCalled = false
      const mapReturn = mapFn(makeDoc({ key: _id, value }), text => {
        mapCalled = true
        if (typeof k === 'undefined') return
        vectorEntries.push({
          text,
          _id
        })
      })
      if (!mapCalled && mapReturn) {
        vectorEntries.push({
          text: mapReturn,
          _id
        })
      }
    })
    return vectorEntries
  }
} else {
  console.log('Skipping vector tests, set OPENAI_API_KEY to run them with `OPENAI_API_KEY=yourkey npm test`')
}
