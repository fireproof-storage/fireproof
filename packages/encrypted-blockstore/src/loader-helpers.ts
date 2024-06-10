import { CID } from 'multiformats'
import { Block, encode, decode } from 'multiformats/block'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import * as raw from 'multiformats/codecs/raw'
import * as CBW from '@ipld/car/buffer-writer'
import * as codec from '@ipld/dag-cbor'
import { CarBufferReader, CarBufferWriter, CarReader } from '@ipld/car'

import { AnyBlock, AnyLink, CarHeader, CarMakeable } from './types'

export async function encodeCarFiles(roots: AnyLink[], t: CarMakeable): Promise<AnyBlock[]> {
  let size = 0
  // @ts-ignore -- TODO: TypeScript does not like this casting
  const headerSize = CBW.headerLength({ roots } as { roots: CID<unknown, number, number, 1>[]})
  size += headerSize
  for (const { cid, bytes } of t.entries()) {
    // @ts-ignore -- TODO: TypeScript does not like this casting
    size += CBW.blockLength({ cid, bytes } as Block<unknown, number, number, 1>)
  }

  const maxThreshold= 1024 * 1024
  let buffers:Uint8Array[]= []
  let remainingsize=size
  if(remainingsize>maxThreshold)
  {
    while(remainingsize>=maxThreshold)
    {
      const buffer = new Uint8Array(maxThreshold)
      buffers.push(buffer)
      remainingsize=remainingsize-maxThreshold
    }
  }
  if(remainingsize!=0)
  {
    const buffer = new Uint8Array(remainingsize)
    buffers.push(buffer)
  }

  let writers:any[]=[]
  for(const buffer of buffers)
  {
    const writer = CBW.createWriter(buffer, { headerSize })
    writers.push(writer)
  }
  
  for (const r of roots) {
    // @ts-ignore -- TODO: TypeScript does not like this casting
    for(const writer of writers)
    {
      writer.addRoot(r as CID<unknown, number, number, 1>)
    }
  }

  for (const { cid, bytes } of t.entries()) {
    for(const writer of writers)
    {
      // @ts-ignore -- TODO: TypeScript does not like this casting
      writer.write({ cid, bytes } as Block<unknown, number, number, 1>)
    }
    
  }

  for(const writer of writers)
  {
    writer.close()
  }

  let blocks:AnyBlock[]=[]
  for(const writer of writers)
  {
    let value=await encode({ value: writer.bytes, hasher, codec: raw })
    blocks.push(value)
  }
  return blocks
}

export async function encodeCarHeader(fp: CarHeader) {
  return (await encode({
    value: { fp },
    hasher,
    codec
  })) as AnyBlock
}

export async function parseCarFile(reader: CarReader): Promise<CarHeader> {
  const roots = await reader.getRoots()
  const header = await reader.get(roots[0])
  if (!header) throw new Error('missing header block')
  const { value } = await decode({ bytes: header.bytes, hasher, codec })
  // @ts-ignore
  if (value && value.fp === undefined) throw new Error('missing fp')
  const { fp } = value as { fp: CarHeader }
  return fp
}
