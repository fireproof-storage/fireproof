import { describe, it, beforeEach } from 'mocha'
import assert from 'node:assert'
import { Loader } from '../src/loader.js'
import { Fireproof } from '../src/fireproof.js'
import { join } from 'path'
import { readFileSync, rmSync, readdirSync } from 'node:fs'

const TEST_DB_NAME = 'dataset-fptest'

describe('Create a dataset', () => {
  let db, loader
  beforeEach(async () => {
    // rm -rf dbPath
    loader = new Loader(TEST_DB_NAME)
    const dbPath = join(loader.config.dataDir, TEST_DB_NAME)
    try {
      rmSync(dbPath, { recursive: true, force: true })
    } catch (err) {
      // console.error(err)
    }
    db = Fireproof.storage(TEST_DB_NAME)
    await loader.loadData(db, './test/todos.json')
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
})
