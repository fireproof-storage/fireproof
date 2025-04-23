import { encode } from "../runtime/wait-pr-multiformats/block.js";
import { sha256 as hasher } from "multiformats/hashes/sha2";
import * as dagCodec from "@ipld/dag-cbor";
import { decode as syncDecode } from "multiformats/block";
import { exception2Result, Logger } from "@adviser/cement";

import {
  AnyBlock,
  AnyLink,
  BlockItem,
  BranchBlockItem,
  CarHeader,
  DataBlockItem,
  DelBlockItem,
  DocBlockItem,
  EntriesBlockItem,
  FPBlock,
  FPBlockItem,
  isFPBlockItem,
  LeafBlockItem,
  ReadyCarBlockItem,
} from "./types.js";
import { DocObject } from "../types.js";

class FPBlockImpl implements FPBlock {
  readonly cid: AnyLink;
  readonly bytes: Uint8Array;
  readonly item: BlockItem;

  static async fromBlockItem<T extends BlockItem>(item: T): Promise<FPBlock> {
    const block = await encode({ value: item.value, hasher, codec: dagCodec });
    return new FPBlockImpl(block.cid, block.bytes, item as T);
  }

  static async fromAnyBlock(cid: AnyLink, bytes: Uint8Array): Promise<FPBlock> {
    const rcontent = await exception2Result(
      async () => await syncDecode<Record<string, unknown>, number, number>({ bytes, hasher, codec: dagCodec }),
    );
    if (rcontent.isErr()) {
      return new FileFPBlock(cid, bytes);
      // throw new Error(`block2item: decode error; ${rcontent.Err().message}:${(new TextDecoder()).decode(bytes)}`);
    }
    const content = rcontent.Ok();
    switch (true) {
      case "doc" in content.value:
        return FPBlockImpl.fromBlockItem({
          type: "doc",
          status: "ready",
          value: content.value as unknown as DocBlockItem["value"],
        });
      case "entries" in content.value:
        return FPBlockImpl.fromBlockItem({
          type: "entries",
          status: "ready",
          value: content.value as unknown as EntriesBlockItem["value"],
        });
      case "fp" in content.value:
        return FPBlockImpl.fromBlockItem({
          type: "fp",
          status: "ready",
          value: content.value as unknown as FPBlockItem["value"],
        });
      case "data" in content.value:
        return FPBlockImpl.fromBlockItem({
          type: "data",
          status: "ready",
          value: content.value as unknown as DataBlockItem["value"],
        });
      case "del" in content.value:
        return FPBlockImpl.fromBlockItem({
          type: "del",
          status: "ready",
          value: content.value as unknown as DelBlockItem["value"],
        });

      // leaf,closed
      case "leaf" in content.value:
        return FPBlockImpl.fromBlockItem({
          type: "leaf",
          status: "ready",
          value: content.value as unknown as LeafBlockItem["value"],
        });

      case "branch" in content.value:
        return FPBlockImpl.fromBlockItem({
          type: "branch",
          status: "ready",
          value: content.value as unknown as BranchBlockItem["value"],
        });

      default:
        return FPBlockImpl.fromBlockItem({
          type: "unknown",
          status: "ready",
          value: content.value as unknown,
        });
      // throw new Error(`block2item: unknown block type; ${Object.keys(content.value).join(",")}:${JSON.stringify(content.value)}`);
    }
  }

  constructor(cid: AnyLink, bytes: Uint8Array, item: BlockItem) {
    this.cid = cid;
    this.bytes = bytes;
    this.item = item;
  }
}

export async function uint82FPBlock(value: Uint8Array): Promise<FPBlock> {
  const block = await encode({ value, hasher, codec: dagCodec });
  return FPBlockImpl.fromAnyBlock(block.cid, block.bytes);
}

class FileFPBlock implements FPBlock {
  readonly cid: AnyLink;
  readonly bytes: Uint8Array;

  get item(): BlockItem {
    throw new Error("FileFPBlock: item not available");
  }
  constructor(cid: AnyLink, bytes: Uint8Array) {
    this.cid = cid;
    this.bytes = bytes;
  }
}

export function fileBlock2FPBlock(value: AnyBlock): FPBlock {
  return new FileFPBlock(value.cid, value.bytes);
}

export function anyBlock2FPBlock(fp: AnyBlock): Promise<FPBlock> {
  return FPBlockImpl.fromAnyBlock(fp.cid, fp.bytes);
}

export async function doc2FPBlock(doc: Partial<DocObject>): Promise<FPBlock> {
  const block = await encode({ value: doc, hasher, codec: dagCodec });
  return anyBlock2FPBlock(block);
}
export async function carHeader2FPBlock<T>(fp: CarHeader<T>): Promise<FPBlock> {
  // console.log("carHeader2FPBlock", fp);
  return anyBlock2FPBlock(
    (await encode({
      value: { fp },
      hasher,
      codec: dagCodec,
    })) as AnyBlock,
  );

  // return (await encode({
  //   value: { fp },
  //   hasher: sha256,
  //   codec: dagCodec,
  // })) as AnyBlock;

  // return new FPBlockImpl(fp.cid, fp.bytes);
}

export async function parseCarFile<T>(reader: FPBlock<ReadyCarBlockItem>, logger: Logger): Promise<CarHeader<T>> {
  const roots = await reader.item.value.car.roots;
  const header = reader.item.value.car.blocks.find((i) => i.cid.equals(roots[0]));
  if (!header) throw logger.Error().Msg("missing header block").AsError();
  // const dec = await decode({ bytes: header.bytes, hasher, codec: dagCodec });
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
  if (!isFPBlockItem<T>(header)) {
    throw logger.Error().Msg("missing fp").AsError();
  }
  return header.item.value.fp;
  // const fpvalue = dec.value as CarDecoded<T>;
  // // @jchris where is the fp attribute coming from?
  // if (fpvalue && !fpvalue.fp) {
  // }
  // return fpvalue.fp;
}
