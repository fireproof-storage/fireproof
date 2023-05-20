import { describe, it, beforeEach } from 'mocha'
import assert from 'node:assert'
import { Loader } from '../src/loader.js'
import { loadData } from '../src/import.js'
import { Fireproof } from '../src/fireproof.js'
import { join } from 'path'
import { readFileSync, rmSync, readdirSync } from 'node:fs'
import { startServer } from '../scripts/server.js'

const TEST_DB_NAME = 'dataset-fptest'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

describe('Create a dataset', () => {
  let db, loader
  beforeEach(async () => {
    // rm -rf dbPath
    loader = Loader.appropriate(TEST_DB_NAME)
    const dbPath = join(loader.config.dataDir, TEST_DB_NAME)
    try {
      rmSync(dbPath, { recursive: true, force: true })
    } catch (err) {
      // console.error(err)
    }
    db = Fireproof.storage(TEST_DB_NAME)
    await loadData(db, './test/todos.json')
  })
  it('gets all docs', async () => {
    const response = await db.allDocuments()
    assert.equal(response.rows.length, 18)
  }).timeout(10000)
  it('creates clock file', async () => {
    const dbPath = join(loader.config.dataDir, TEST_DB_NAME)
    const clockPath = join(dbPath, 'header.json')
    assert.match(dbPath, /\.fireproof\//)
    assert(dbPath.indexOf(TEST_DB_NAME) > 0)
    const clockData = JSON.parse(readFileSync(clockPath))
    assert.equal(clockData.name, TEST_DB_NAME)
  }).timeout(10000)
  it('saves car files', () => {
    const dbPath = join(loader.config.dataDir, TEST_DB_NAME)
    const files = readdirSync(dbPath)
    assert(files.length > 2)
  })
  it('doesnt put the key in the header', async () => {

  })
  it('works with fresh reader storage', async () => {
    await sleep(100)
    const fileDb = await Fireproof.storage(TEST_DB_NAME)
    const response = await fileDb.allDocuments()
    assert.equal(response.rows.length, 18)
  })
  it('works with rest storage', async () => {
    const server = startServer()
    await sleep(100)
    console.log('file alldocs')
    const dbdocs = await db.allDocuments()
    assert.equal(dbdocs.rows.length, 18)
    console.log('rest storage')
    const restDb = await Fireproof.storage(TEST_DB_NAME, { loader: { type: 'rest', baseURL: 'http://localhost:8000' } })
    const response = await restDb.allDocuments()
    assert.equal(response.rows.length, 18)

    await Promise.all(Array.from({ length: 100 }).map(async () => {
      await restDb.put({ foo: 'bar' })
    }))
    const response2 = await restDb.allDocuments()
    assert.equal(response2.rows.length, 118)
    server.close()
  }).timeout(10000)
})
