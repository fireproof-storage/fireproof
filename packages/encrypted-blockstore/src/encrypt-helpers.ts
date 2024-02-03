import { sha256 } from 'multiformats/hashes/sha2'
import { CID } from 'multiformats'
import { encode, decode, create as mfCreate } from 'multiformats/block'
import type { MultihashHasher, ToString } from 'multiformats'

import type { CarReader } from '@ipld/car'
import * as dagcbor from '@ipld/dag-cbor'

import { MemoryBlockstore } from '@web3-storage/pail/block'

// @ts-ignore
import { bf } from 'prolly-trees/utils'
// @ts-ignore
import { nocache as cache } from 'prolly-trees/cache'
// @ts-ignore
import { create, load } from 'prolly-trees/cid-set'

import { encodeCarFile } from './loader-helpers'
import { makeCodec } from './encrypt-codec.js'
import type { AnyBlock, CarMakeable, AnyLink, AnyDecodedBlock, CryptoOpts } from './types'

function makeEncDec(crypto: any, randomBytes: (size: number) => Uint8Array) {
  const codec = makeCodec(crypto, randomBytes)

  const encrypt = async function* ({
    get,
    cids,
    hasher,
    key,
    cache,
    chunker,
    root
  }: {
    get: (cid: AnyLink) => Promise<AnyBlock | undefined>
    key: ArrayBuffer
    cids: AnyLink[]
    hasher: MultihashHasher<number>
    chunker: (bytes: Uint8Array) => AsyncGenerator<Uint8Array>
    cache: (cid: AnyLink) => Promise<AnyBlock>
    root: AnyLink
  }): AsyncGenerator<any, void, unknown> {
    const set = new Set<ToString<AnyLink>>()
    let eroot
    for (const cid of cids) {
      const unencrypted = await get(cid)
      if (!unencrypted) throw new Error('missing cid: ' + cid.toString())
      const encrypted = await codec.encrypt({ ...unencrypted, key })
      const block = await encode({ ...encrypted, codec, hasher })
      yield block
      set.add(block.cid.toString())
      if (unencrypted.cid.equals(root)) eroot = block.cid
    }
    if (!eroot) throw new Error('cids does not include root')
    const list = [...set].map(s => CID.parse(s))
    let last
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    for await (const node of create({ list, get, cache, chunker, hasher, codec: dagcbor })) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const block = (await node.block) as AnyBlock
      yield block
      last = block
    }
    if (!last) throw new Error('missing last block')
    const head = [eroot, last.cid]
    const block = await encode({ value: head, codec: dagcbor, hasher })
    yield block
  }

  const decrypt = async function* ({
    root,
    get,
    key,
    cache,
    chunker,
    hasher
  }: {
    root: AnyLink
    get: (cid: AnyLink) => Promise<AnyBlock | undefined>
    key: ArrayBuffer
    cache: (cid: AnyLink) => Promise<AnyBlock>
    chunker: (bytes: Uint8Array) => AsyncGenerator<Uint8Array>
    hasher: MultihashHasher<number>
  }): AsyncGenerator<AnyBlock, void, undefined> {
    const getWithDecode = async (cid: AnyLink) =>
      get(cid).then(async block => {
        if (!block) return
        const decoded = await decode({ ...block, codec: dagcbor, hasher })
        return decoded
      })
    const getWithDecrypt = async (cid: AnyLink) =>
      get(cid).then(async block => {
        if (!block) return
        const decoded = await decode({ ...block, codec, hasher })
        return decoded
      })
    const decodedRoot = await getWithDecode(root)
    if (!decodedRoot) throw new Error('missing root')
    if (!decodedRoot.bytes) throw new Error('missing bytes')
    const {
      value: [eroot, tree]
    } = decodedRoot as { value: [AnyLink, AnyLink] }
    const rootBlock = (await get(eroot)) as AnyDecodedBlock
    if (!rootBlock) throw new Error('missing root block')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const cidset = await load({ cid: tree, get: getWithDecode, cache, chunker, codec, hasher })
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const { result: nodes } = (await cidset.getAllEntries()) as { result: { cid: CID }[] }
    const unwrap = async (eblock: AnyDecodedBlock | undefined) => {
      if (!eblock) throw new Error('missing block')
      if (!eblock.value) {
        eblock = (await decode({ ...eblock, codec, hasher })) as AnyDecodedBlock
      }
      const { bytes, cid } = await codec.decrypt({ ...eblock, key }).catch(e => {
        throw e
      })
      const block = await mfCreate({ cid, bytes, hasher, codec })
      return block
    }
    const promises = []
    for (const { cid } of nodes) {
      if (!rootBlock.cid.equals(cid)) promises.push(getWithDecrypt(cid).then(unwrap))
    }
    yield* promises
    yield unwrap(rootBlock)
  }
  return { encrypt, decrypt }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
const chunker = bf(30)

function hexStringToUint8Array(hexString: string) {
  const length = hexString.length
  const uint8Array = new Uint8Array(length / 2)
  for (let i = 0; i < length; i += 2) {
    uint8Array[i / 2] = parseInt(hexString.substring(i, i + 2), 16)
  }
  return uint8Array
}

export async function encryptedEncodeCarFile(
  crypto: CryptoOpts,
  key: string,
  rootCid: AnyLink,
  t: CarMakeable
): Promise<AnyBlock> {
  const encryptionKey = hexStringToUint8Array(key)
  const encryptedBlocks = new MemoryBlockstore()
  const cidsToEncrypt = [] as AnyLink[]
  for (const { cid } of t.entries()) {
    cidsToEncrypt.push(cid)
    const g = await t.get(cid)
    if (!g) throw new Error('missing cid block')
  }
  let last: AnyBlock | null = null
  const { encrypt } = makeEncDec(crypto.crypto, crypto.randomBytes)

  for await (const block of encrypt({
    cids: cidsToEncrypt,
    get: t.get.bind(t),
    key: encryptionKey,
    hasher: sha256,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    chunker,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    cache,
    root: rootCid
  }) as AsyncGenerator<AnyBlock, void, unknown>) {
    await encryptedBlocks.put(block.cid, block.bytes)
    last = block
  }
  if (!last) throw new Error('no blocks encrypted')
  const encryptedCar = await encodeCarFile([last.cid], encryptedBlocks)
  return encryptedCar
}

export async function decodeEncryptedCar(crypto: CryptoOpts, key: string, reader: CarReader) {
  const roots = await reader.getRoots()
  const root = roots[0]
  return await decodeCarBlocks(crypto, root, reader.get.bind(reader), key)
}
async function decodeCarBlocks(
  crypto: CryptoOpts,
  root: AnyLink,
  get: (cid: any) => Promise<AnyBlock | undefined>,
  keyMaterial: string
): Promise<{ blocks: MemoryBlockstore; root: AnyLink }> {
  const decryptionKeyUint8 = hexStringToUint8Array(keyMaterial)
  const decryptionKey = decryptionKeyUint8.buffer.slice(0, decryptionKeyUint8.byteLength)

  const decryptedBlocks = new MemoryBlockstore()
  let last: AnyBlock | null = null

  const { decrypt } = makeEncDec(crypto.crypto, crypto.randomBytes)

  for await (const block of decrypt({
    root,
    get,
    key: decryptionKey,
    hasher: sha256,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    chunker,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    cache
  })) {
    await decryptedBlocks.put(block.cid, block.bytes)
    last = block
  }
  if (!last) throw new Error('no blocks decrypted')
  return { blocks: decryptedBlocks, root: last.cid }
}
