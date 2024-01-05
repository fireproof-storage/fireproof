// from https://github.com/web3-storage/w3up/blob/main/packages/upload-client/src/unixfs.js#L165
import * as UnixFS from '@ipld/unixfs'
import * as raw from 'multiformats/codecs/raw'
import { withMaxChunkSize } from '@ipld/unixfs/file/chunker/fixed'
import { withWidth } from '@ipld/unixfs/file/layout/balanced'

import type { View } from '@ipld/unixfs'
import { AnyBlock, AnyLink, DocFileMeta } from './types'
// import type { Block } from 'multiformats/dist/types/src/block'

import { exporter, ReadableStorage } from 'ipfs-unixfs-exporter'

// /** @param {import('@ipld/unixfs').View} writer */

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
const queuingStrategy = UnixFS.withCapacity()

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
const settings = UnixFS.configure({
  fileChunkEncoder: raw,
  smallFileEncoder: raw,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  chunker: withMaxChunkSize(1024 * 1024),
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  fileLayout: withWidth(1024)
})

export async function encodeFile(blob: BlobLike): Promise<{ cid: AnyLink; blocks: AnyBlock[] }> {
  const readable = createFileEncoderStream(blob)
  const blocks = await collect(readable)
  return { cid: blocks.at(-1).cid, blocks }
}

export async function decodeFile(blocks: unknown, cid: AnyLink, meta: DocFileMeta): Promise<File> {
  const entry = await exporter(cid.toString(), blocks as ReadableStorage, { length: meta.size })
  const chunks = []
  for await (const chunk of entry.content()) chunks.push(chunk as Buffer)
  return new File(chunks, entry.name, { type: meta.type, lastModified: 0 })
}

function createFileEncoderStream(blob: BlobLike) {
  /** @type {TransformStream<import('@ipld/unixfs').Block, import('@ipld/unixfs').Block>} */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const { readable, writable } = new TransformStream({}, queuingStrategy)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  const unixfsWriter = UnixFS.createWriter({ writable, settings })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const fileBuilder = new UnixFSFileBuilder('', blob)
  void (async () => {
    await fileBuilder.finalize(unixfsWriter)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    await unixfsWriter.close()
  })()
  return readable
}

async function collect<T>(collectable: ReadableStream<T>): Promise<T[]> {
  // /** @type {T[]} */
  const chunks: T[] = []
  await collectable.pipeTo(
    new WritableStream({
      write(chunk) {
        chunks.push(chunk)
      }
    })
  )
  return chunks
}

class UnixFSFileBuilder {
  #file
  name: string
  constructor(name: string, file: BlobLike) {
    this.name = name
    this.#file = file
  }

  async finalize(writer: View) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const unixfsFileWriter = UnixFS.createFileWriter(writer)
    await this.#file.stream().pipeTo(
      new WritableStream({
        async write(chunk) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
          await unixfsFileWriter.write(chunk as Uint8Array)
        }
      })
    )
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    return await unixfsFileWriter.close()
  }
}

// ts-unused-exports:disable-next-line
export interface BlobLike {
  /**
   * Returns a ReadableStream which yields the Blob data.
   */
  stream: () => ReadableStream
}
