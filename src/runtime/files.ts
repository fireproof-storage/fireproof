import * as raw from "multiformats/codecs/raw";
import { DocFileMeta } from "../types.js";
import { BlobLike, AnyLink, AnyBlock } from "../blockstore/index.js";
import { CID } from "multiformats/cid";
import { sha256 as hasher } from "multiformats/hashes/sha2";
import { Result } from "@adviser/cement";

/**
 * Simple implementation to replace UnixFS file handling
 * Convert a blob to a Uint8Array
 */
async function blobToUint8Array(blob: BlobLike): Promise<Uint8Array> {
  // Use File.arrayBuffer() if available, or stream the blob
  if ("arrayBuffer" in blob) {
    const arrayBuffer = await (blob as Blob).arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } else {
    // Use streaming approach
    const reader = blob.stream().getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLength += value.length;
    }

    // Combine chunks into a single Uint8Array
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }
}

/**
 * Encode a file into a single block with a CID
 */
export async function encodeFile(blob: BlobLike): Promise<{ cid: AnyLink; blocks: AnyBlock[] }> {
  // Convert blob to Uint8Array
  const data = await blobToUint8Array(blob);

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
    return Result.Ok(new File([data], "file", {
      type: meta.type,
      lastModified: 0,
    }));
  } catch (error) {
    return Result.Err(error as Error);
  }
}
