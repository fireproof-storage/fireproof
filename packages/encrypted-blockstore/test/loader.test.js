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
import {
  assert,
  matches,
  equals,
  resetDirectory,
  notEquals,
  dataDir
} from '../../fireproof/test/helpers.js'

import { parseCarFile } from '../dist/test/loader-helpers.js'

import { Loader } from '../dist/test/loader.js'
// import { CRDT } from '../../fireproof/dist/test/crdt.esm.js'
import { CarTransaction, EncryptedBlockstore } from '../dist/test/transaction.js'

import { MemoryBlockstore } from '@alanshaw/pail/block'

import * as nodeCrypto from '../dist/lib/crypto-node.js'
import * as nodeStore from '../dist/lib/store-node.js'

// const randomBytes = size => {
//   throw new Error('randomBytes not implemented')
// }

const loaderOpts = {
  store: nodeStore,
  crypto: nodeCrypto
}

const indexLoaderOpts = {
  store: nodeStore,
  crypto: nodeCrypto
}

describe('basic Loader', function () {
  let loader, block, t

  beforeEach(async function () {
    await resetDirectory(dataDir, 'test-loader-commit')
    const mockM = new MemoryBlockstore()
    mockM.transactions = new Set()
    t = new CarTransaction(mockM)
    loader = new Loader('test-loader-commit', { ...loaderOpts,  public: true })
    block = await encode({
      value: { hello: 'world' },
      hasher,
      codec
    })
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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

describe('basic Loader with two commits', function () {
  let loader, block, block2, block3, block4, t, carCid, carCid0

  beforeEach(async function () {
    await resetDirectory(dataDir, 'test-loader-two-commit')
    const mockM = new MemoryBlockstore()
    mockM.transactions = new Set()
    t = new CarTransaction(mockM)
    loader = new Loader('test-loader-two-commit', { ...loaderOpts, public: true })
    block = await encode({
      value: { hello: 'world' },
      hasher,
      codec
    })
    await t.put(block.cid, block.bytes)
    carCid0 = await loader.commit(t, { head: [block.cid] })

    block2 = await encode({
      value: { hello: 'universe' },
      hasher,
      codec
    })

    await t.put(block2.cid, block2.bytes)
    carCid = await loader.commit(t, { head: [block2.cid] })

    block3 = await encode({
      value: { hello: 'multiverse' },
      hasher,
      codec
    })

    await t.put(block3.cid, block3.bytes)

    block4 = await encode({
      value: { hello: 'megaverse' },
      hasher,
      codec
    })

    await t.put(block4.cid, block4.bytes)
  })

  it('should have a car log', function () {
    equals(loader.carLog.length, 2)
    equals(loader.carLog[0].toString(), carCid.toString())
    equals(loader.carLog[1].toString(), carCid0.toString())
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
    equals(loader.carLog.length, 1)
    await loader.commit(t, { head: [block3.cid] }, { compact: false })
    equals(loader.carLog.length, 2)
    assert(await loader.carStore.load(carCid))
    await loader.commit(t, { head: [block3.cid] }, { compact: true })
    equals(loader.carLog.length, 1)
    assert(await loader.carStore.load(carCid))
    await loader.commit(t, { head: [block4.cid] }, { compact: false })
    equals(loader.carLog.length, 2)

    const e = await loader.loadCar(carCid).catch(e => e)
    assert(e)
    matches(e.message, 'missing car file')
  }, { timeout: 10000 })
})

describe('basic Loader with index commits', function () {
  let block, ib, indexerResult, cid, indexMap

  beforeEach(async function () {
    await resetDirectory(dataDir, 'test-loader-index')
    // t = new CarTransaction()
    ib = new EncryptedBlockstore({...indexLoaderOpts, name: 'test-loader-index'})
    block = await encode({
      value: { hello: 'world' },
      hasher,
      codec
    })

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
    const { car: carCid } = await ib.transaction(async t => {
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
