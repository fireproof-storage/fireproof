/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable mocha/max-top-level-suites */
import { CID } from 'multiformats'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { assert, equals, notEquals, matches, equalsJSON } from './helpers.js'
import { TransactionBlockstore as Blockstore, Transaction } from '../dist/test/transaction.esm.js'

describe('Fresh TransactionBlockstore', function () {
  /** @type {Blockstore} */
  let blocks
  beforeEach(function () {
    blocks = new Blockstore()
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
      assert(tblocks instanceof Transaction)
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
    blocks = new Blockstore('test')
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
  /** @type {Transaction} */
  let tblocks, blocks
  beforeEach(async function () {
    blocks = new Blockstore()
    tblocks = new Transaction(blocks)
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

    blocks = new Blockstore()
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
  it('should compact', async function () {
    const compactT = new Transaction(blocks)
    await compactT.put(cid2, 'valueX')
    await blocks.commitCompaction(compactT)
    equals(blocks.transactions.size, 1)
    assert(blocks.transactions.has(compactT))
  })
})
