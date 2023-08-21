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

describe('basic Connection with s3 remote', function () {
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
    // const expectedHeader = `/meta/test-s3/hello.json`
    const gotMain = await loader.remoteMetaStore.load('main')
    console.log('gotMain', gotMain)
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
    console.log('reset------------------')
    await resetDirectory(MetaStore.dataDir, dbName)
    const db2 = new Database(dbName)
    const remote = connect.s3(db2, serviceConfig.s3)
    await remote.ready
    const { _crdt: { blocks: { loader: loader2 } } } = db2
    const gotMain = await loader2.remoteMetaStore.load('main')
    equals(gotMain.key, loader2.key)

    const doc = await db2.get('hello')

    assert(doc)
    equals(doc._id, 'hello')
    equals(doc.value, 'world')
  }).timeout(10000)
})
