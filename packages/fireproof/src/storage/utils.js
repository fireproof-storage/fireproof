import * as CBW from '@ipld/car/buffer-writer'
import * as raw from 'multiformats/codecs/raw'
import { encrypt, decrypt } from '../crypto.js'
import { parse } from 'multiformats/link'
import { sha256 } from 'multiformats/hashes/sha2'
import * as Block from 'multiformats/block'
import { Buffer } from 'buffer'
// @ts-ignore
import { bf } from 'prolly-trees/utils'
// @ts-ignore
import { nocache as cache } from 'prolly-trees/cache'
const chunker = bf(30)

export async function getEmptyLoader () { // unused?
  const theseWriteableBlocks = new VMemoryBlockstore()
  return {
    blocks: theseWriteableBlocks,
    put: async (cid, bytes) => {
      return await theseWriteableBlocks.put(cid, bytes)
    },
    get: async (cid) => {
      const got = await theseWriteableBlocks.get(cid)
      return got.bytes
    }
  }
}

export class VMemoryBlockstore {
  /** @type {Map<string, Uint8Array>} */
  blocks = new Map()
  instanceId = Math.random().toString(36).slice(2)

  async get (cid) {
    const bytes = this.blocks.get(cid.toString())
    if (!bytes) throw new Error('block not found ' + cid.toString())
    return { cid, bytes }
  }

  /**
   * @param {any} cid
   * @param {Uint8Array} bytes
   */
  async put (cid, bytes) {
    this.blocks.set(cid.toString(), bytes)
  }

  * entries () {
    for (const [str, bytes] of this.blocks) {
      yield { cid: parse(str), bytes }
    }
  }
}

export const blocksToCarBlock = async (rootCids, blocks) => {
  // console.log('blocksToCarBlock', rootCids, blocks.constructor.name)
  let size = 0
  if (!Array.isArray(rootCids)) {
    rootCids = [rootCids]
  }
  const headerSize = CBW.headerLength({ roots: rootCids })
  size += headerSize
  if (!Array.isArray(blocks)) {
    blocks = Array.from(blocks.entries())
  }
  for (const { cid, bytes } of blocks) {
    // console.log(cid, bytes)
    size += CBW.blockLength({ cid, bytes })
  }
  const buffer = new Uint8Array(size)
  const writer = await CBW.createWriter(buffer, { headerSize })

  for (const cid of rootCids) {
    writer.addRoot(cid)
  }

  for (const { cid, bytes } of blocks) {
    writer.write({ cid, bytes })
  }
  await writer.close()
  return await Block.encode({ value: writer.bytes, hasher: sha256, codec: raw })
}

export const blocksToEncryptedCarBlock = async (innerBlockStoreClockRootCid, blocks, keyMaterial, cids) => {
  const encryptionKey = Buffer.from(keyMaterial, 'hex')
  const encryptedBlocks = []
  const theCids = cids
  // console.trace('blocksToEncryptedCarBlock', blocks)
  // for (const { cid } of blocks.entries()) {
  //   theCids.push(cid.toString())
  // }
  // console.log(
  //   'encrypting',
  //   theCids.length,
  //   'blocks',
  //   theCids.includes(innerBlockStoreClockRootCid.toString()),
  //   keyMaterial
  // )
  // console.log('cids', theCids, innerBlockStoreClockRootCid.toString())
  let last
  for await (const block of encrypt({
    cids: theCids,
    get: async (cid) => {
      // console.log('getencrypt', cid)
      const got = blocks.get(cid)
      // console.log('got', got)
      return got.block ? ({ cid, bytes: got.block }) : got
    },
    key: encryptionKey,
    hasher: sha256,
    chunker,
    cache,
    // codec: dagcbor, // should be crypto?
    root: innerBlockStoreClockRootCid
  })) {
    encryptedBlocks.push(block)
    last = block
  }
  // console.log('last', last.cid.toString(), 'for clock', innerBlockStoreClockRootCid.toString())
  const encryptedCar = await blocksToCarBlock(last.cid, encryptedBlocks)
  return encryptedCar
}
// { root, get, key, cache, chunker, hasher }
const memoizeDecryptedCarBlocks = new Map()
export const blocksFromEncryptedCarBlock = async (cid, get, keyMaterial) => {
  if (memoizeDecryptedCarBlocks.has(cid.toString())) {
    return memoizeDecryptedCarBlocks.get(cid.toString())
  } else {
    const blocksPromise = (async () => {
      const decryptionKey = Buffer.from(keyMaterial, 'hex')
      // console.log('decrypting', keyMaterial, cid.toString())
      const cids = new Set()
      const decryptedBlocks = []
      for await (const block of decrypt({
        root: cid,
        get,
        key: decryptionKey,
        chunker,
        hasher: sha256,
        cache
        // codec: dagcbor
      })) {
        // console.log('decrypted', block.cid.toString())
        decryptedBlocks.push(block)
        cids.add(block.cid.toString())
      }
      return { blocks: decryptedBlocks, cids }
    })()
    memoizeDecryptedCarBlocks.set(cid.toString(), blocksPromise)
    return blocksPromise
  }
}
