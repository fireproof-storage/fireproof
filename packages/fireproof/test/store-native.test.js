// TODO: This test won't work unless we also bundle React Native into the files generated for tests.
//  Of course, for lib releases, we want to make RN external.
//
//  We could:
//  1. patch `esbuild` to handle Facebook Flow annotations
//  2. try the `esbuild-plugin-flow` to strip them out
//
//  The second (Plugin) option probably has more work a la `react-native-esbuild` or similar projects

/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable mocha/max-top-level-suites */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { join } from 'path'
// import { promises } from 'fs'

import { CID } from 'multiformats'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { assert, matches, equals } from './helpers.js'

import { DataStore, MetaStore } from '../dist/test/store-native.esm.js'

// const { readFile } = promises

// const decoder = new TextDecoder('utf-8')

describe('DataStore', function () {
  /** @type {DataStore} */
  let store
  beforeEach(function () {
    store = new DataStore({ name: 'test', keyId: 'keyyyy' })
  })
  it('should have a name', function () {
    equals(store.loader.name, 'test')
  })
  it('should save a car', async function () {
    const car = {
      cid: 'cid',
      bytes: new Uint8Array([55, 56, 57])
    }
    await store.save(car)
    const path = join(DataStore.dataDir, store.loader.name, 'data', car.cid + '.car')

    console.log({path, car});
    // const data = await readFile(path)
    // equals(data.toString(), decoder.decode(car.bytes))
  })
})

describe('DataStore with a saved car', function () {
  /** @type {DataStore} */
  let store, car
  beforeEach(async function () {
    store = new DataStore({ name: 'test2', keyId: 'keyyyy' })
    car = {
      cid: 'cid',
      bytes: new Uint8Array([55, 56, 57, 80])
    }
    await store.save(car)
  })
  it('should have a car', async function () {
    const path = join(DataStore.dataDir, store.loader.name, 'data', car.cid + '.car')

    console.log({path, car});
    // const data = await readFile(path)
    // equals(data.toString(), decoder.decode(car.bytes))
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

describe('MetaStore', function () {
  /** @type {MetaStore} */
  let store
  beforeEach(function () {
    store = new MetaStore('test')
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
    const path = join(".", store.name, 'meta', 'main.json')

    console.log({path, cid});
    // const file = await readFile(path)
    // const header = JSON.parse(file.toString())
    // assert(header)
    // assert(header.car)
    // equals(header.car['/'], cid.toString())
  })
})

describe('MetaStore with a saved header', function () {
  /** @type {MetaStore} */
  let store, cid
  beforeEach(async function () {
    store = new MetaStore('test-saved-header')
    cid = CID.parse('bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4')
    await store.save({ car: cid, key: null })
  })
  it('should have a header', async function () {
    const path = join(".", store.name, 'meta', 'main.json')
    const data = await readFile(path)
    matches(data, /car/)
    const header = JSON.parse(data.toString())
    assert(header)
    assert(header.car)
    equals(header.car['/'], cid.toString())
  })
  it('should load a header', async function () {
    const loadeds = await store.load()
    const loaded = loadeds[0]
    assert(loaded)
    assert(loaded.car)
    equals(loaded.car.toString(), cid.toString())
  })
})
