import { decode } from "../runtime/wait-pr-multiformats/block.js";
import { sha256 as hasher } from "multiformats/hashes/sha2";
import * as dagCodec from "@ipld/dag-cbor";
import type { Logger } from "@adviser/cement";

import { CarHeader } from "./types.js";
// import { decodeRunLength } from "../runtime/keyed-crypto.js";
// import { base58btc } from "multiformats/bases/base58";
import { CarReader } from "@ipld/car";

// export async function encodeCarHeader<T>(fp: CarHeader<T>) {
//   return (await encode({
//     value: { fp },
//     hasher,
//     codec: dagCodec,
//   })) as AnyBlock;
// }

// function wrapDagDecoder<T>(dec: BlockDecoder<number, Uint8Array>): BlockDecoder<number, CarDecoded<T>> {
//   return {
//     code: dec.code,
//     decode: async (block: Uint8Array) => dagCodec.decode(await dec.decode(block))
//   }
// }

interface CarDecoded<T> {
  readonly fp: CarHeader<T>;
}

export async function parseCarFile<T>(reader: CarReader, logger: Logger): Promise<CarHeader<T>> {
  const roots = await reader.getRoots();
  const header = await reader.get(roots[0]);
  if (!header) throw logger.Error().Msg("missing header block").AsError();
  const dec = await decode({ bytes: header.bytes, hasher, codec: dagCodec });
  // console.log("parseCarFile-done", roots[0].toString(), header)
  // const { value } = await decode({
  //   bytes: header.bytes,
  //   hasher,
  //   codec: await wrapDagDecoder<T>({
  //     code: dagCodec.code,
  //     decode: (block) => {
  //       const ui = new Uint8Array(block);
  //       const iv = decodeRunLength(ui, 0, logger);
  //       const key = decodeRunLength(ui, iv.next, logger);
  //       // const fp = decodeRunLength(ui, key.next, logger);
  //       console.log("parseCarFile", { iv: iv.data.length, key: base58btc.encode(key.data) }, (new Error()).stack);
  //       return ui
  //     }
  //   })
  // });
  const fpvalue = dec.value as CarDecoded<T>;
  // @jchris where is the fp attribute coming from?
  if (fpvalue && !fpvalue.fp) {
    throw logger.Error().Msg("missing fp").AsError();
  }
  return fpvalue.fp;
}
