import { describe, it, beforeEach, afterEach } from 'mocha'
import assert from 'node:assert'
import { Loader } from '../src/loader.js'
import { loadData } from '../src/import.js'
import { Fireproof } from '../src/fireproof.js'
import { join } from 'path'
import { readFileSync } from 'node:fs'
import { startServer } from '../scripts/server.js'

import { resetTestDataDir, dbFiles } from './helpers.js'

const TEST_DB_NAME = 'dataset-fptest'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

describe('Create a dataset', () => {
  let db, storage
  beforeEach(async () => {
    await sleep(10)
    storage = Loader.appropriate(TEST_DB_NAME)
    resetTestDataDir()
    db = Fireproof.storage(TEST_DB_NAME)
    await loadData(db, './test/todos.json')
    await sleep(10)
  })
  it('gets all docs', async () => {
    const response = await db.allDocuments()
    assert.equal(response.rows.length, 18)
  }).timeout(10000)
  it('creates clock file', async () => {
    const dbPath = join(storage.config.dataDir, TEST_DB_NAME)
    const clockPath = join(dbPath, 'header.json')
    assert.match(dbPath, /\.fireproof\//)
    assert(dbPath.indexOf(TEST_DB_NAME) > 0)
    const clockData = JSON.parse(readFileSync(clockPath))
    assert.equal(clockData.name, TEST_DB_NAME)
  }).timeout(10000)
  it('saves car files', async () => {
    const files = await dbFiles(storage, TEST_DB_NAME)
    assert(files.length > 2)
  })
  it('doesnt put the key in the header', async () => {

  })
  it('works with fresh reader storage', async () => {
    await sleep(10)
    const fileDb = await Fireproof.storage(TEST_DB_NAME)
    const response = await fileDb.allDocuments()
    assert.equal(response.rows.length, 18)
  })
})

describe('Rest dataset', () => {
  let db, storage, server
  beforeEach(async () => {
    await sleep(10)
    storage = Loader.appropriate(TEST_DB_NAME)
    resetTestDataDir()
    db = Fireproof.storage(TEST_DB_NAME)
    await loadData(db, './test/todos.json')
    server = startServer()
    await sleep(150)
  })
  afterEach(async () => {
    server.close()
    await sleep(10)
  })
  it('works with rest storage', async () => {
    // console.log('file alldocs')
    const dbdocs = await db.allDocuments()
    assert.equal(dbdocs.rows.length, 18)
    // console.log('rest storage')
    const restDb = await Fireproof.storage(TEST_DB_NAME, { storage: { type: 'rest', url: 'http://localhost:8000/' + TEST_DB_NAME } })
    const response = await restDb.allDocuments()
    assert.equal(response.rows.length, 18)
    // console.log('do writes')

    const ok = await restDb.put({ _id: 'testx', foo: 'bar' })
    assert.equal(ok.id, 'testx')

    const response2 = await restDb.allDocuments()
    assert.equal(response2.rows.length, 19)
    server.close()
    await sleep(100)
  }).timeout(10000)
  it('works long with rest storage', async () => {
    // console.log('file alldocs')
    const dbdocs = await db.allDocuments()
    assert.equal(dbdocs.rows.length, 18)
    // console.log('rest storage')
    const restDb = await Fireproof.storage(TEST_DB_NAME, { storage: { type: 'rest', url: 'http://localhost:8000/' + TEST_DB_NAME } })
    const response = await restDb.allDocuments()
    assert.equal(response.rows.length, 18)
    // console.log('do writes')
    // todo turn this number up to stress test the storage concurrency
    // see Rest#writeCars
    await Promise.all(Array.from({ length: 20 }).map(async () => {
      // console.log('do write')
      await restDb.put({ foo: 'bar' })
    }))
    const response2 = await restDb.allDocuments()
    assert.equal(response2.rows.length, 38)
    server.close()
    await sleep(100)
  }).timeout(10000)
  it('creates new db with rest storage', async () => {
    await sleep(100)
    const newRestDb = await Fireproof.storage(TEST_DB_NAME, { storage: { type: 'rest', url: 'http://localhost:8000/fptest-new-db-rest' } })
    const response = await newRestDb.allDocuments()
    assert.equal(response.rows.length, 0)
    // console.log('do puts')
    // await Promise.all(Array.from({ length: 2 }).map(async () => {
    const ok = await newRestDb.put({ _id: 'test', foo: 'bar' })
    assert.equal(ok.id, 'test')

    const ok2 = await newRestDb.put({ _id: 'test2', foo: 'bar' })
    assert.equal(ok2.id, 'test2')

    // }))
    // console.log('newRestDb alldocs')
    const response2 = await newRestDb.allDocuments()
    assert.equal(response2.rows.length, 2)
    await Promise.all(Array.from({ length: 10 }).map(async () => {
      await newRestDb.put({ foo: 'bar' })
    }))
    const response3 = await newRestDb.allDocuments()
    assert.equal(response3.rows.length, 12)

    await sleep(100)
  }).timeout(10000)
  it('creates new db with file storage AND secondary rest storage', async () => {
    await sleep(100)
    const secondaryDb = await Fireproof.storage('fptest-secondary-rest', { secondary: { type: 'rest', url: 'http://localhost:8000/fptest-secondary-rest-remote' } })

    const response = await secondaryDb.allDocuments()
    assert.equal(response.rows.length, 0)
    // console.log('do puts')
    // await Promise.all(Array.from({ length: 2 }).map(async () => {
    const ok = await secondaryDb.put({ _id: 'test', foo: 'bar' })
    assert.equal(ok.id, 'test')

    const ok2 = await secondaryDb.put({ _id: 'test2', foo: 'bar' })
    assert.equal(ok2.id, 'test2')

    const files = await dbFiles(storage, 'fptest-secondary-rest')

    assert(files.length > 4)

    await sleep(100)

    const remoteFiles = await dbFiles(storage, 'fptest-secondary-rest-remote')

    assert(remoteFiles.length > 2)

    // }))
    console.log('secondaryDb alldocs')
    const response2 = await secondaryDb.allDocuments()
    assert.equal(response2.rows.length, 2)
    await Promise.all(Array.from({ length: 10 }).map(async () => {
      await secondaryDb.put({ foo: 'bar' })
    }))
    const response3 = await secondaryDb.allDocuments()
    assert.equal(response3.rows.length, 12)

    await sleep(100)
  }).timeout(10000)
  it('attach empty secondary rest storage to existing db', async () => {
    await sleep(100)
    resetTestDataDir('fptest-xtodos-remote')
    // await mkdir(dirname(fullpath), { recursive: true })

    const remoteFiles0 = await dbFiles(storage, 'fptest-xtodos-remote')
    // console.log('remoteFiles0', 'fptest-xtodos-remote', remoteFiles0)
    assert.equal(remoteFiles0.length, 0)
    await sleep(100)

    const fileDb = await Fireproof.storage(TEST_DB_NAME, { secondary: { type: 'rest', url: 'http://localhost:8000/fptest-xtodos-remote' } })
    // const response = await fileDb.allDocuments()
    // assert.equal(response.rows.length, 18)
    assert.equal(fileDb.name, TEST_DB_NAME)
    // new writes should go to both
    // it('saves car files', () => {
    const files = await dbFiles(storage, TEST_DB_NAME)
    assert(files.length > 2)
    // })

    const remoteFiles = await dbFiles(storage, 'fptest-xtodos-remote')
    assert.equal(remoteFiles.length, 0)

    await fileDb.put({ _id: 'test', foo: 'bar' })

    await sleep(100)
    // it only writes new changes to the secondary, not history

    const remoteFiles2 = await dbFiles(storage, 'fptest-xtodos-remote')
    assert(remoteFiles2.length > 2)
    assert.equal(remoteFiles2.length, 3)
  })
  it('attach existing secondary rest storage to empty db in read-only mode', async () => {
    const emptyDb = await Fireproof.storage('fptest-empty-db-todos', { secondary: { readonly: true, type: 'rest', url: 'http://localhost:8000/' + TEST_DB_NAME } })
    const files = await dbFiles(storage, 'fptest-empty-db-todos')
    assert.equal(files.length, 0)

    const filesA = await dbFiles(storage, TEST_DB_NAME)
    assert.equal(filesA.length, 37)
    await sleep(50)
    assert.equal(emptyDb.name, 'fptest-empty-db-todos')
    const response = await emptyDb.allDocuments()
    assert.equal(response.rows.length, 18)
    await sleep(50)

    const files2 = await dbFiles(storage, 'fptest-empty-db-todos')
    assert.equal(files2.length, 3)
    // now test wht happens when we write to the secondary?

    const ok = await emptyDb.put({ _id: 'test', foo: 'bar' })
    assert.equal(ok.id, 'test')
    await sleep(50)

    const filesB = await dbFiles(storage, TEST_DB_NAME)
    assert.equal(filesB.length, 37)

    const files3 = await dbFiles(storage, 'fptest-empty-db-todos')
    assert.equal(files3.length, 6)

    /// now test what happens when we open a new db on the secondary's files
    const noSecondaryCloneDb = await Fireproof.storage('fptest-empty-db-todos')

    const response2 = await noSecondaryCloneDb.allDocuments()
    assert.equal(response2.rows.length, 19)

    const ok3 = await noSecondaryCloneDb.put({ _id: 'test3', foo: 'bar' })
    assert.equal(ok3.id, 'test3')

    await sleep(100)

    const files4 = await dbFiles(storage, 'fptest-empty-db-todos')
    assert.equal(files4.length, 8)

    // now make a db that uses empty-db-todos as its files, and TEST_DB_NAME

    // first make changes in TEST_DB_NAME
    const ok4 = await db.put({ _id: 'test4', foo: 'bar' })
    assert.equal(ok4.id, 'test4')

    await sleep(100)

    const files5 = await dbFiles(storage, TEST_DB_NAME)
    assert.equal(files5.length, 39)

    const ezistingDb = await Fireproof.storage('fptest-empty-db-todos', { secondary: { type: 'rest', url: 'http://localhost:8000/' + TEST_DB_NAME } })

    const response3 = await ezistingDb.allDocuments()
    assert.equal(response3.rows.length, 20)
  })
  it('attach existing secondary rest storage to empty db', async () => {
    const emptyDb = await Fireproof.storage('fptest-empty-db-todos', { secondary: { type: 'rest', url: 'http://localhost:8000/' + TEST_DB_NAME } })
    const files = await dbFiles(storage, 'fptest-empty-db-todos')
    assert.equal(files.length, 0)

    assert.equal(emptyDb.name, 'fptest-empty-db-todos')
    const response = await emptyDb.allDocuments()
    assert.equal(response.rows.length, 18)
    await sleep(100)

    const files2 = await dbFiles(storage, 'fptest-empty-db-todos')
    assert.equal(files2.length, 3)
    // now test wht happens when we write to the secondary?

    const ok = await emptyDb.put({ _id: 'test', foo: 'bar' })
    assert.equal(ok.id, 'test')
    await sleep(100)

    const files3 = await dbFiles(storage, 'fptest-empty-db-todos')
    assert.equal(files3.length, 6)

    /// now test what happens when we open a new db on the secondary's files
    const noSecondaryCloneDb = await Fireproof.storage('fptest-empty-db-todos')

    const response2 = await noSecondaryCloneDb.allDocuments()
    assert.equal(response2.rows.length, 19)

    const ok3 = await noSecondaryCloneDb.put({ _id: 'test3', foo: 'bar' })
    assert.equal(ok3.id, 'test3')

    await sleep(100)

    const files4 = await dbFiles(storage, 'fptest-empty-db-todos')
    assert.equal(files4.length, 8)

    // now make a db that uses empty-db-todos as its files, and TEST_DB_NAME

    // first make changes in TEST_DB_NAME
    const ok4 = await db.put({ _id: 'test4', foo: 'bar' })
    assert.equal(ok4.id, 'test4')

    await sleep(100)

    const files5 = await dbFiles(storage, TEST_DB_NAME)
    assert.equal(files5.length, 41)

    const ezistingDb = await Fireproof.storage('fptest-empty-db-todos', { secondary: { type: 'rest', url: 'http://localhost:8000/' + TEST_DB_NAME } })

    const four = await ezistingDb.get('test4')
    assert.equal(four.foo, 'bar')

    const response3 = await ezistingDb.allDocuments()
    console.log(response3.rows.map(r => r.key))
    assert.equal(response3.rows.length, 20)
  })
  it('attach existing secondary rest storage to existing db with no common ancestor', async () => {
    const newExistingDb = await Fireproof.storage('fptest-new-existing-db-todos')
    const ok = await newExistingDb.put({ _id: 'test', foo: 'bar' })
    assert.equal(ok.id, 'test')
    const mergedExistingDb = await Fireproof.storage('fptest-new-existing-db-todos', { secondary: { type: 'rest', url: 'http://localhost:8000/' + TEST_DB_NAME } })
    const response = await mergedExistingDb.allDocuments()
    assert.equal(response.rows.length, 18)
    const got = await mergedExistingDb.get('test')
    assert.equal(got.foo, 'bar')
  })
})
