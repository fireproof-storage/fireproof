import * as UnixFS from "@ipld/unixfs";
import * as raw from "multiformats/codecs/raw";
import { withMaxChunkSize } from "@ipld/unixfs/file/chunker/fixed";
import { withWidth } from "@ipld/unixfs/file/layout/balanced";

import type { View } from "@ipld/unixfs";
import { AnyBlock, AnyLink, DocFileMeta } from "../types";

import { exporter, ReadableStorage } from "ipfs-unixfs-exporter";

const queuingStrategy = UnixFS.withCapacity();

const settings = UnixFS.configure({
  fileChunkEncoder: raw,
  smallFileEncoder: raw,
  chunker: withMaxChunkSize(1024 * 1024),
  fileLayout: withWidth(1024),
});

export async function encodeFile(blob: BlobLike): Promise<{ cid: AnyLink; blocks: AnyBlock[] }> {
  const readable = createFileEncoderStream(blob);
  const blocks = await collect(readable);
  return { cid: blocks.at(-1).cid, blocks };
}

export async function decodeFile(blocks: unknown, cid: AnyLink, meta: DocFileMeta): Promise<File> {
  const entry = await exporter(cid.toString(), blocks as ReadableStorage, { length: meta.size });
  const chunks = [];
  for await (const chunk of entry.content()) {
    chunks.push(chunk as Buffer);
  }
  return new File(chunks, entry.name, { type: meta.type, lastModified: 0 });
}

function createFileEncoderStream(blob: BlobLike) {
  const { readable, writable } = new TransformStream({}, queuingStrategy);
  const unixfsWriter = UnixFS.createWriter({ writable, settings });
  const fileBuilder = new UnixFSFileBuilder("", blob);
  void (async () => {
    await fileBuilder.finalize(unixfsWriter);
    await unixfsWriter.close();
  })();
  return readable;
}

async function collect<T>(collectable: ReadableStream<T>): Promise<T[]> {
  const chunks: T[] = [];
  await collectable.pipeTo(
    new WritableStream({
      write(chunk) {
        chunks.push(chunk);
      },
    }),
  );
  return chunks;
}

class UnixFSFileBuilder {
  #file;
  name: string;
  constructor(name: string, file: BlobLike) {
    this.name = name;
    this.#file = file;
  }

  async finalize(writer: View) {
    const unixfsFileWriter = UnixFS.createFileWriter(writer);
    await this.#file.stream().pipeTo(
      new WritableStream({
        async write(chunk) {
          await unixfsFileWriter.write(chunk as Uint8Array);
        },
      }),
    );
    return await unixfsFileWriter.close();
  }
}

export interface BlobLike {
  /**
   * Returns a ReadableStream which yields the Blob data.
   */
  stream: () => ReadableStream;
}
