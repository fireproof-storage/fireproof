import type { CarReader } from '@ipld/car'

import { sha256 } from 'multiformats/hashes/sha2'
import { encrypt, decrypt } from './crypto'
import { Buffer } from 'buffer'
// @ts-ignore
import { bf } from 'prolly-trees/utils'
// @ts-ignore
import { nocache as cache } from 'prolly-trees/cache'
import { encodeCarHeader, encodeCarFile } from './loader-helpers' // Import the existing function
import type { AnyBlock, CarMakeable, AnyCarHeader, AnyLink, BlockFetcher } from './types'
import type { Transaction } from './transaction'
import { MemoryBlockstore } from '@alanshaw/pail/block'

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
const chunker = bf(30)

export async function encryptedMakeCarFile(key: string, fp: AnyCarHeader, t: Transaction): Promise<AnyBlock> {
  const { cid, bytes } = await encodeCarHeader(fp)
  await t.put(cid, bytes)
  return encryptedEncodeCarFile(key, cid, t)
}

async function encryptedEncodeCarFile(key: string, rootCid: AnyLink, t: CarMakeable): Promise<AnyBlock> {
  const encryptionKeyBuffer = Buffer.from(key, 'hex')
  const encryptionKey = encryptionKeyBuffer.buffer.slice(encryptionKeyBuffer.byteOffset, encryptionKeyBuffer.byteOffset + encryptionKeyBuffer.byteLength)
  const encryptedBlocks = new MemoryBlockstore()
  const cidsToEncrypt = [] as AnyLink[]
  for (const { cid } of t.entries()) {
    cidsToEncrypt.push(cid)
  }
  let last: AnyBlock | null = null
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
  const encryptedCar = await encodeCarFile(last.cid, encryptedBlocks)
  return encryptedCar
}

export async function decodeEncryptedCar(key: string, reader: CarReader) {
  const roots = await reader.getRoots()
  const root = roots[0]
  return await decodeCarBlocks(root, reader.get.bind(reader), key)
}
async function decodeCarBlocks(
  root: AnyLink,
  get: (cid: any) => Promise<AnyBlock|undefined>,
  keyMaterial: string
): Promise<{ blocks: BlockFetcher; root: AnyLink }> {
  const decryptionKeyBuffer = Buffer.from(keyMaterial, 'hex')
  const decryptionKey = decryptionKeyBuffer.buffer.slice(decryptionKeyBuffer.byteOffset, decryptionKeyBuffer.byteOffset + decryptionKeyBuffer.byteLength)

  const decryptedBlocks = new MemoryBlockstore()
  let last: AnyBlock | null = null
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
