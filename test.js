/* global crypto */
import { describe, it } from 'node:test'
import assert from 'assert'
import { CID } from 'multiformats/cid'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'
import { ShardBlock, put } from './index.js'

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

describe('pail', () => {
  it('puts a new entry', async () => {
    const root = await ShardBlock.create()
    const blocks = { get: async () => root }
    const dataCID = await randomCID(32)
    const result = await put(blocks, root.cid, 'test', dataCID)
    console.log('GOT A RESULT', result)
    assert(false)
  })
})
