import * as raw from "multiformats/codecs/raw";
import { DocFileMeta } from "../types.js";
import { AnyLink, AnyBlock } from "../blockstore/index.js";
import { CID } from "multiformats/cid";
import { sha256 as hasher } from "multiformats/hashes/sha2";
import { exception2Result, Result, top_uint8 } from "@adviser/cement";

/**
 * Encode a file into a single block with a CID
 */
export async function encodeFile(blob: Blob): Promise<{ cid: AnyLink; blocks: AnyBlock[] }> {
  // Convert blob to Uint8Array
  const data = await top_uint8(blob);

  // Encode with raw codec
  const bytes = raw.encode(data);

  // Create CID
  const hash = await hasher.digest(bytes);
  const cid = CID.create(1, raw.code, hash);

  // Return single block with CID
  const block = { cid, bytes };

  return { cid, blocks: [block] };
}

export interface BlockGetter {
  get(cid: AnyLink): Promise<Uint8Array>;
}

function isHasBlockAGet(obj: unknown): obj is BlockGetter {
  return typeof (obj as BlockGetter).get === "function";
}

/**
 * Decode a file from its blocks and CID
 * Returns a Result containing either the File or an Error
 */
export async function decodeFile(blocks: unknown, cid: AnyLink, meta: DocFileMeta): Promise<Result<File>> {
  // The blocks parameter is expected to be a storage interface with a get method
  if (!isHasBlockAGet(blocks)) {
    return Result.Err(new Error("Invalid block storage"));
  }
  return exception2Result(async () => {
    // Get block data
    const bytes = await blocks.get(cid);

    // Decode data
    const data = raw.decode(bytes);

    // Create File object with the original file metadata
    return new File([data], "file", {
      type: meta.type,
      lastModified: meta.lastModified || 0,
    });
  });
}
