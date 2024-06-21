import * as UnixFS from "@ipld/unixfs";
import * as raw from "multiformats/codecs/raw";
import { withMaxChunkSize } from "@ipld/unixfs/file/chunker/fixed";
import { withWidth } from "@ipld/unixfs/file/layout/balanced";

import type { View } from "@ipld/unixfs";
import { DocFileMeta } from "../types";

import { exporter, ReadableStorage } from "ipfs-unixfs-exporter";
import { AnyBlock, AnyLink, BlobLike, STORAGE_VERSION } from "../storage-engine";

import { homedir } from "os";
import { join } from "path";

export function dataDir(): string {
  return join(homedir(), ".fireproof", "v" + STORAGE_VERSION);
}

const queuingStrategy = UnixFS.withCapacity();

const settings = UnixFS.configure({
  fileChunkEncoder: raw,
  smallFileEncoder: raw,
  chunker: withMaxChunkSize(1024 * 1024),
  fileLayout: withWidth(1024),
});

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

class UnixFSFileBuilder {
  #file;
  readonly name: string;
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
