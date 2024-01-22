import { encode, decode, Block } from 'multiformats/block'
import { parse } from 'multiformats/link'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import * as codec from '@ipld/dag-cbor'
import { put, get, entries, EventData, root } from '@alanshaw/pail/crdt'
import { EventFetcher, vis } from '@alanshaw/pail/clock'
import {
  type EncryptedBlockstore,
  type CompactionFetcher,
  CarTransaction,
  TransactionMeta,
  BlockFetcher
} from '@fireproof/encrypted-blockstore'
import type {
  DocUpdate,
  ClockHead,
  AnyLink,
  DocValue,
  CRDTMeta,
  ChangesOptions,
  Doc,
  DocFileMeta,
  DocFiles
} from './types'
import { decodeFile, encodeFile } from './files'

function time(tag:string) {
  // console.time(tag)
}

function timeEnd(tag:string) {
  // console.timeEnd(tag)
}


export async function applyBulkUpdateToCrdt(
  tblocks: CarTransaction,
  head: ClockHead,
  updates: DocUpdate[],
  options?: object
): Promise<CRDTMeta> {
  let result
  for (const update of updates) {
    const link = await writeDocContent(tblocks, update)
    // console.time('crdt put')
    result = await put(tblocks, head, update.key, link, options)
    // console.timeEnd('crdt put')
    const resRoot = result.root.toString()
    const isReturned = result.additions.some(a => a.cid.toString() === resRoot)
    if (!isReturned) {
      const hasRoot = await tblocks.get(result.root) // is a db-wide get
      if (!hasRoot) {
        throw new Error(
          `missing root in additions: ${result.additions.length} ${resRoot} keys: ${updates
            .map(u => u.key)
            .toString()}`
        )

        // make sure https://github.com/alanshaw/pail/pull/20 is applied
        result.head = head
      }
    }
    if (result.event) { // ...result.removals can be used to mark slabs for compaction
      for (const { cid, bytes } of [...result.additions, result.event]) {
        tblocks.putSync(cid, bytes)
      }
      head = result.head
    }
  }
  return { head }
}

// this whole thing can get pulled outside of the write queue
async function writeDocContent(blocks: CarTransaction, update: DocUpdate): Promise<AnyLink> {
  let value: DocValue
  if (update.del) {
    value = { del: true }
  } else {
    await processFiles(blocks, update.value as Doc)
    value = { doc: update.value }
  }
  const block = await encode({ value, hasher, codec })
  blocks.putSync(block.cid, block.bytes)
  return block.cid
}

async function processFiles(blocks: CarTransaction, doc: Doc) {
  if (doc._files) {
    await processFileset(blocks, doc._files)
  }
  if (doc._publicFiles) {
    await processFileset(blocks, doc._publicFiles, true)
  }
}

async function processFileset(blocks: CarTransaction, files: DocFiles, publicFiles = false) {
  const dbBlockstore = blocks.parent
  const t = new CarTransaction(dbBlockstore) // maybe this should move to encrypted-blockstore
  const didPut = []
  // let totalSize = 0
  for (const filename in files) {
    if (File === files[filename].constructor) {
      const file = files[filename] as File

      // totalSize += file.size
      const { cid, blocks: fileBlocks } = await encodeFile(file)
      didPut.push(filename)
      for (const block of fileBlocks) {
        t.putSync(block.cid, block.bytes)
      }
      files[filename] = { cid, type: file.type, size: file.size } as DocFileMeta
    }
  }
  // todo option to bypass this limit
  // if (totalSize > 1024 * 1024 * 1) throw new Error('Sync limit for files in a single update is 1MB')
  if (didPut.length) {
    const car = await dbBlockstore.loader?.commitFiles(t, { files } as unknown as TransactionMeta, {
      public: publicFiles
    })
    if (car) {
      for (const name of didPut) {
        files[name] = { car, ...files[name] } as DocFileMeta
      }
    }
  }
}

export async function getValueFromCrdt(
  blocks: EncryptedBlockstore,
  head: ClockHead,
  key: string
): Promise<DocValue> {
  if (!head.length) throw new Error('Getting from an empty database')
  const link = await get(blocks, head, key)
  if (!link) throw new Error(`Missing key ${key}`)
  return await getValueFromLink(blocks, link)
}

export function readFiles(blocks: EncryptedBlockstore, { doc }: DocValue) {
  if (!doc) return
  if (doc._files) {
    readFileset(blocks, doc._files)
  }
  if (doc._publicFiles) {
    readFileset(blocks, doc._publicFiles, true)
  }
}

function readFileset(blocks: EncryptedBlockstore, files: DocFiles, isPublic = false) {
  for (const filename in files) {
    const fileMeta = files[filename] as DocFileMeta
    if (fileMeta.cid) {
      if (isPublic) {
        fileMeta.url = `https://${fileMeta.cid.toString()}.ipfs.w3s.link/`
      }
      if (fileMeta.car) {
        fileMeta.file = async () =>
          await decodeFile(
            {
              get: async (cid: AnyLink) => {
                return await blocks.getFile(fileMeta.car!, cid, isPublic)
              }
            },
            fileMeta.cid,
            fileMeta
          )
      }
    }
    files[filename] = fileMeta
  }
}

async function getValueFromLink(blocks: BlockFetcher, link: AnyLink): Promise<DocValue> {
  const block = await blocks.get(link)
  if (!block) throw new Error(`Missing linked block ${link.toString()}`)
  const { value } = (await decode({ bytes: block.bytes, hasher, codec })) as { value: DocValue }
  readFiles(blocks as EncryptedBlockstore, value)
  return value
}

class DirtyEventFetcher<T> extends EventFetcher<T> {
  // @ts-ignore
  async get(link) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return await super.get(link)
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      console.error('missing event', link.toString(), e)
      return { value: null }
    }
  }
}

export async function clockChangesSince(
  blocks: BlockFetcher,
  head: ClockHead,
  since: ClockHead,
  opts: ChangesOptions
): Promise<{ result: DocUpdate[]; head: ClockHead }> {
  const eventsFetcher = (
    opts.dirty ? new DirtyEventFetcher<EventData>(blocks) : new EventFetcher<EventData>(blocks)
  ) as EventFetcher<EventData>
  const keys: Set<string> = new Set()
  const updates = await gatherUpdates(
    blocks,
    eventsFetcher,
    head,
    since,
    [],
    keys,
    new Set<string>(),
    opts.limit || Infinity
  )
  return { result: updates.reverse(), head }
}

async function gatherUpdates(
  blocks: BlockFetcher,
  eventsFetcher: EventFetcher<EventData>,
  head: ClockHead,
  since: ClockHead,
  updates: DocUpdate[] = [],
  keys: Set<string>,
  didLinks: Set<string>,
  limit: number
): Promise<DocUpdate[]> {
  if (limit <= 0) return updates
  // if (Math.random() < 0.001) console.log('gatherUpdates', head.length, since.length, updates.length)
  const sHead = head.map(l => l.toString())
  for (const link of since) {
    if (sHead.includes(link.toString())) {
      return updates
    }
  }
  for (const link of head) {
    if (didLinks.has(link.toString())) continue
    didLinks.add(link.toString())
    const { value: event } = await eventsFetcher.get(link)
    if (!event) continue
    const { key, value } = event.data
    if (keys.has(key)) {
      if (event.parents) {
        updates = await gatherUpdates(
          blocks,
          eventsFetcher,
          event.parents,
          since,
          updates,
          keys,
          didLinks,
          limit
        )
      }
    } else {
      keys.add(key)
      const docValue = await getValueFromLink(blocks, value)
      updates.push({ key, value: docValue.doc, del: docValue.del, clock: link })
      limit--
      if (event.parents) {
        updates = await gatherUpdates(
          blocks,
          eventsFetcher,
          event.parents,
          since,
          updates,
          keys,
          didLinks,
          limit
        )
      }
    }
  }
  return updates
}

export async function* getAllEntries(blocks: BlockFetcher, head: ClockHead) {
  // return entries(blocks, head)
  for await (const [key, link] of entries(blocks, head)) {
    const docValue = await getValueFromLink(blocks, link)
    yield { key, value: docValue.doc, del: docValue.del } as DocUpdate
  }
}

export async function* clockVis(blocks: EncryptedBlockstore, head: ClockHead) {
  for await (const line of vis(blocks, head)) {
    yield line
  }
}

let isCompacting = false
export async function doCompact(blockLog: CompactionFetcher, head: ClockHead) {
  if (isCompacting) {
    console.log('already compacting')
    return
  }
  isCompacting = true

  time("compact head")
  for (const cid of head) {
    const bl = await blockLog.get(cid)
    if (!bl) throw new Error('Missing head block: ' + cid.toString())
  }
  timeEnd("compact head")

  // for await (const blk of  blocks.entries()) {
  //   const bl = await blockLog.get(blk.cid)
  //   if (!bl) throw new Error('Missing tblock: ' + blk.cid.toString())
  // }

  // todo maybe remove
  // for await (const blk of blocks.loader!.entries()) {
  //   const bl = await blockLog.get(blk.cid)
  //   if (!bl) throw new Error('Missing db block: ' + blk.cid.toString())
  // }

  time("compact all entries")
  for await (const _entry of getAllEntries(blockLog, head)) {
    // result.push(entry)
    void 1
  }
  timeEnd("compact all entries")

  // time("compact crdt entries")
  // for await (const [, link] of entries(blockLog, head)) {
  //   const bl = await blockLog.get(link)
  //   if (!bl) throw new Error('Missing entry block: ' + link.toString())
  // }
  // timeEnd("compact crdt entries")

  time("compact clock vis")
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const _line of vis(blockLog, head)) {
    void 1
  }
  timeEnd("compact clock vis")

  time("compact root")
  const result = await root(blockLog, head)
  timeEnd("compact root")

  time("compact root blocks")
  for (const { cid, bytes } of [...result.additions, ...result.removals]) {
    blockLog.loggedBlocks.putSync(cid, bytes)
  }
  timeEnd("compact root blocks")

  time("compact changes")
  await clockChangesSince(blockLog, head, [], {})
  timeEnd("compact changes")

  isCompacting = false
}

export async function getBlock(blocks: BlockFetcher, cidString: string) {
  const block = await blocks.get(parse(cidString))
  if (!block) throw new Error(`Missing block ${cidString}`)
  const { cid, value } = await decode({ bytes: block.bytes, codec, hasher })
  return new Block({ cid, value, bytes: block.bytes })
}

