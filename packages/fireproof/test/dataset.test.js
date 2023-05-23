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
    const clockPath = join(dbPath, 'main.json')
    assert.match(dbPath, /\.fireproof\//)
    assert(dbPath.indexOf(TEST_DB_NAME) > 0)
    const clockData = JSON.parse(readFileSync(clockPath))
    assert.equal(clockData.name, TEST_DB_NAME)
  }).timeout(10000)
  it('saves car files', async () => {
    const files = await dbFiles(storage, TEST_DB_NAME)
    assert(files.length > 20)
  })
  it('doesnt put the key in the header', async () => {})
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
    const restDb = await Fireproof.storage(TEST_DB_NAME, {
      primary: { type: 'rest', url: 'http://localhost:8000/' + TEST_DB_NAME }
    })
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
    const restDb = await Fireproof.storage(TEST_DB_NAME, {
      primary: { type: 'rest', url: 'http://localhost:8000/' + TEST_DB_NAME }
    })
    const response = await restDb.allDocuments()
    assert.equal(response.rows.length, 18)
    // console.log('do writes')
    // todo turn this number up to stress test the storage concurrency
    // see Rest#writeCars
    await Promise.all(
      Array.from({ length: 20 }).map(async () => {
        // console.log('do write')
        await restDb.put({ foo: 'bar' })
      })
    )
    const response2 = await restDb.allDocuments()
    assert.equal(response2.rows.length, 38)
    server.close()
    await sleep(100)
  }).timeout(10000)
  it('creates new db with rest storage', async () => {
    await sleep(100)
    const newRestDb = await Fireproof.storage(TEST_DB_NAME, {
      primary: { type: 'rest', url: 'http://localhost:8000/fptest-new-db-rest' }
    })
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
    await Promise.all(
      Array.from({ length: 10 }).map(async () => {
        await newRestDb.put({ foo: 'bar' })
      })
    )
    const response3 = await newRestDb.allDocuments()
    assert.equal(response3.rows.length, 12)

    await sleep(100)
  }).timeout(10000)
  it('creates new db with file storage AND secondary rest storage', async () => {
    await sleep(100)
    const secondaryDb = await Fireproof.storage('fptest-secondary-rest', {
      secondary: { type: 'rest', url: 'http://localhost:8000/fptest-secondary-rest-remote' }
    })

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
    // console.log('secondaryDb alldocs')
    const response2 = await secondaryDb.allDocuments()
    assert.equal(response2.rows.length, 2)
    await Promise.all(
      Array.from({ length: 10 }).map(async () => {
        await secondaryDb.put({ foo: 'bar' })
      })
    )
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

    const fileDb = await Fireproof.storage(TEST_DB_NAME, {
      secondary: { type: 'rest', url: 'http://localhost:8000/fptest-xtodos-remote' }
    })
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
    const emptyDb = await Fireproof.storage('fptest-empty-db-todos', {
      secondary: { readonly: true, type: 'rest', url: 'http://localhost:8000/' + TEST_DB_NAME }
    })
    const files = await dbFiles(storage, 'fptest-empty-db-todos')
    assert.equal(files.length, 0)

    const filesA = await dbFiles(storage, TEST_DB_NAME)
    assert.equal(filesA.length, 37)
    await sleep(50)
    assert.equal(emptyDb.name, 'fptest-empty-db-todos')

    const response0 = await db.allDocuments()
    assert.equal(response0.rows.length, 18)

    const response = await emptyDb.allDocuments()
    assert.equal(response.rows.length, 18)
    await sleep(50)

    const files2 = await dbFiles(storage, 'fptest-empty-db-todos')
    assert.equal(files2.length > 5, true)
    // now test wht happens when we write to the secondary?
    // console.log('PUT')

    const ok = await emptyDb.put({ _id: 'test', foo: 'bar' })
    assert.equal(ok.id, 'test')

    const responseD = await emptyDb.allDocuments()
    assert.equal(responseD.rows.length, 19)

    await sleep(50)

    const filesB = await dbFiles(storage, TEST_DB_NAME)
    assert.equal(filesB.length, 37)

    const files3 = await dbFiles(storage, 'fptest-empty-db-todos')
    assert.equal(files3.length > 8, true)

    /// now test what happens when we open a new db on the new primary's files
    // this should pass because the reads from the secondary are written to the primary
    const noSecondaryCloneDb = await Fireproof.storage('fptest-empty-db-todos')

    // console.log('HERE HERE')

    const response2 = await noSecondaryCloneDb.allDocuments()
    assert.equal(response2.rows.length, 19)

    const ok3 = await noSecondaryCloneDb.put({ _id: 'test3', foo: 'bar' })
    assert.equal(ok3.id, 'test3')

    await sleep(100)

    const files4 = await dbFiles(storage, 'fptest-empty-db-todos')
    assert.equal(files4.length > 10, true)

    // now make a db that uses empty-db-todos as its files, and TEST_DB_NAME

    // first make changes in TEST_DB_NAME
    const ok4 = await db.put({ _id: 'test4', foo: 'bar' })
    assert.equal(ok4.id, 'test4')

    await sleep(100)

    const files5 = await dbFiles(storage, TEST_DB_NAME)
    assert.equal(files5.length, 39)

    const ezistingDb = await Fireproof.storage('fptest-empty-db-todos', {
      secondary: { type: 'rest', url: 'http://localhost:8000/' + TEST_DB_NAME }
    })

    const response3 = await ezistingDb.allDocuments()
    assert.equal(response3.rows.length, 21)
  })
  it('attach existing secondary rest storage to empty db', async () => {
    const emptyDb = await Fireproof.storage('fptest-empty-db-todos', {
      secondary: { type: 'rest', url: 'http://localhost:8000/' + TEST_DB_NAME }
    })
    const files = await dbFiles(storage, 'fptest-empty-db-todos')
    assert.equal(files.length, 0)

    const filesX = await dbFiles(storage, TEST_DB_NAME)
    assert.equal(filesX.length, 37)

    assert.equal(emptyDb.name, 'fptest-empty-db-todos')
    const response = await emptyDb.allDocuments()
    assert.equal(response.rows.length, 18)
    await sleep(200)

    const files2 = await dbFiles(storage, 'fptest-empty-db-todos')
    assert(files2.length > 5) // why is this variable?
    // now test wht happens when we write to the secondary?

    const ok = await emptyDb.put({ _id: 'test', foo: 'bar' })
    assert.equal(ok.id, 'test')
    await sleep(100)

    const files3 = await dbFiles(storage, 'fptest-empty-db-todos')
    assert.equal(files3.length > 8, true)

    /// now test what happens when we open a new db on the secondary's files
    const noSecondaryCloneDb = await Fireproof.storage('fptest-empty-db-todos')

    const response2 = await noSecondaryCloneDb.allDocuments()
    assert.equal(response2.rows.length, 19)

    const ok3 = await noSecondaryCloneDb.put({ _id: 'test3', foo: 'bar' })
    assert.equal(ok3.id, 'test3')

    await sleep(100)

    const files4 = await dbFiles(storage, 'fptest-empty-db-todos')
    assert.equal(files4.length > 10, true) // why variable?

    // now make a db that uses empty-db-todos as its files, and TEST_DB_NAME

    // first make changes in TEST_DB_NAME
    const ok4 = await db.put({ _id: 'test4', foo: 'bar' })
    assert.equal(ok4.id, 'test4')

    await sleep(100)

    const files5 = await dbFiles(storage, TEST_DB_NAME)
    assert.equal(files5.length, 41)

    const ezistingDb = await Fireproof.storage('fptest-empty-db-todos', {
      secondary: { type: 'rest', url: 'http://localhost:8000/' + TEST_DB_NAME }
    })

    const four = await ezistingDb.get('test4')
    assert.equal(four.foo, 'bar')

    const response3 = await ezistingDb.allDocuments()
    // console.log(response3.rows.map(r => r.key))
    assert.equal(response3.rows.length, 21)
  })
  it('attach existing secondary rest storage to existing db with no common ancestor', async () => {
    const newExistingDb = await Fireproof.storage('fptest-new-existing-db-todos')
    const ok = await newExistingDb.put({ _id: 'test', foo: 'bar' })
    assert.equal(ok.id, 'test')
    assert.equal(newExistingDb.clockToJSON().length, 1)
    const response0 = await newExistingDb.allDocuments()
    assert.equal(response0.rows.length, 1)

    const files5 = await dbFiles(storage, 'fptest-new-existing-db-todos')
    assert.equal(files5.length > 1, true)

    await sleep(100)
    // can reopen the database normally
    const newExistingDb2 = await Fireproof.storage('fptest-new-existing-db-todos')
    const response1 = await newExistingDb2.allDocuments()
    assert.equal(response1.rows.length, 1)
    assert.equal(newExistingDb2.clockToJSON().length, 1)
    assert.deepEqual(newExistingDb2.clockToJSON(), newExistingDb.clockToJSON())

    // console.log('HERE HERE')
    const mergedExistingDb = await Fireproof.storage('fptest-new-existing-db-todos', {
      secondary: { type: 'rest', url: 'http://localhost:8000/' + TEST_DB_NAME }
    })
    const response = await mergedExistingDb.allDocuments()
    assert.equal(mergedExistingDb.clockToJSON().length, 2, 'clock length')
    assert.equal(response.rows.length, 19)
    const got = await mergedExistingDb.get('test')
    assert.equal(got.foo, 'bar')
  })

  it('user clone of server dataset', async () => {
    const files5 = await dbFiles(storage, TEST_DB_NAME)
    assert.equal(files5.length, 37)
    const files4 = await dbFiles(storage, 'fptest-user-db-todos')
    assert.equal(files4.length, 0)

    // user opens a new db with a cloud secondary with a read-only main branch and a read-write user branch
    const userDb = await Fireproof.storage('fptest-user-db-todos', {
      secondary: {
        type: 'rest',
        url: 'http://localhost:8000/' + TEST_DB_NAME,
        branches: {
          main: { readonly: true },
          userX: { readonly: false }
        }
      }
    })
    // db can load a document by id
    const doc = await userDb.get('phr936g')
    assert.equal(doc._id, 'phr936g')
    assert.equal(doc.title, 'Coffee')
    // user modifies document

    doc.title = 'Tea'
    const ok = await userDb.put(doc)
    assert.equal(ok.id, 'phr936g')

    await sleep(100)

    const files3 = await dbFiles(storage, 'fptest-user-db-todos')
    assert.equal(files3.length > 6, true)

    const files2 = await dbFiles(storage, TEST_DB_NAME)
    assert.equal(files2.length > 36, true)

    // it will be saved locally and to the user branch on the server
    // ** to prove this **
    // open a db with primary storage using the main branch from the cloud secondary
    const userDb4 = await Fireproof.storage(TEST_DB_NAME, {
      primary: {
        type: 'rest',
        url: 'http://localhost:8000/' + TEST_DB_NAME
      }
    })

    // console.log('HEREHERE')

    // it will not have the same document
    const doc4 = await userDb4.get('phr936g')
    assert.equal(doc4._id, 'phr936g')
    assert.equal(doc4.title, 'Coffee')

    // open a db with the same local name, no secondary
    const userDb2 = await Fireproof.storage('fptest-user-db-todos')
    // it will have the same document
    const doc2 = await userDb2.get('phr936g')
    assert.equal(doc2._id, 'phr936g')
    assert.equal(doc2.title, 'Tea')
    // open a db with storage using the user branch from the cloud secondary
    const userDb3 = await Fireproof.storage(TEST_DB_NAME, {
      primary: {
        type: 'rest',
        url: 'http://localhost:8000/' + TEST_DB_NAME,
        branches: {
          // main: { readonly: true },
          usrX: { readonly: false }
        }
      }
    })

    // it will have the same document
    const doc3 = await userDb3.get('phr936g')
    assert.equal(doc3._id, 'phr936g')
    assert.equal(doc3.title, 'Tea')
  })

  // the same test as above but where the user branch shares a key with the local main branch
  it('user clone of server dataset with user key in user branch')
})
