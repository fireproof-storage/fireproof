/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable mocha/max-top-level-suites */
import { CID } from 'multiformats'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { assert, equals, notEquals, matches, equalsJSON } from '../../fireproof/test/helpers.js'
import { EncryptedBlockstore as Blockstore, CarTransaction } from '../dist/test/transaction.esm.js'

import * as nodeCrypto from '../dist/test/crypto-node.esm.js'

import * as nodeStore from '../dist/test/store-node.esm.js'


const loaderOpts = {
  store : nodeStore,
  crypto: nodeCrypto
}

describe('Fresh TransactionBlockstore', function () {
  /** @type {Blockstore} */
  let blocks
  beforeEach(function () {
    blocks = new Blockstore(loaderOpts)
  })
  it('should not have a name', function () {
    assert(!blocks.name)
  })
  it('should not have a loader', function () {
    assert(!blocks._loader)
  })
  it('should not put', async function () {
    const e = await blocks.put('key', 'value').catch(e => e)
    matches(e.message, /transaction/)
  })
  it('should yield a transaction', async function () {
    const txR = await blocks.transaction((tblocks) => {
      assert(tblocks)
      assert(tblocks instanceof CarTransaction)
      return { head: [] }
    })
    assert(txR)
    equalsJSON(txR, { head: [] })
  })
})

describe('TransactionBlockstore with name', function () {
  /** @type {Blockstore} */
  let blocks
  beforeEach(function () {
    blocks = new Blockstore({name:'test', ...loaderOpts})
  })
  it('should have a name', function () {
    equals(blocks.name, 'test')
  })
  it('should have a loader', function () {
    assert(blocks.loader)
  })
  it('should get from loader', async function () {
    blocks.loader.getBlock = async (cid) => {
      return { cid, bytes: 'bytes' }
    }
    const value = await blocks.get('key')
    equalsJSON(value, { cid: 'key', bytes: 'bytes' })
  })
})

describe('A transaction', function () {
  /** @type {CarTransaction} */
  let tblocks, blocks
  beforeEach(async function () {
    blocks = new Blockstore(loaderOpts)
    tblocks = new CarTransaction(blocks)
    blocks.transactions.add(tblocks)
  })
  it('should put and get', async function () {
    const cid = CID.parse('bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4')

    await tblocks.put(cid, 'bytes')
    assert(blocks.transactions.has(tblocks))
    const got = await tblocks.get(cid)
    assert(got)
    equals(got.cid, cid)
    equals(got.bytes, 'bytes')
  })
})

describe('TransactionBlockstore with a completed transaction', function () {
  let blocks, cid, cid2

  beforeEach(async function () {
    cid = CID.parse('bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4')
    cid2 = CID.parse('bafybeibgouhn5ktecpjuovt52zamzvm4dlve5ak7x6d5smms3itkhplnhm')

    blocks = new Blockstore(loaderOpts)
    await blocks.transaction(async (tblocks) => {
      await tblocks.put(cid, 'value')
      return await tblocks.put(cid2, 'value2')
    })
    await blocks.transaction(async (tblocks) => {
      await tblocks.put(cid, 'value')
      return await tblocks.put(cid2, 'value2')
    })
  })
  it('should have transactions', async function () {
    const ts = blocks.transactions
    equals(ts.size, 2)
  })
  it('should get', async function () {
    const value = await blocks.get(cid)
    equals(value.cid, cid)
    equals(value.bytes, 'value')

    const value2 = await blocks.get(cid2)
    equals(value2.bytes, 'value2')
  })
  it('should yield entries', async function () {
    const blz = []
    for await (const blk of blocks.entries()) {
      blz.push(blk)
    }
    equals(blz.length, 2)
  })
})

// test compact 