import { CID } from "multiformats";
import { Block, encode, decode } from "multiformats/block";
import { sha256 as hasher } from "multiformats/hashes/sha2";
import * as raw from "multiformats/codecs/raw";
import * as CBW from "@ipld/car/buffer-writer";
import * as codec from "@ipld/dag-cbor";
import { CarReader } from "@ipld/car";

import { AnyBlock, AnyLink, CarHeader, CarMakeable } from "./types";

export async function encodeCarFile(roots: AnyLink[], t: CarMakeable): Promise<AnyBlock> {
  let size = 0;
  const headerSize = CBW.headerLength({ roots } as { roots: CID<unknown, number, number, 1>[] });
  size += headerSize;
  for (const { cid, bytes } of t.entries()) {
    size += CBW.blockLength({ cid, bytes } as Block<unknown, number, number, 1>);
  }
  const buffer = new Uint8Array(size);
  const writer = CBW.createWriter(buffer, { headerSize });

  for (const r of roots) {
    writer.addRoot(r as CID<unknown, number, number, 1>);
  }

  for (const { cid, bytes } of t.entries()) {
    writer.write({ cid, bytes } as Block<unknown, number, number, 1>);
  }
  writer.close();
  return await encode({ value: writer.bytes, hasher, codec: raw });
}

export async function encodeCarHeader<T>(fp: CarHeader<T>) {
  return (await encode({
    value: { fp },
    hasher,
    codec,
  })) as AnyBlock;
}

export async function parseCarFile<T>(reader: CarReader): Promise<CarHeader<T>> {
  const roots = await reader.getRoots();
  const header = await reader.get(roots[0]);
  if (!header) throw new Error("missing header block");
  const { value } = await decode({ bytes: header.bytes, hasher, codec });
  const fpvalue = value as { readonly fp: CarHeader<T> };
  // @jchris where is the fp attribute coming from?
  if (fpvalue && !fpvalue.fp) {
    throw new Error("missing fp");
  }
  return fpvalue.fp;
}
