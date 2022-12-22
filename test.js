/* global crypto */
import { describe, it } from 'node:test'
import assert from 'assert'
import { CID } from 'multiformats/cid'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'
import { ShardBlock, put, MaxKeyLength } from './index.js'

/** @param {number} size */
async function randomCID (size) {
  const hash = await sha256.digest(await randomBytes(size))
  return CID.create(1, raw.code, hash)
}

/** @param {number} size */
async function randomBytes (size) {
  const bytes = new Uint8Array(size)
  while (size) {
    const chunk = new Uint8Array(Math.min(size, 65_536))
    crypto.getRandomValues(chunk)
    size -= bytes.length
    bytes.set(chunk, size)
  }
  return bytes
}

describe('put', () => {
  it('put to empty shard', async () => {
    const root = await ShardBlock.create()
    const blocks = { get: async () => root }
    const dataCID = await randomCID(32)
    const result = await put(blocks, root.cid, 'test', dataCID)

    assert.equal(result.removals.length, 1)
    assert.equal(result.removals[0].cid.toString(), root.cid.toString())
    assert.equal(result.additions.length, 1)
    assert.equal(result.additions[0].value.length, 1)
    assert.equal(result.additions[0].value[0][0], 'test')
    assert.equal(result.additions[0].value[0][1].toString(), dataCID.toString())
  })

  it('auto-shards on long key', async () => {
    const root = await ShardBlock.create()
    const blocks = { get: async () => root }
    const dataCID = await randomCID(32)
    const key = Array(MaxKeyLength + 1).fill('a').join('')
    const result = await put(blocks, root.cid, key, dataCID)

    assert.equal(result.removals.length, 1)
    assert.equal(result.removals[0].cid.toString(), root.cid.toString())
    assert.equal(result.additions.length, 2)
    assert.equal(result.additions[0].value.length, 1)
    assert.equal(result.additions[0].value[0][0], key.slice(-1))
    assert.equal(result.additions[0].value[0][1].toString(), dataCID.toString())
    assert.equal(result.additions[1].value.length, 1)
    assert.equal(result.additions[1].value[0][0], key.slice(0, -1))
    assert.equal(result.additions[1].value[0][1][0].toString(), result.additions[0].cid.toString())
  })
})
