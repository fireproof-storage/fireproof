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
import { type } from 'os'
const { readFile, writeFile } = fs

const mockStore = new Map()
const mockConnect = {
  metaUpload: async function (bytes, { name, branch }) {
    const key = new URLSearchParams({ name, branch }).toString()
    mockStore.set(key, bytes)
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  dataUpload: async function (bytes, { type, name, car }) {
    const key = new URLSearchParams({ type, name, car }).toString()
    mockStore.set(key, bytes)
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  metaDownload: async function ({ name, branch }) {
    const key = new URLSearchParams({ name, branch }).toString()
    if (!mockStore.has(key)) return null
    return [mockStore.get(key)]
  },
  dataDownload: async function ({ type, name, car }) {
    const key = new URLSearchParams({ type, name, car }).toString()
    return mockStore.get(key)
  }
}

describe('connect ipfs', function () {
  /** @type {Database} */
  let cx, db, dbName
  beforeEach(async function () {
    dbName = 'test-raw-connect'
    await resetDirectory(MetaStore.dataDir, dbName)
    mockStore.clear()
    db = new Database(dbName)
    cx = connect.ipfs(db, 'my-schema')
  })
  it('should have an awaitable connecting', function () {
    assert(cx)
    assert(cx.connecting)
    assert.equal(typeof cx.connecting.then, 'function')
  })
  it('should have an awaitable authorizing', function () {
    assert(cx)
    assert(cx.authorizing)
  })
  it('should set authorized on connect', async function () {
    await cx.connecting
    assert.notEqual(cx.authorized, null)
  })
})
