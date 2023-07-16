import { describe, it, beforeEach, afterEach } from 'mocha'
import assert from 'node:assert'
import { loadData } from '../src/import.js'
import { Fireproof } from '../src/fireproof.js'
import { DbIndex as Index } from '../src/db-index.js'
import { join } from 'path'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { startServer } from '../scripts/server.js'

import { resetTestDataDir, dbFiles, cpDir } from './helpers.js'

import { Filesystem } from '../src/storage/filesystem.js'

const TEST_DB_NAME = 'dataset-fptest'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

describe('basic dataset', () => {
  let db, storage
  beforeEach(async () => {
    await sleep(10)
    await resetTestDataDir()
    // console.log('make db')
    db = Fireproof.storage(TEST_DB_NAME, {
      primary: { StorageClass: Filesystem }
    })
    // db.blocks.valet.primary = new Filesystem(TEST_DB_NAME)
    storage = db.blocks.valet.primary
    // console.log('storage', storage)
    // await db.ready

    // console.log('load data')
    await db.put({ _id: 'foo', bar: 'baz' })
    await sleep(10)
  })
  it('gets all docs', async () => {
    const response = await db.allDocuments()
    assert.equal(response.rows.length, 1)
    const doc = await db.get('foo')
    assert.equal(doc.bar, 'baz')
  }).timeout(10000)
  it('creates car files', async () => {
    const files = await dbFiles(storage, TEST_DB_NAME)
    assert.equal(files.length, 2)
    await db.put({ _id: 'xyz', bar: 'baz' })
    const files2 = await dbFiles(storage, TEST_DB_NAME)
    assert.equal(files2.length, 3)
  })
  it('writes header file', async () => {
    const files = await dbFiles(storage, TEST_DB_NAME)
    // console.log('files', files)
    assert(files.includes('main.json'))

    const dbPath = join(storage.config.dataDir, TEST_DB_NAME)
    const headerPath = join(dbPath, 'main.json')
    const headerData = JSON.parse(readFileSync(headerPath))
    // console.log('headerData', headerData)
    assert.equal(headerData.name, TEST_DB_NAME)
    assert(headerData.key, 'key should be in header')
  })
  it('reloads fresh', async () => {
    const responsex = await db.allDocuments()
    assert.equal(responsex.rows.length, 1)
    // console.log('NEW DB')
    sleep(10)
    const fileDb = Fireproof.storage(TEST_DB_NAME, {
      primary: { StorageClass: Filesystem }
    })
    await fileDb.ready
    assert.deepEqual(fileDb.clockToJSON(), db.clockToJSON())

    assert.deepEqual(fileDb.blocks.valet.primary.lastCar, db.blocks.valet.primary.lastCar)

    const response = await fileDb.allDocuments()
    assert.equal(response.rows.length, 1)
    const doc = await fileDb.get('foo')
    assert.equal(doc.bar, 'baz')
  })
  it('reloads fresh on branch', async () => {
    const dbPath = join(storage.config.dataDir, TEST_DB_NAME)
    const headerPath = join(dbPath, 'main.json')
    const header2Path = join(dbPath, 'branch.json')

    // copy the file from main to branch
    const headerRaw = readFileSync(headerPath)
    writeFileSync(header2Path, headerRaw)

    // open a db with storage using the user branch from the cloud secondary
    const theConfg = {
      primary: {
        StorageClass: Filesystem,
        branches: {
          branch: { readonly: false }
        }
      }
    }
    const userDb3 = Fireproof.storage(TEST_DB_NAME, theConfg)
    // userDb3.blocks.valet.primary = new Filesystem(TEST_DB_NAME, theConfg.primary)
    await userDb3.ready

    // make sure the branch is there
    const doc = await userDb3.get('foo')
    assert.equal(doc.bar, 'baz')
  })
})

// todo: this test but for rest
// assert that the index has the same rest config as the db
describe('basic dataset with index', () => {
  let db, storage, index, response
  beforeEach(async () => {
    await sleep(10)
    await resetTestDataDir()
    // console.log('make db')
    db = Fireproof.storage(TEST_DB_NAME, {
      primary: {
        StorageClass: Filesystem
      }
    })
    // db.blocks.valet.primary = new Filesystem(TEST_DB_NAME)
    // db.indexBlocks.valet.primary = new Filesystem(TEST_DB_NAME + 'index')
    storage = db.blocks.valet.primary

    index = new Index(db, 'food', doc => doc.bar)

    // console.log('load data')
    await db.put({ _id: 'foo', bar: 'baz' })
    response = await index.query({ key: 'baz' })
    db.maybeSaveClock()
    await sleep(10)
  })
  it('gets all docs', async () => {
    const response = await db.allDocuments()
    assert.equal(response.rows.length, 1)
    const doc = await db.get('foo')
    assert.equal(doc.bar, 'baz')
  }).timeout(10000)
  it('gets index', async () => {
    assert.equal(response.rows.length, 1)
    assert.equal(response.rows[0].id, 'foo')
  })
  it('creates car files', async () => {
    const files = await dbFiles(storage, TEST_DB_NAME)
    assert.equal(files.length, 2)
  })
  it('writes header file', async () => {
    const files = await dbFiles(storage, TEST_DB_NAME)
    assert(files.includes('main.json'))

    const dbPath = join(storage.config.dataDir, TEST_DB_NAME)
    const headerPath = join(dbPath, 'main.json')
    const headerData = JSON.parse(readFileSync(headerPath))
    assert.equal(headerData.name, TEST_DB_NAME)
    assert(headerData.key, 'key should be in header')
    assert.equal(headerData.indexes.length, 1)
    assert.equal(headerData.indexes[0].name, 'food')
    assert.equal(headerData.indexes[0].code, 'doc => doc.bar')

    assert(headerData.index.key, 'index key should be in header')
    assert(headerData.index.car, 'index car should be in header')
  })
  it('reloads fresh', async () => {
    // console.log('NEW DB')
    const fileDb = Fireproof.storage(TEST_DB_NAME, {
      primary: {
        StorageClass: Filesystem
      }
    })
    // await fileDb.ready
    // console.log('QUERY')
    const response = await fileDb.allDocuments()
    assert.equal(response.rows.length, 1)
    const doc = await fileDb.get('foo')
    assert.equal(doc.bar, 'baz')

    // console.log('QUERY INDEX', fileDb.indexes)
    assert.equal(fileDb.indexes.size, 1)

    const food = fileDb.index('food')
    const foodResponse = await food.query({ key: 'baz' }, false)
    assert.equal(foodResponse.rows.length, 1)
  })
})

describe('Create a dataset', () => {
  let db, storage
  beforeEach(async () => {
    await sleep(10)
    // storage = Loader.appropriate(TEST_DB_NAME)
    await resetTestDataDir()
    db = Fireproof.storage(TEST_DB_NAME, {
      primary: {
        StorageClass: Filesystem
      }
    })
    storage = db.blocks.valet.primary
    // await db.ready

    // console.log('load data')
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
    assert(files.length > 10)
  })
  it('doesnt put the key in the header', async () => {})
  it('works with fresh reader storage', async () => {
    await sleep(10)
    const fileDb = Fireproof.storage(TEST_DB_NAME, {
      primary: {
        StorageClass: Filesystem
      }
    })
    // await fileDb.ready
    // console.log('QUERY', fileDb)
    const response = await fileDb.allDocuments()
    assert.equal(response.rows.length, 18)
  })
  it.skip('you can compact it and delete the old files', async () => {
    const filesBefore = await dbFiles(storage, TEST_DB_NAME)
    assert.equal(filesBefore.length, 19)

    const beforeClock = storage.prepareHeader(db.toHeader())

    // const cidMap0 = await storage.getCidCarMap()
    // assert.equal(cidMap0.size, 48)
    // assert.equal(cidMap0.size, 66)
    // const carCids0 = new Set(cidMap0.values())
    // assert.equal(carCids0.size, 18)

    // console.log('COMPACT')

    await db.compact()

    const afterClock = storage.prepareHeader(db.toHeader())

    assert.notDeepEqual(beforeClock, afterClock)

    // erase the old files
    filesBefore.forEach(file => {
      if (file === 'main.json') return
      const filePath = join(storage.config.dataDir, TEST_DB_NAME, file)
      unlinkSync(filePath)
    })
    const filesAfter = await dbFiles(storage, TEST_DB_NAME)
    assert(filesAfter.length === 3)

    await sleep(10)
    const newFileDb = Fireproof.storage(TEST_DB_NAME, {
      primary: {
        StorageClass: Filesystem
      }
    })
    await newFileDb.ready
    // console.log('QUERY', newFileDb.clockToJSON())
    const response = await newFileDb.allDocuments()
    assert.equal(response.rows.length, 18)

    const response2 = await newFileDb.changesSince()
    assert.equal(response2.rows.length, 18)

    const response3 = await newFileDb.changesSince(newFileDb.clockToJSON())
    assert.equal(response3.rows.length, 0)

    const st2 = newFileDb.blocks.valet.primary
    const cidMap = await st2.getCidCarMap()
    assert.equal(cidMap.size, 48)
    const carCids = new Set(cidMap.values())
    assert.equal(carCids.size, 1)
  })
})

describe('Rest dataset', () => {
  let db, storage, server
  beforeEach(async () => {
    await sleep(10)
    await resetTestDataDir()
    db = Fireproof.storage(TEST_DB_NAME)
    db.blocks.valet.primary = new Filesystem(TEST_DB_NAME)
    storage = db.blocks.valet.primary
    await loadData(db, './test/todos.json')
    server = startServer()
    await sleep(10)
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

  it('reloads fresh on branch', async () => {
    const dbPath = join(storage.config.dataDir, TEST_DB_NAME)
    const headerPath = join(dbPath, 'main.json')
    const header2Path = join(dbPath, 'branch.json')

    // copy the file from main to branch
    const headerRaw = readFileSync(headerPath)
    writeFileSync(header2Path, headerRaw)

    // open a db with storage using the user branch from the cloud secondary
    const userDb3 = Fireproof.storage(TEST_DB_NAME, {
      primary: {
        type: 'rest',
        url: 'http://localhost:8000/' + TEST_DB_NAME,
        branches: {
          branch: { readonly: false }
        }
      }
    })
    await userDb3.ready

    // make sure the branch is there
    const doc = await userDb3.get('phr936g')
    assert.equal(doc._id, 'phr936g')
    assert.equal(doc.title, 'Coffee')
  })

  it('creates new db with file storage AND secondary rest storage', async () => {
    await sleep(100)
    const secondaryDb = await Fireproof.storage('fptest-secondary-rest', {
      primary: { StorageClass: Filesystem },
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

    assert.equal(files.length, 3)

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
    await resetTestDataDir('fptest-xtodos-remote')
    // await mkdir(dirname(fullpath), { recursive: true })

    const remoteFiles0 = await dbFiles(storage, 'fptest-xtodos-remote')
    // console.log('remoteFiles0', 'fptest-xtodos-remote', remoteFiles0)
    assert.equal(remoteFiles0.length, 0)
    await sleep(100)

    const fileDb = await Fireproof.storage(TEST_DB_NAME, {
      primary: { StorageClass: Filesystem },
      secondary: { type: 'rest', url: 'http://localhost:8000/fptest-xtodos-remote' }
    })
    const response0 = await db.allDocuments()
    assert.equal(response0.rows.length, 18)

    const response = await fileDb.allDocuments()
    assert.equal(response.rows.length, 18)

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
    // assert(remoteFiles2.length > 2)
    assert.equal(remoteFiles2.length, 2)
  })
  it('attach existing secondary rest storage to empty db in read-only mode', async () => {
    const emptyDb = await Fireproof.storage('fptest-empty-db-todos', {
      primary: { StorageClass: Filesystem },
      secondary: { readonly: true, type: 'rest', url: 'http://localhost:8000/' + TEST_DB_NAME }
    })
    const files = await dbFiles(storage, 'fptest-empty-db-todos')
    assert.equal(files.length, 0)

    const filesA = await dbFiles(storage, TEST_DB_NAME)
    assert.equal(filesA.length, 19)
    await sleep(50)
    assert.equal(emptyDb.name, 'fptest-empty-db-todos')

    const response0 = await db.allDocuments()
    assert.equal(response0.rows.length, 18)

    await emptyDb.ready

    const fileCars = db.blocks.valet.primary.carLog
    const fileCars2 = emptyDb.blocks.valet.primary.carLog
    const fileCars3 = emptyDb.blocks.valet.secondary.carLog

    assert.equal(fileCars.length, 18)

    assert.equal(fileCars2.length, 0)
    assert.equal(fileCars3.length, 18)

    // console.log('fileCars2', fileCars2)

    // assert.equal(fileCars.length, fileCars2.length)

    const response = await emptyDb.allDocuments()
    assert.equal(response.rows.length, 18)
    await sleep(50)

    const files2 = await dbFiles(storage, 'fptest-empty-db-todos')
    assert.equal(files2.length, 3, `should have many files, had ${files2.length}`)
    // now test wht happens when we write to the secondary?
    // console.log('PUT')
    const ok = await emptyDb.put({ _id: 'test', foo: 'bar' })
    assert.equal(ok.id, 'test')

    const responseD = await emptyDb.allDocuments()
    assert.equal(responseD.rows.length, 19)

    await sleep(50)

    const filesB = await dbFiles(storage, TEST_DB_NAME)
    assert.equal(filesB.length, 19)

    const files3 = await dbFiles(storage, 'fptest-empty-db-todos')
    assert.equal(files3.length, 5, `should have many files, had ${files3.length}`)

    /// now test what happens when we open a new db on the new primary's files
    // this should pass because the reads from the secondary are written to the primary
    const noSecondaryCloneDb = await Fireproof.storage('fptest-empty-db-todos', {
      primary: {
        StorageClass: Filesystem
      }
    })

    // console.log('HERE HERE')

    const response2 = await noSecondaryCloneDb.allDocuments()
    assert.equal(response2.rows.length, 19)

    const ok3 = await noSecondaryCloneDb.put({ _id: 'test3', foo: 'bar' })
    assert.equal(ok3.id, 'test3')

    await sleep(100)

    const files4 = await dbFiles(storage, 'fptest-empty-db-todos', {
      primary: {
        StorageClass: Filesystem
      }
    })
    assert.equal(files4.length, 6, `should have many files, had ${files4.length}`)

    // now make a db that uses empty-db-todos as its files, and TEST_DB_NAME

    // first make changes in TEST_DB_NAME
    const ok4 = await db.put({ _id: 'test4', foo: 'bar' })
    assert.equal(ok4.id, 'test4')

    await sleep(100)

    const files5 = await dbFiles(storage, TEST_DB_NAME)
    assert.equal(files5.length, 20)

    const ezistingDb = await Fireproof.storage('fptest-empty-db-todos', {
      primary: {
        StorageClass: Filesystem
      },
      secondary: { type: 'rest', url: 'http://localhost:8000/' + TEST_DB_NAME }
    })

    const response3 = await ezistingDb.allDocuments()
    assert.equal(response3.rows.length, 21)
  })
  it('attach existing secondary rest storage to empty db', async () => {
    const emptyDb = await Fireproof.storage('fptest-empty-db-todos', {
      primary: {
        StorageClass: Filesystem
      },
      secondary: { type: 'rest', url: 'http://localhost:8000/' + TEST_DB_NAME }
    })
    const files = await dbFiles(storage, 'fptest-empty-db-todos')
    assert.equal(files.length, 0)

    const filesX = await dbFiles(storage, TEST_DB_NAME)
    assert.equal(filesX.length, 19)

    assert.equal(emptyDb.name, 'fptest-empty-db-todos')
    const response = await emptyDb.allDocuments()
    assert.equal(response.rows.length, 18)
    await sleep(200)

    const files2 = await dbFiles(storage, 'fptest-empty-db-todos')
    assert.equal(files2.length, 3, `got ${files2.length} files`) // why is this variable?
    // now test wht happens when we write to the secondary?

    const ok = await emptyDb.put({ _id: 'test', foo: 'bar' })
    assert.equal(ok.id, 'test')
    await sleep(100)

    const files3 = await dbFiles(storage, 'fptest-empty-db-todos')
    assert.equal(files3.length, 5, `got ${files3.length} files`)

    /// now test what happens when we open a new db on the secondary's files
    const noSecondaryCloneDb = await Fireproof.storage('fptest-empty-db-todos', {
      primary: {
        StorageClass: Filesystem
      }
    })

    const response2 = await noSecondaryCloneDb.allDocuments()
    assert.equal(response2.rows.length, 19)

    const ok3 = await noSecondaryCloneDb.put({ _id: 'test3', foo: 'bar' })
    assert.equal(ok3.id, 'test3')

    await sleep(100)

    const files4 = await dbFiles(storage, 'fptest-empty-db-todos')
    assert.equal(files4.length, 6, `got ${files4.length} files`) // why variable?

    // now make a db that uses empty-db-todos as its files, and TEST_DB_NAME

    // first make changes in TEST_DB_NAME
    const ok4 = await db.put({ _id: 'test4', foo: 'bar' })
    assert.equal(ok4.id, 'test4')

    await sleep(100)

    const files5 = await dbFiles(storage, TEST_DB_NAME)
    assert.equal(files5.length, 21)

    const ezistingDb = await Fireproof.storage('fptest-empty-db-todos', {
      primary: {
        StorageClass: Filesystem
      },
      secondary: { type: 'rest', url: 'http://localhost:8000/' + TEST_DB_NAME }
    })

    const four = await ezistingDb.get('test4')
    assert.equal(four.foo, 'bar')

    const response3 = await ezistingDb.allDocuments()
    // console.log(response3.rows.map(r => r.key))
    assert.equal(response3.rows.length, 21)
  })
  it('attach existing secondary rest storage to existing db with no common ancestor', async () => {
    const newExistingDb = await Fireproof.storage('fptest-new-existing-db-todos', {
      primary: {
        StorageClass: Filesystem
      }
    })
    const ok = await newExistingDb.put({ _id: 'test', foo: 'bar' })
    assert.equal(ok.id, 'test')
    assert.equal(newExistingDb.clockToJSON().length, 1)
    const response0 = await newExistingDb.allDocuments()
    assert.equal(response0.rows.length, 1)

    const files5 = await dbFiles(storage, 'fptest-new-existing-db-todos')
    assert.equal(files5.length > 1, true)

    await sleep(100)
    // can reopen the database normally
    const newExistingDb2 = await Fireproof.storage('fptest-new-existing-db-todos', {
      primary: {
        StorageClass: Filesystem
      }
    })
    const response1 = await newExistingDb2.allDocuments()
    assert.equal(response1.rows.length, 1)
    assert.equal(newExistingDb2.clockToJSON().length, 1)
    assert.deepEqual(newExistingDb2.clockToJSON(), newExistingDb.clockToJSON())

    // console.log('HERE HERE')
    const mergedExistingDb = await Fireproof.storage('fptest-new-existing-db-todos', {
      primary: {
        StorageClass: Filesystem
      },
      secondary: { type: 'rest', url: 'http://localhost:8000/' + TEST_DB_NAME }
    })
    const response = await mergedExistingDb.allDocuments()
    assert.equal(mergedExistingDb.clockToJSON().length, 2, 'clock length')
    assert.equal(response.rows.length, 19)
    const got = await mergedExistingDb.get('test')
    assert.equal(got.foo, 'bar')
  }).timeout(10000)
  it('user clone of server short', async () => {
    // console.log('user clone of server short')
    const SERVER_DB_NAME = 'fptest-server-db-todos'
    const serverDb = await Fireproof.storage(SERVER_DB_NAME, {
      primary: {
        StorageClass: Filesystem
      }
    })
    await serverDb.put({ _id: 'ice', title: 'Coffee' })

    const iceCoffee = await serverDb.get('ice')
    assert.equal(iceCoffee.title, 'Coffee')

    await sleep(10)

    const USER_DB_NAME = 'fptest-user-db-todos'

    const userDb = await Fireproof.storage(USER_DB_NAME, {
      primary: {
        StorageClass: Filesystem
      },
      secondary: {
        type: 'rest',
        url: 'http://localhost:8000/' + SERVER_DB_NAME,
        branches: {
          main: { readonly: true },
          branch: { readonly: false }
        }
      }
    })

    await userDb.ready

    assert.equal(serverDb.clock.length, 1)
    assert.equal(userDb.clock.length, 1)
    assert.deepEqual(serverDb.clockToJSON(), userDb.clockToJSON())

    const serverPrimary = serverDb.blocks.valet.primary
    const userSecondary = userDb.blocks.valet.secondary

    assert.equal(serverPrimary.carLog.length, 1)
    assert.equal(userSecondary.carLog.length, 1)
    assert.deepEqual(serverPrimary.carLog, userSecondary.carLog)

    const blockCID = serverDb.clock[0]
    const gotBlock = await serverPrimary.getLoaderBlock(blockCID)
    // console.log('GGGGGG gotBlock', gotBlock)
    assert(gotBlock.block)
    assert(gotBlock.carCid)
    assert.equal(gotBlock.carCid.toString(), serverPrimary.carLog[0].toString())

    const gotBlock2 = await userSecondary.getLoaderBlock(blockCID)
    assert(gotBlock2.block)
    assert(gotBlock2.carCid)
    assert.equal(gotBlock2.carCid.toString(), serverPrimary.carLog[0].toString())

    const userPrimary = userDb.blocks.valet.primary
    assert.deepEqual([], userPrimary.carLog)

    const err = await userPrimary.getLoaderBlock(blockCID).catch(e => e)
    assert.match(err.message, /Missing car/)

    // db can load a document by id
    const doc = await userDb.get('ice')
    assert.equal(doc._id, 'ice')
    assert.equal(doc.title, 'Coffee')

    // return

    userDb.maybeSaveClock() // force header write
    await sleep(100)

    const testdbPath = join(storage.config.dataDir, SERVER_DB_NAME)
    const localdbPath = join(storage.config.dataDir, USER_DB_NAME)
    const mainHeaderPath = join(testdbPath, 'main.json')
    const userHeaderPath = join(testdbPath, 'branch.json')
    const mainHeaderData = JSON.parse(readFileSync(mainHeaderPath))
    const userHeaderData = JSON.parse(readFileSync(userHeaderPath))

    // assert(mainHeaderData.clock.length > 0)
    // assert(userHeaderData.clock.length > 0)

    assert.deepEqual(mainHeaderData.clock, userHeaderData.clock)

    assert.deepEqual(mainHeaderData.key, userHeaderData.key)
    assert.deepEqual(mainHeaderData.car, userHeaderData.car)

    doc.title = 'Tea'
    const ok = await userDb.put(doc)
    assert.equal(ok.id, 'ice')

    await sleep(100)
    const doc3a = await userDb.get('ice')
    assert.equal(doc3a._id, 'ice')
    assert.equal(doc3a.title, 'Tea')

    const userHeaderData2 = JSON.parse(readFileSync(userHeaderPath))
    assert.deepEqual(userHeaderData2.key, userHeaderData.key)
    assert.notDeepEqual(userHeaderData2.car, userHeaderData.car)

    const carPath = join(testdbPath, userHeaderData2.car) + '.car'
    const carDataRaw = readFileSync(carPath)
    assert(carDataRaw.length > 200)

    // open a db with primary storage using the main branch from the cloud secondary
    const userDb4 = await Fireproof.storage(SERVER_DB_NAME, {
      primary: {
        StorageClass: Filesystem
      }
    })

    // console.log('HEREHERE')

    // it will not have the same document
    const doc4 = await userDb4.get('ice')
    assert.equal(doc4._id, 'ice')
    assert.equal(doc4.title, 'Coffee')

    // open a db with the same local name, no secondary
    const userDb2 = await Fireproof.storage(USER_DB_NAME, {
      primary: {
        StorageClass: Filesystem
      }
    })
    // it will have the same document
    const doc2 = await userDb2.get('ice')
    assert.equal(doc2._id, 'ice')
    assert.equal(doc2.title, 'Tea')

    await sleep(100)

    // fuck around with the filesystem
    const COPY_NAME = USER_DB_NAME + 'copy'
    await resetTestDataDir(COPY_NAME)
    const copydbPath = join(storage.config.dataDir, COPY_NAME)

    // recursively copy from testdbPath to copydbPath

    cpDir(localdbPath, copydbPath)
    const copyHeaderPath = join(copydbPath, 'main.json')
    const copy2HeaderPath = join(copydbPath, 'biff.json')
    // copy the file from main to branch
    const headerRaw = readFileSync(copyHeaderPath)
    writeFileSync(copy2HeaderPath, headerRaw)

    const userXYZ = Fireproof.storage(COPY_NAME, {
      primary: {
        StorageClass: Filesystem
      }
    })
    await userXYZ.ready
    // return
    await sleep(100)
    const docX = await userXYZ.get('ice')
    assert.equal(docX._id, 'ice')
    assert.equal(docX.title, 'Tea')

    // now open one on the branch

    // open a db with storage using the user branch from the cloud secondary
    const userDbG = Fireproof.storage(COPY_NAME, {
      primary: {
        StorageClass: Filesystem,
        branches: {
          biff: { readonly: false }
        }
      }
    })
    await userDbG.ready

    await sleep(100)
    const docG = await userXYZ.get('ice')
    assert.equal(docG._id, 'ice')
    assert.equal(docG.title, 'Tea')

    // const copy2HeaderPath = join(copydbPath, 'biff.json')
    // copy the file from main to branch
    const branchheaderRaw = readFileSync(userHeaderPath)
    // const mainheaderRaw = readFileSync(mainHeaderPath)

    const branchHeaderJSON = JSON.parse(branchheaderRaw)

    assert.equal(branchHeaderJSON.key, userDb4.blocks.valet.primary.keyMaterial)
    assert.equal(branchHeaderJSON.key, mainHeaderData.key)
    assert(branchHeaderJSON.car)

    // which key should it be?
    // assert.equal(branchHeaderJSON.key, userDbG.blocks.valet.primary.keyMaterial, 'key material')
    assert.equal(branchHeaderJSON.key, userHeaderData.key, 'key material')
    assert.equal(branchHeaderJSON.key, userHeaderData2.key, 'key material')
    assert.equal(branchHeaderJSON.key, userDb4.blocks.valet.primary.keyMaterial, 'key material')
    assert.equal(branchHeaderJSON.key, userDb.blocks.valet.secondary.keyMaterial, 'key material')
    assert.equal(branchHeaderJSON.car, userHeaderData2.car, 'car file')
    // const branchheaderRaw = readFileSync(branchHeaderPath)
    // writeFileSync(copy2HeaderPath, headerRaw)

    // todo TEMPORARILY try copying branch.json to main.json
    // const headerRaw = readFileSync(copyHeaderPath)
    // writeFileSync(mainHeaderPath, branchheaderRaw)
    // writeFileSync(userHeaderPath, mainheaderRaw)

    // conclusion: we are writing out the branch header with the wrong car

    // return
    // open a db with storage using the user branch from the cloud secondary
    const userDb3 = Fireproof.storage(SERVER_DB_NAME, {
      primary: {
        type: 'rest',
        branches: {
          branch: { readonly: false }
        },
        url: 'http://localhost:8000/' + SERVER_DB_NAME
      }
    })
    await userDb3.ready
    // return
    await sleep(100)

    assert.equal(branchHeaderJSON.key, userDb3.blocks.valet.primary.keyMaterial, 'key material')
    assert.equal(branchHeaderJSON.car, userDb3.blocks.valet.primary.lastCar, 'car file')

    const doc3 = await userDb3.get('ice')
    assert.equal(doc3._id, 'ice')
    assert.equal(doc3.title, 'Tea')
  })
  it('user clone of server dataset', async () => {
    // console.log('HERE HERE')
    const files5 = await dbFiles(storage, TEST_DB_NAME)
    assert.equal(files5.length, 19)
    const files4 = await dbFiles(storage, 'fptest-user-db-todos')
    assert.equal(files4.length, 0)

    // user opens a new db with a cloud secondary with a read-only main branch and a read-write user branch
    const userDb = await Fireproof.storage('fptest-user-db-todos', {
      primary: {
        StorageClass: Filesystem
      },
      secondary: {
        type: 'rest',
        url: 'http://localhost:8000/' + TEST_DB_NAME,
        branches: {
          main: { readonly: true },
          mine: { readonly: false }
        }
      }
    })
    // db can load a document by id
    const doc = await userDb.get('phr936g')
    assert.equal(doc._id, 'phr936g')
    assert.equal(doc.title, 'Coffee')
    // user modifies document

    userDb.maybeSaveClock() // force header write
    await sleep(100)

    const testdbPath = join(storage.config.dataDir, TEST_DB_NAME)
    // const localdbPath = join(storage.config.dataDir, 'fptest-user-db-todos')
    const mainHeaderPath = join(testdbPath, 'main.json')
    const userHeaderPath = join(testdbPath, 'mine.json')
    const mainHeaderData = JSON.parse(readFileSync(mainHeaderPath))
    const userHeaderData = JSON.parse(readFileSync(userHeaderPath))

    // console.log('userDataPath', userHeaderData)

    // assert(mainHeaderData.clock.length > 0)
    // assert(userHeaderData.clock.length > 0)

    assert.deepEqual(mainHeaderData.clock, userHeaderData.clock)

    assert.deepEqual(mainHeaderData.key, userHeaderData.key)
    assert.deepEqual(mainHeaderData.car, userHeaderData.car)

    doc.title = 'Tea'
    const ok = await userDb.put(doc)
    assert.equal(ok.id, 'phr936g')

    await sleep(100)

    const files3 = await dbFiles(storage, 'fptest-user-db-todos')
    assert.equal(files3.length, 4, `files3.length ${files3.length}`)

    const files2 = await dbFiles(storage, TEST_DB_NAME)
    assert.equal(files2.length, 21, `files2.length ${files2.length}`)

    // const mainHeaderData2 = JSON.parse(readFileSync(mainHeaderPath))
    const userHeaderData2 = JSON.parse(readFileSync(userHeaderPath))

    // assert(mainHeaderData2.clock.length > 0)
    // assert.deepEqual(mainHeaderData.clock, mainHeaderData2.clock)

    // assert.notDeepEqual(userHeaderData.clock, userHeaderData2.clock)

    const doc3a = await userDb.get('phr936g')
    assert.equal(doc3a._id, 'phr936g')

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
    const userDb2 = await Fireproof.storage('fptest-user-db-todos', {
      primary: {
        StorageClass: Filesystem
      }
    })
    // it will have the same document
    const doc2 = await userDb2.get('phr936g')
    assert.equal(doc2._id, 'phr936g')
    assert.equal(doc2.title, 'Tea')

    const files = await dbFiles(storage, TEST_DB_NAME)
    assert(files.includes('mine.json'))
    const dbPath = join(storage.config.dataDir, TEST_DB_NAME)
    const headerPath = join(dbPath, 'mine.json')
    const headerData = JSON.parse(readFileSync(headerPath))
    // console.log('headerXXXData', headerData)
    // assert.equal(headerData.name, TEST_DB_NAME)

    assert(headerData.key, 'key should be in header')
    assert.deepEqual(mainHeaderData.key, headerData.key)
    assert.notDeepEqual(mainHeaderData.car, headerData.car)
    assert.deepEqual(userHeaderData2.car, headerData.car)
    assert.deepEqual(userHeaderData2.key, headerData.key)

    await sleep(100)
    // console.log('HEREHERE')

    // open a db with storage using the user branch from the cloud secondary
    const userDb3 = Fireproof.storage(TEST_DB_NAME, {
      primary: {
        type: 'rest',
        url: 'http://localhost:8000/' + TEST_DB_NAME,
        branches: {
          mine: { readonly: false }
        }
      }
    })
    await userDb3.ready
    // return
    await sleep(100)

    assert.equal(userDb3.blocks.valet.primary.name, 'dataset-fptest')
    assert.equal(userDb3.blocks.valet.primary.config.branches.mine.readonly, false)
    // console.log('hmm', userDb3.blocks.valet.primary)

    assert.equal(userDb3.blocks.valet.primary.lastCar, headerData.car)
    assert.equal(userDb3.blocks.valet.primary.keyMaterial, headerData.key)

    // it will have the same document
    const doc3 = await userDb3.get('phr936g')
    assert.equal(doc3._id, 'phr936g')
    assert.equal(doc3.title, 'Tea')

    // also test mine branch on Filesystem primary
    // what happens when we use a bunk branch name?
  })

  // the same test as above but where the user branch shares a key with the local main branch
  it('user clone server dataset with user key in user branch')
})
