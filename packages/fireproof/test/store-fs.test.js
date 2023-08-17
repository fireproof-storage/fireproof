/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable mocha/max-top-level-suites */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { join } from 'path'
import { promises } from 'fs'

import { CID } from 'multiformats'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { assert, matches, equals } from './helpers.js'

import { CarStore, testConfig, HeaderStore } from '../dist/test/store-fs.esm.js'

const { readFile } = promises

const decoder = new TextDecoder('utf-8')

describe('CarStore', function () {
  /** @type {CarStore} */
  let store
  beforeEach(function () {
    store = new CarStore('test')
  })
  it('should have a name', function () {
    equals(store.name, 'test')
  })
  it('should save a car', async function () {
    const car = {
      cid: 'cid',
      bytes: new Uint8Array([55, 56, 57])
    }
    await store.save(car)
    const path = join(testConfig.dataDir, store.name, car.cid + '.car')
    const data = await readFile(path)
    equals(data.toString(), decoder.decode(car.bytes))
  })
})

describe('CarStore with a saved car', function () {
  /** @type {CarStore} */
  let store, car
  beforeEach(async function () {
    store = new CarStore('test2')
    car = {
      cid: 'cid',
      bytes: new Uint8Array([55, 56, 57, 80])
    }
    await store.save(car)
  })
  it('should have a car', async function () {
    const path = join(testConfig.dataDir, store.name, car.cid + '.car')
    const data = await readFile(path)
    equals(data.toString(), decoder.decode(car.bytes))
  })
  it('should load a car', async function () {
    const loaded = await store.load(car.cid)
    equals(loaded.cid, car.cid)
    equals(loaded.bytes.constructor.name, 'Uint8Array')
    equals(loaded.bytes.toString(), car.bytes.toString())
  })
  it('should remove a car', async function () {
    await store.remove(car.cid)
    const error = await store.load(car.cid).catch(e => e)
    matches(error.message, 'ENOENT')
  })
})

describe('HeaderStore', function () {
  /** @type {HeaderStore} */
  let store
  beforeEach(function () {
    store = new HeaderStore('test')
  })
  it('should have a name', function () {
    equals(store.name, 'test')
  })
  it('should save a header', async function () {
    const cid = CID.parse('bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4')
    const h = {
      car: cid,
      key: null
    }
    await store.save(h)
    const path = join(testConfig.dataDir, store.name, 'main.json')
    const file = await readFile(path)
    const header = JSON.parse(file.toString())
    assert(header)
    assert(header.car)
    equals(header.car['/'], cid.toString())
  })
})

describe('HeaderStore with a saved header', function () {
  /** @type {HeaderStore} */
  let store, cid
  beforeEach(async function () {
    store = new HeaderStore('test-saved-header')
    cid = CID.parse('bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4')
    await store.save({ car: cid, key: null })
  })
  it('should have a header', async function () {
    const path = join(testConfig.dataDir, store.name, 'main.json')
    const data = await readFile(path)
    matches(data, /car/)
    const header = JSON.parse(data.toString())
    assert(header)
    assert(header.car)
    equals(header.car['/'], cid.toString())
  })
  it('should load a header', async function () {
    const loaded = await store.load()
    assert(loaded)
    // console.log(loaded)
    assert(loaded.car)
    equals(loaded.car.toString(), cid.toString())
  })
})
