import { describe, it, beforeEach, afterEach } from 'mocha'
import assert from 'node:assert'
import { Loader } from '../src/loader.js'
import { loadData } from '../src/import.js'
import { Fireproof } from '../src/fireproof.js'
import { join } from 'path'
import { readFileSync, readdirSync } from 'node:fs'
import { startServer } from '../scripts/server.js'

import { resetTestDataDir } from './helpers.js'

const TEST_DB_NAME = 'dataset-fptest'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

describe('Create a dataset', () => {
  let db, loader
  beforeEach(async () => {
    await sleep(100)
    loader = Loader.appropriate(TEST_DB_NAME)
    resetTestDataDir()
    db = Fireproof.storage(TEST_DB_NAME)
    await loadData(db, './test/todos.json')
    await sleep(100)
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
})

describe('Rest dataset', () => {
  let db, loader, server
  beforeEach(async () => {
    await sleep(100)
    loader = Loader.appropriate(TEST_DB_NAME)
    resetTestDataDir()
    db = Fireproof.storage(TEST_DB_NAME)
    await loadData(db, './test/todos.json')
    server = startServer()
    await sleep(100)
  })
  afterEach(async () => {
    server.close()
    await sleep(100)
  })
  it('works with rest storage', async () => {
    console.log('file alldocs')
    const dbdocs = await db.allDocuments()
    assert.equal(dbdocs.rows.length, 18)
    console.log('rest storage')
    const restDb = await Fireproof.storage(TEST_DB_NAME, { loader: { type: 'rest', url: 'http://localhost:8000/' + TEST_DB_NAME } })
    const response = await restDb.allDocuments()
    assert.equal(response.rows.length, 18)

    await Promise.all(Array.from({ length: 100 }).map(async () => {
      await restDb.put({ foo: 'bar' })
    }))
    const response2 = await restDb.allDocuments()
    assert.equal(response2.rows.length, 118)
    server.close()
    await sleep(100)
  }).timeout(10000)
  it('creates new db with rest storage', async () => {
    await sleep(100)
    const newRestDb = await Fireproof.storage(TEST_DB_NAME, { loader: { type: 'rest', url: 'http://localhost:8000/fptest-new-db-rest' } })
    const response = await newRestDb.allDocuments()
    assert.equal(response.rows.length, 0)
    console.log('do puts')
    // await Promise.all(Array.from({ length: 2 }).map(async () => {
    const ok = await newRestDb.put({ _id: 'test', foo: 'bar' })
    assert.equal(ok.id, 'test')

    const ok2 = await newRestDb.put({ _id: 'test2', foo: 'bar' })
    assert.equal(ok2.id, 'test2')

    // }))
    console.log('newRestDb alldocs')
    const response2 = await newRestDb.allDocuments()
    assert.equal(response2.rows.length, 2)
    await Promise.all(Array.from({ length: 100 }).map(async () => {
      await newRestDb.put({ foo: 'bar' })
    }))
    const response3 = await newRestDb.allDocuments()
    assert.equal(response3.rows.length, 102)

    await sleep(100)
  }).timeout(10000)
  it('creates new db with file storage AND secondary rest storage', async () => {
    await sleep(100)
    const secondaryDb = await Fireproof.storage('fptest-secondary-rest', { secondary: { type: 'rest', url: 'http://localhost:8000/fptest-secondary-rest-remote' } })

    const response = await secondaryDb.allDocuments()
    assert.equal(response.rows.length, 0)
    console.log('do puts')
    // await Promise.all(Array.from({ length: 2 }).map(async () => {
    const ok = await secondaryDb.put({ _id: 'test', foo: 'bar' })
    assert.equal(ok.id, 'test')

    const ok2 = await secondaryDb.put({ _id: 'test2', foo: 'bar' })
    assert.equal(ok2.id, 'test2')

    const dbPath = join(loader.config.dataDir, 'fptest-secondary-rest')
    const files = readdirSync(dbPath)
    assert(files.length > 4)

    await sleep(100)

    const remoteDbPath = join(loader.config.dataDir, 'fptest-secondary-rest-remote')
    const remoteFiles = readdirSync(remoteDbPath)
    assert(remoteFiles.length > 2)

    // }))
    console.log('secondaryDb alldocs')
    const response2 = await secondaryDb.allDocuments()
    assert.equal(response2.rows.length, 2)
    await Promise.all(Array.from({ length: 100 }).map(async () => {
      await secondaryDb.put({ foo: 'bar' })
    }))
    const response3 = await secondaryDb.allDocuments()
    assert.equal(response3.rows.length, 102)

    await sleep(100)
  }).timeout(10000)
  it('attach empty secondary rest storage to existing db', async () => {
    const fileDb = await Fireproof.storage(TEST_DB_NAME, { secondary: { type: 'rest', url: 'http://localhost:8000/fptest-todos-remote' } })
    const response = await fileDb.allDocuments()
    assert.equal(response.rows.length, 18)
  })
  it('attach existing secondary rest storage to empty db', () => {

  })
  it('attach existing secondary rest storage to existing db', () => {

  })
})
