/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable mocha/max-top-level-suites */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { assert, equals, notEquals, matches, resetDirectory, equalsJSON } from './helpers.js'
import { Database } from '../dist/test/database.esm.js'
import { connect } from '../dist/test/connect.esm.js'
// import { Doc } from '../dist/test/types.d.esm.js'
import { MetaStore } from '../dist/test/store-fs.esm.js'
import { join } from 'path'
import { promises as fs } from 'fs'
const { readFile, writeFile } = fs

const serviceConfig = {
  s3: {
    upload: 'https://04rvvth2b4.execute-api.us-east-2.amazonaws.com/uploads',
    download: 'https://sam-app-s3uploadbucket-e6rv1dj2kydh.s3.us-east-2.amazonaws.com'
  }
}

const mockStore = new Map()
const mockConnect = {
  // eslint-disable-next-line @typescript-eslint/require-await
  upload: async function (bytes, { type, name, car, branch }) {
    const key = new URLSearchParams({ type, name, car, branch }).toString()
    mockStore.set(key, bytes)
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  download: async function ({ type, name, car, branch }) {
    const key = new URLSearchParams({ type, name, car, branch }).toString()
    return mockStore.get(key)
  }
}

// eslint-disable-next-line mocha/no-skipped-tests
describe.skip('basic Connection with s3 remote', function () {
  /** @type {Database} */
  let db, dbName
  beforeEach(async function () {
    dbName = 'test-s3-' + Math.ceil(Math.random() * 100000)
    db = new Database(dbName)
    const remote = connect.s3(db, serviceConfig.s3)
    await remote.ready
    /** @type {Doc} */
    const doc = { _id: 'hello', value: 'world' }
    const ok = await db.put(doc)
    equals(ok.id, 'hello')
  })// .timeout(10000)
  it('should save a remote header', async function () {
    const { _crdt: { blocks: { loader } } } = db
    const gotMain = await loader.remoteMetaStore.load('main')
    assert(gotMain)
    equals(gotMain.key, loader.key)
  }).timeout(10000)
  it('should get', async function () {
    const doc = await db.get('hello')
    assert(doc)
    equals(doc._id, 'hello')
    equals(doc.value, 'world')
  }).timeout(10000)
  it('should get remote', async function () {
    await resetDirectory(MetaStore.dataDir, dbName)
    const db2 = new Database(dbName)
    const remote = connect.s3(db2, serviceConfig.s3)
    await remote.ready
    const { _crdt: { blocks: { loader: loader2 } } } = db2
    await loader2.ready
    const gotMain = await loader2.remoteMetaStore.load('main')
    equals(gotMain.key, loader2.key) // fails when remote not ingested

    const doc = await db2.get('hello')

    assert(doc)
    equals(doc._id, 'hello')
    equals(doc.value, 'world')
  }).timeout(10000)
})

describe('basic Connection with raw remote', function () {
  /** @type {Database} */
  let db, dbName
  beforeEach(async function () {
    dbName = 'test-raw-connect'
    await resetDirectory(MetaStore.dataDir, dbName)
    mockStore.clear()
    db = new Database(dbName)
    const remote = connect.raw(db, mockConnect)
    await remote.ready
    /** @type {Doc} */
    const doc = { _id: 'hello', value: 'world' }
    const ok = await db.put(doc)
    equals(ok.id, 'hello')
  })// .timeout(10000)
  it('should save a remote header', async function () {
    const { _crdt: { blocks: { loader } } } = db
    const gotMain = await loader.remoteMetaStore.load('main')
    assert(gotMain)
    equals(gotMain.key, loader.key)
  }).timeout(10000)
  it('should have a carLog', async function () {
    const { _crdt: { blocks: { loader } } } = db
    assert(loader.carLog)
    equals(loader.carLog.length, 1)
  }).timeout(10000)
  it('should get', async function () {
    const doc = await db.get('hello')
    assert(doc)
    equals(doc._id, 'hello')
    equals(doc.value, 'world')
  }).timeout(10000)
  it('should get remote', async function () {
    await resetDirectory(MetaStore.dataDir, dbName)
    const db2 = new Database(dbName)
    const remote = connect.raw(db2, mockConnect)
    await remote.ready
    const { _crdt: { blocks: { loader: loader2 } } } = db2
    await loader2.ready
    const gotMain = await loader2.remoteMetaStore.load('main')
    equals(gotMain.key, loader2.key) // fails when remote not ingested

    const doc = await db2.get('hello')

    assert(doc)
    equals(doc._id, 'hello')
    equals(doc.value, 'world')
  }).timeout(10000)
  it('should be ok with a remote that has headers but not car files', async function () {
    // create a database that is up to date with meta1 but not meta2
    // add meta2 and poll it

    let count = 0
    const download = async function ({ type, name, car, branch }) {
      if (car) {
        count++
        if (count) return
      }
      const key = new URLSearchParams({ type, name, car, branch }).toString()
      return mockStore.get(key)
    }
    const badMockConnect = { ...mockConnect, download }

    const db2 = new Database(dbName)
    const connection = connect.raw(db2, badMockConnect)
    await connection.ready

    const changes = await db2.changes()
    equals(changes.rows.length, 1)

    const doc2 = { _id: 'hi', value: 'team' }
    const ok2 = await db.put(doc2)
    equals(ok2.id, 'hi')
    await resetDirectory(MetaStore.dataDir, dbName)

    const did = await connection.refresh().catch(e => e)
    assert(did)
    matches(did.message, /missing remote/)

    const changes2 = await db2.changes()
    equals(changes2.rows.length, 1)

    const { _crdt: { blocks: { loader } } } = db2

    assert(loader)
    equals(loader.carLog.length, 1)
    assert(loader.ready.then)

    // heal with good connection
    const connection2 = connect.raw(db2, mockConnect)
    await connection2.ready
    assert(connection2.refresh)

    await connection2.refresh()

    const changes3 = await db2.changes()
    equals(changes3.rows.length, 2)
  })
})

describe('forked Connection with raw remote', function () {
  /** @type {Database} */
  let db, dbName
  beforeEach(async function () {
    dbName = 'test-raw-forked'
    await resetDirectory(MetaStore.dataDir, dbName)
    mockStore.clear()
    db = new Database(dbName)
    const remote = connect.raw(db, mockConnect)
    await remote.ready
    /** @type {Doc} */
    const doc = { _id: 'hello', value: 'world' }
    const ok = await db.put(doc)
    equals(ok.id, 'hello')
  })// .timeout(10000)
  it('should save a remote header', async function () {
    const { _crdt: { blocks: { loader } } } = db
    const gotMain = await loader.remoteMetaStore.load('main')
    assert(gotMain)
    equals(gotMain.key, loader.key)
  }).timeout(10000)
  it('should get', async function () {
    const doc = await db.get('hello')
    assert(doc)
    equals(doc._id, 'hello')
    equals(doc.value, 'world')
  }).timeout(10000)
  it('should get remote fork', async function () {
    // await resetDirectory(MetaStore.dataDir, dbName)

    const db2 = new Database(dbName)

    const doc = await db2.get('hello')
    assert(doc)
    equals(doc._id, 'hello')
    equals(doc.value, 'world')

    // db is still connected to mockConnect
    await db.put({ _id: 'greetings', value: 'universe' })

    const remote = connect.raw(db2, mockConnect)
    await remote.ready
    const { _crdt: { blocks: { loader: loader2 } } } = db2
    const gotMain = await loader2.remoteMetaStore.load('main')
    equals(gotMain.key, loader2.key) // fails when remote not ingested

    const doc2 = await db2.get('greetings')
    equals(doc2.value, 'universe')
    // equals(db2._crdt.clock.head.length, 2)

    const ok3 = await db2.put({ _id: 'hey', value: 'partyverse' })
    equals(ok3.id, 'hey')
    equals(db2._crdt.clock.head.length, 1)

    // open a the db again from files
    const db3 = new Database(dbName)
    const doc3 = await db3.get('hey')
    equals(doc3.value, 'partyverse')
    const doc4 = await db3.get('greetings')
    equals(doc4.value, 'universe')

    // reset files and open again
    await resetDirectory(MetaStore.dataDir, dbName)
    const db4 = new Database(dbName)
    const remote4 = connect.raw(db4, mockConnect)
    await remote4.ready
    const changes = await db4.changes()
    equals(changes.rows.length, 3)
  }).timeout(10000)
})

describe('two Connection with raw remote', function () {
  /** @type {Database} */
  let db, dbName

  // this test won't test the forking anymore once we
  // move away from default behavior of:
  // on connect, pull remote once
  // on connected put, push to remote.
  // basically as soon as we have continuous pull, we need to rethink this test.
  // the goal is to test that when you merge a remote head that has a fork
  // you get the correct outcome (both forks are merged)

  // the test should be:
  // make database A
  // connect A to the remote R
  // create doc 1
  // snap meta 1
  // create doc 2
  // snap meta 2
  // rollback to meta 1
  // make database A2 (same name)
  // connect A2 to the remote R
  // create doc 3
  // snap meta 3
  // rollback to meta 2
  // make database A3 (same name)

  let metaPath
  beforeEach(async function () {
    dbName = 'test-connection-raw'
    metaPath = join(MetaStore.dataDir, dbName, 'meta', 'main.json')
    await resetDirectory(MetaStore.dataDir, dbName)
    mockStore.clear()
    db = new Database(dbName)
    const remote = connect.raw(db, mockConnect)
    await remote.ready
    /** @type {Doc} */
    const doc = { _id: 'hello', value: 'world' }
    const ok = await db.put(doc)
    equals(ok.id, 'hello')
    assert(MetaStore.dataDir)

    const meta1 = await readFile(metaPath)
    equalsJSON(Object.keys(JSON.parse(meta1.toString())), ['car', 'key'])

    // await writeFile(metaPath, meta1)

    const db2 = new Database(dbName)

    const remote2 = connect.raw(db2, mockConnect)

    await remote2.ready
    // await db2._crdt.ready

    const doc2 = { _id: 'hi', value: 'folks' }
    const ok2 = await db.put(doc2)
    equals(ok2.id, 'hi')
    const hi = await db.get(ok2.id)
    equals(hi.value, 'folks')

    const changes1 = await db.changes()
    equals(changes1.rows.length, 2)

    const meta2 = await readFile(metaPath)
    equalsJSON(Object.keys(JSON.parse(meta2.toString())), ['car', 'key'])
    notEquals(meta1.toString(), meta2.toString())

    await db2._crdt.blocks.loader.ready

    const docHello = await db2.get('hello')
    equals(docHello.value, 'world')

    const docHi = await db2.get('hi').catch(e => e)
    matches(docHi.message, /Missing/)

    const doc3 = { _id: 'hey', value: 'partyverse' }

    assert(db2._crdt.blocks.loader)
    assert(db2._crdt.blocks.loader.carLog)
    equals(db2._crdt.blocks.loader.carLog.length, 1)

    // this is intermittent, why?
    const ok3 = await db2.put(doc3)
    equals(ok3.id, 'hey')
    equals(db2._crdt.clock.head.length, 1)
    equalsJSON(db2._crdt.clock.head, ok3.clock)

    const hey = await db2.get('hey')
    equals(hey.value, 'partyverse')

    const changes2 = await db2.changes()

    equals(changes2.rows.length, 2)

    const meta3 = await readFile(metaPath)
    equalsJSON(Object.keys(JSON.parse(meta3.toString())), ['car', 'key'])
    notEquals(meta2.toString(), meta3.toString())
    notEquals(meta1.toString(), meta3.toString())

    await writeFile(metaPath, meta2)
    const db3 = new Database(dbName)
    await db3._crdt.ready
    assert(db3._crdt.blocks.loader)
    assert(db3._crdt.blocks.loader.carLog)
    equals(db3._crdt.blocks.loader.carLog.length, 2)

    const changes25 = await db3.changes()
    equals(changes25.rows.length, 2)

    equalsJSON(db3._crdt.clock.head, changes25.clock)

    const remote3 = connect.raw(db3, mockConnect)
    await remote3.ready
    // await db3._crdt.blocks.loader.ready
    // await db3._crdt.ready

    // equalsJSON(db3._crdt.clock.head, ok3.clock)
    equals(db3._crdt.clock.head.length, 2)

    const hey3 = await db3.get('hey')
    equals(hey3.value, 'partyverse')

    const docHello3 = await db3.get('hello')
    equals(docHello3.value, 'world')

    // const docHi3 = await db3.get('hi')
    // equals(docHi3.value, 'world')

    const changes3 = await db3.changes()

    equals(changes3.rows.length, 3)
  })// .timeout(10000)
  it('should save a remote header', async function () {
    const { _crdt: { blocks: { loader } } } = db
    const gotMain = await loader.remoteMetaStore.load('main')
    assert(gotMain)
    equals(gotMain.key, loader.key)
  }).timeout(10000)
  it('continues to execute queries', async function () {
    // await resetDirectory(MetaStore.dataDir, dbName)

    const db2 = new Database(dbName)

    const doc = await db2.get('hello')
    assert(doc)
    equals(doc._id, 'hello')
    equals(doc.value, 'world')

    // db is still connected to mockConnect
    await db.put({ _id: 'greetings', value: 'universe' })

    const remote = connect.raw(db2, mockConnect)
    await remote.ready
    const { _crdt: { blocks: { loader: loader2 } } } = db2
    const gotMain = await loader2.remoteMetaStore.load('main')
    equals(gotMain.key, loader2.key) // fails when remote not ingested

    const doc2 = await db2.get('greetings')
    equals(doc2.value, 'universe')
    // equals(db2._crdt.clock.head.length, 2)

    const ok3 = await db2.put({ _id: 'hey', value: 'partyverse' })
    equals(ok3.id, 'hey')
    equals(db2._crdt.clock.head.length, 1)

    // open a the db again from files
    const db3 = new Database(dbName)
    const doc3 = await db3.get('hey')
    equals(doc3.value, 'partyverse')
    const doc4 = await db3.get('greetings')
    equals(doc4.value, 'universe')

    // reset files and open again
    await resetDirectory(MetaStore.dataDir, dbName)
    const db4 = new Database(dbName)
    const remote4 = connect.raw(db4, mockConnect)
    await remote4.ready
    const changes = await db4.changes()
    equals(changes.rows.length, 4)
  }).timeout(10000)
})
