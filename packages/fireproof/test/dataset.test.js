import { describe, it, beforeEach } from 'mocha'
import assert from 'node:assert'
import { Loader } from '../src/loader.js'
import { join } from 'path'
import { readFileSync } from 'node:fs'

const TEST_DB_NAME = 'todo-test'

describe('Create a dataset', () => {
  let db, loader
  beforeEach(async () => {
    loader = new Loader()
    db = loader.loadDatabase(TEST_DB_NAME)
    await loader.loadData(db, './test/todos.json')
  })
  it('gets all docs', async () => {
    const response = await db.allDocuments()
    assert.equal(response.rows.length, 18)
  }).timeout(10000)
  it('creates clock file', async () => {
    const dbPath = join(loader.config.dataDir, TEST_DB_NAME)
    const clockPath = join(dbPath, 'clock.json')
    assert.equal(dbPath, '~/.fireproof/todo-test')
    const clockData = readFileSync(clockPath)
    assert.equal(clockData, 'clc')
  }).timeout(10000)
})
