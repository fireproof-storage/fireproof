/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable mocha/max-top-level-suites */

import * as codec from '@ipld/dag-cbor'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import { encode } from 'multiformats/block'
import { CID } from 'multiformats/cid'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { assert, matches, equals, resetDirectory, notEquals } from './helpers.js'

import { parseCarFile } from '../dist/test/loader-helpers.esm.js'

import { Loader } from '../dist/test/loader.esm.js'
import { CRDT } from '../dist/test/crdt.esm.js'
import { Transaction, FireproofBlockstore } from '../dist/test/transaction.esm.js'

import { testConfig } from '../dist/test/store-fs.esm.js'
import { MemoryBlockstore } from '@alanshaw/pail/block'

const loaderOpts = { 
  makeCarHeaderCustomizer : (result) => { 
    const { head } = result
      return { head }
   }
 }

const indexLoaderOpts = {
  makeCarHeaderCustomizer : (result) => {
    // console.log('makeCarHeaderCustomizer', result)
    const name = result.name
    const indexes = new Map()
    indexes.set(name, result)
    // const { indexes } = result
    return { indexes }
  }
}  

describe('basic Loader', function () {
  let loader, block, t
  beforeEach(async function () {
    await resetDirectory(testConfig.dataDir, 'test-loader-commit')
    const mockM= new MemoryBlockstore()
    mockM.transactions = new Set()
    t = new Transaction(mockM)
    loader = new Loader('test-loader-commit', loaderOpts, { public: true })
    block = (await encode({
      value: { hello: 'world' },
      hasher,
      codec
    }))
    await t.put(block.cid, block.bytes)
  })
  it('should have an empty car log', function () {
    equals(loader.carLog.length, 0)
  })
  it('should commit', async function () {
    const carCid = await loader.commit(t, { head: [block.cid] })
    equals(loader.carLog.length, 1)
    const reader = await loader.loadCar(carCid)
    assert(reader)
    const parsed = await parseCarFile(reader)
    assert(parsed.cars)
    equals(parsed.cars.length, 0)
    assert(parsed.meta)
    assert(parsed.meta.head)
  })
})

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

describe('basic Loader with two commits', function () {
  let loader, block, block2, block3, block4, t, carCid
  beforeEach(async function () {
    await resetDirectory(testConfig.dataDir, 'test-loader-two-commit')
    const mockM= new MemoryBlockstore()
    mockM.transactions = new Set()
    t = new Transaction(mockM)
    loader = new Loader('test-loader-two-commit', loaderOpts, { public: true })
    block = (await encode({
      value: { hello: 'world' },
      hasher,
      codec
    }))
    await t.put(block.cid, block.bytes)
    await loader.commit(t, { head: [block.cid] })

    block2 = (await encode({
      value: { hello: 'universe' },
      hasher,
      codec
    }))

    await t.put(block2.cid, block2.bytes)
    carCid = await loader.commit(t, { head: [block2.cid] })

    block3 = (await encode({
      value: { hello: 'multiverse' },
      hasher,
      codec
    }))

    await t.put(block3.cid, block3.bytes)

    block4 = (await encode({
      value: { hello: 'megaverse' },
      hasher,
      codec
    }))

    await t.put(block4.cid, block4.bytes)

  })
  it('should have a car log', function () {
    equals(loader.carLog.length, 2)
  })
  it('should commit', async function () {
    const reader = await loader.loadCar(carCid)
    assert(reader)
    const parsed = await parseCarFile(reader)
    assert(parsed.cars)
    equals(parsed.compact.length, 0)
    equals(parsed.cars.length, 1)
    assert(parsed.meta)
    assert(parsed.meta.head)
  })
  it('should compact', async function () {
    const compactCid = await loader.commit(t, { head: [block2.cid] }, { compact: true })
    equals(loader.carLog.length, 1)

    const reader = await loader.loadCar(compactCid)
    assert(reader)
    const parsed = await parseCarFile(reader)
    assert(parsed.cars)
    equals(parsed.compact.length, 2)
    equals(parsed.cars.length, 0)
    assert(parsed.meta)
    assert(parsed.meta.head)
  })
  it('compact should erase old files', async function () {
    await loader.commit(t, { head: [block2.cid] }, { compact: true })
    await loader.commit(t, { head: [block3.cid] }, { compact: false })
    await loader.commit(t, { head: [block3.cid] }, { compact: true })
    await loader.commit(t, { head: [block4.cid] }, { compact: false })
    await loader.commit(t, { head: [block4.cid] }, { compact: true })

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    const e = await loader.loadCar(carCid).catch(e => e)
    assert(e)
    matches(e.message, 'missing car file')
  }).timeout(10000)
})

describe('Loader with a committed transaction', function () {
  /** @type {Loader} */
  let loader, blockstore, crdt, done
  const dbname = 'test-loader'
  beforeEach(async function () {
    await resetDirectory(testConfig.dataDir, 'test-loader')
    crdt = new CRDT(dbname)
    blockstore = crdt.blocks
    loader = blockstore.loader
    done = await crdt.bulk([{ key: 'foo', value: { foo: 'bar' } }])
  })
  it('should have a name', function () {
    equals(loader.name, dbname)
  })
  it('should commit a transaction', function () {
    assert(done.head)
    assert(done.car)
    equals(loader.carLog.length, 1)
  })
  it('can load the car', async function () {
    const reader = await loader.loadCar(done.car)
    assert(reader)
    const parsed = await parseCarFile(reader)
    assert(parsed.cars)
    equals(parsed.cars.length, 0)
    assert(parsed.meta)
    assert(parsed.meta.head)
  })
})

describe('Loader with two committed transactions', function () {
  /** @type {Loader} */
  let loader, crdt, blockstore, done1, done2
  const dbname = 'test-loader'
  beforeEach(async function () {
    await resetDirectory(testConfig.dataDir, 'test-loader')
    crdt = new CRDT(dbname)
    blockstore = crdt.blocks
    loader = blockstore.loader
    done1 = await crdt.bulk([{ key: 'apple', value: { foo: 'bar' } }])
    done2 = await crdt.bulk([{ key: 'orange', value: { foo: 'bar' } }])
  })
  it('should commit two transactions', function () {
    assert(done1.head)
    assert(done1.car)
    assert(done2.head)
    assert(done2.car)
    notEquals(done1.head, done2.head)
    notEquals(done1.car, done2.car)
    equals(blockstore.transactions.size, 2)
    equals(loader.carLog.length, 2)
    equals(loader.carLog.indexOf(done1.car), 1)
    equals(loader.carLog.indexOf(done2.car), 0)
  })
  it('can load the car', async function () {
    const reader = await loader.loadCar(done2.car)
    assert(reader)
    const parsed = await parseCarFile(reader)
    assert(parsed.cars)
    equals(parsed.cars.length, 1)
    assert(parsed.meta)
    assert(parsed.meta.head)
  })
})

describe('Loader with many committed transactions', function () {
  /** @type {Loader} */
  let loader, blockstore, crdt, dones
  const dbname = 'test-loader'
  const count = 10
  beforeEach(async function () {
    await resetDirectory(testConfig.dataDir, 'test-loader')
    // loader = new DbLoader(dbname)
    crdt = new CRDT(dbname)
    blockstore = crdt.blocks
    loader = blockstore.loader
    dones = []
    for (let i = 0; i < count; i++) {
      const did = await crdt.bulk([{ key: `apple${i}`, value: { foo: 'bar' } }])
      dones.push(did)
    }
  })
  it('should commit many transactions', function () {
    for (const done of dones) {
      assert(done.head)
      assert(done.car)
    }
    equals(blockstore.transactions.size, count)
    equals(loader.carLog.length, count)
  })
  it('can load the car', async function () {
    assert(dones[5].car)
    const reader = await loader.loadCar(dones[5].car)
    assert(reader)
    const parsed = await parseCarFile(reader)
    assert(parsed.cars)
    equals(parsed.cars.length, 5)
    assert(parsed.meta)
    assert(parsed.meta.head)
  })
})

describe('basic Loader with index commits', function () {
  let block, ib, indexerResult, cid, indexMap
  beforeEach(async function () {
    await resetDirectory(testConfig.dataDir, 'test-loader-index')
    // t = new Transaction()
    ib = new FireproofBlockstore('test-loader-index', indexLoaderOpts, {})
    // loader = new IdxLoader('test-loader-index', { indexers: new Map() }, { public: true })
    block = (await encode({
      value: { hello: 'world' },
      hasher,
      codec
    }))

    cid = CID.parse('bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4')
    indexerResult = {
      indexes: {
        hello: {
          byId: cid,
          byKey: cid,
          head: [cid],
          name: 'hello',
          map: '(doc) => doc.hello'
        }
      }
    }
    indexMap = new Map()
  })
  it('should start with an empty car log', function () {
    equals(ib.loader.carLog.length, 0)
  })
  it('should commit the index metadata', async function () {
    const { car: carCid } = await ib.transaction(async (t) => {
      await t.put(block.cid, block.bytes)
      return indexerResult
    }, indexMap)

    const carLog = ib.loader.carLog

    equals(carLog.length, 1)
    const reader = await ib.loader.loadCar(carCid)
    assert(reader)
    const parsed = await parseCarFile(reader)
    assert(parsed.cars)
    equals(parsed.cars.length, 0)
    assert(parsed.meta)
    assert(parsed.meta.indexes)
    const indexes = parsed.meta.indexes
    assert(indexes)
    assert(indexes.hello)
    equals(indexes.hello.map, '(doc) => doc.hello')
    equals(indexes.hello.name, 'hello')
  })
})
