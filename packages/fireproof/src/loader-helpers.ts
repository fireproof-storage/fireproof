import { CID } from 'multiformats'
import { Block, encode, decode } from 'multiformats/block'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import * as raw from 'multiformats/codecs/raw'
import * as CBW from '@ipld/car/buffer-writer'
import * as codec from '@ipld/dag-cbor'
import { CarReader } from '@ipld/car'

import { AnyBlock, AnyCarHeader, AnyLink, CarMakeable } from './types'
import { Transaction } from './transaction'

export async function innerMakeCarFile(fp: AnyCarHeader, t: Transaction): Promise<AnyBlock> {
  const { cid, bytes } = await encodeCarHeader(fp)
  await t.put(cid, bytes)
  return encodeCarFile(cid, t)
}

export async function encodeCarFile(carHeaderBlockCid: AnyLink, t: CarMakeable): Promise<AnyBlock> {
  let size = 0
  const headerSize = CBW.headerLength({ roots: [carHeaderBlockCid as CID<unknown, number, number, 1>] })
  size += headerSize
  for (const { cid, bytes } of t.entries()) {
    size += CBW.blockLength({ cid, bytes } as Block<unknown, number, number, 1>)
  }
  const buffer = new Uint8Array(size)
  const writer = CBW.createWriter(buffer, { headerSize })

  writer.addRoot(carHeaderBlockCid as CID<unknown, number, number, 1>)

  for (const { cid, bytes } of t.entries()) {
    writer.write({ cid, bytes } as Block<unknown, number, number, 1>)
  }
  writer.close()
  return await encode({ value: writer.bytes, hasher, codec: raw })
}

export async function encodeCarHeader(fp: AnyCarHeader) {
  return (await encode({
    value: { fp },
    hasher,
    codec
  })) as AnyBlock
}

export async function parseCarFile(reader: CarReader): Promise<AnyCarHeader> {
  const roots = await reader.getRoots()
  const header = await reader.get(roots[0])
  if (!header) throw new Error('missing header block')
  const { value } = await decode({ bytes: header.bytes, hasher, codec })
  // @ts-ignore
  if (value && value.fp === undefined) throw new Error('missing fp')
  const { fp } = value as { fp: AnyCarHeader }
  return fp
}
