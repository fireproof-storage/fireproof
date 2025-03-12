import * as raw from "multiformats/codecs/raw";
import { DocFileMeta } from "../types.js";
import { AnyLink, AnyBlock } from "../blockstore/index.js";
import { CID } from "multiformats/cid";
import { sha256 as hasher } from "multiformats/hashes/sha2";
import { Result, top_uint8 } from "@adviser/cement";

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

/**
 * Decode a file from its blocks and CID
 * Returns a Result containing either the File or an Error
 */
export async function decodeFile(blocks: unknown, cid: AnyLink, meta: DocFileMeta): Promise<Result<File>> {
  // The blocks parameter is expected to be a storage interface with a get method
  const storage = blocks as { get: (cid: AnyLink) => Promise<Uint8Array> };

  try {
    // Get block data
    const bytes = await storage.get(cid);

    // Decode data
    const data = raw.decode(bytes);

    // Create File object with the original file metadata
    return Result.Ok(
      new File([data], "file", {
        type: meta.type,
        lastModified: 0,
      }),
    );
  } catch (error) {
    return Result.Err(error as Error);
  }
}
