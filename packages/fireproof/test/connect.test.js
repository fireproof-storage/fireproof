/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable mocha/max-top-level-suites */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { assert, equals, notEquals, matches, resetDirectory } from './helpers.js'
import { Database } from '../dist/test/database.esm.js'
import { connect } from '../dist/test/connect.esm.js'
// import { Doc } from '../dist/test/types.d.esm.js'
import { MetaStore } from '../dist/test/store-fs.esm.js'

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
    // console.log('upload', key)
    mockStore.set(key, bytes)
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  download: async function ({ type, name, car, branch }) {
    const key = new URLSearchParams({ type, name, car, branch }).toString()
    // console.log('download', key)
    return mockStore.get(key)
  }
}

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
    dbName = 'test-s3-' + Math.ceil(Math.random() * 100000)
    db = new Database(dbName)
    mockStore.clear()
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
})

describe('forked Connection with raw remote', function () {
  /** @type {Database} */
  let db, dbName
  beforeEach(async function () {
    dbName = 'test-s3-' + Math.ceil(Math.random() * 100000)
    db = new Database(dbName)
    mockStore.clear()
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
    equals(db2._crdt.clock.head.length, 2)

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
