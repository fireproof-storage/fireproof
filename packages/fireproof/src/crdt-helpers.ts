import type { CID } from 'multiformats'
import { encode, decode } from 'multiformats/block'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import * as codec from '@ipld/dag-cbor'
import { put, get, entries, EventData, root } from '@alanshaw/pail/crdt'
import { EventFetcher, vis } from '@alanshaw/pail/clock'
import { LoggingFetcher, Transaction } from './transaction'
import type { TransactionBlockstore } from './transaction'
import type { DocUpdate, ClockHead, AnyLink, DocValue, BulkResult, ChangesOptions, Doc, DocFileMeta, FileResult, DocFiles } from './types'
import { decodeFile, encodeFile } from './files'
import { DbLoader } from './loaders'

export async function applyBulkUpdateToCrdt(
  tblocks: Transaction,
  head: ClockHead,
  updates: DocUpdate[],
  options?: object
): Promise<BulkResult> {
  let result
  for (const update of updates) {
    const link = await writeDocContent(tblocks, update)
    result = await put(tblocks, head, update.key, link, options)
    const resRoot = result.root.toString()
    const isReturned = result.additions.some(a => a.cid.toString() === resRoot)
    if (!isReturned) {
      const hasRoot = await tblocks.get(result.root) // is a db-wide get
      if (!hasRoot) {
        console.error(`missing root in additions: ${result.additions.length} ${resRoot} keys: ${updates.map(u => u.key).toString()}`)
        // make sure https://github.com/alanshaw/pail/pull/20 is applied
        result.head = head
      }
    }
    for (const { cid, bytes } of [...result.additions, ...result.removals, result.event]) {
      tblocks.putSync(cid, bytes)
    }
    head = result.head
  }
  return { head }
}

// this whole thing can get pulled outside of the write queue
async function writeDocContent(blocks: Transaction, update: DocUpdate): Promise<AnyLink> {
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

async function processFiles(blocks: Transaction, doc: Doc) {
  if (doc._files) {
    await processFileset(blocks, doc._files)
  }
  if (doc._publicFiles) {
    await processFileset(blocks, doc._publicFiles, true)
  }
}

async function processFileset(blocks: Transaction, files: DocFiles, publicFiles = false) {
  const dbBlockstore = blocks.parent as TransactionBlockstore
  const t = new Transaction(dbBlockstore)
  dbBlockstore.transactions.add(t)
  const didPut = []
  let totalSize = 0
  for (const filename in files) {
    if (File === files[filename].constructor) {
      const file = files[filename] as File

      totalSize += file.size
      const { cid, blocks: fileBlocks } = await encodeFile(file)
      didPut.push(filename)
      for (const block of fileBlocks) {
        t.putSync(block.cid, block.bytes)
      }
      files[filename] = { cid, type: file.type, size: file.size } as DocFileMeta
    }
  }
  // todo option to bypass this limit
  if (totalSize > 1024 * 1024 * 1) throw new Error('Sync limit for files in a single update is 1MB')
  if (didPut.length) {
    const car = await dbBlockstore.loader?.commit(t, { files } as FileResult, { public: publicFiles })
    if (car) {
      for (const name of didPut) {
        files[name] = { car, ...files[name] } as DocFileMeta
      }
    }
  }
}

export async function getValueFromCrdt(blocks: TransactionBlockstore, head: ClockHead, key: string): Promise<DocValue> {
  if (!head.length) throw new Error('Getting from an empty database')
  const link = await get(blocks, head, key)
  if (!link) throw new Error(`Missing key ${key}`)
  return await getValueFromLink(blocks, link)
}

export function readFiles(blocks: TransactionBlockstore | LoggingFetcher, { doc }: DocValue) {
  if (!doc) return
  if (doc._files) {
    readFileset(blocks, doc._files)
  }
  if (doc._publicFiles) {
    readFileset(blocks, doc._publicFiles, true)
  }
}

function readFileset(blocks: TransactionBlockstore | LoggingFetcher, files: DocFiles, isPublic = false) {
  for (const filename in files) {
    const fileMeta = files[filename] as DocFileMeta
    if (fileMeta.cid) {
      // if (!blocks.loader) throw new Error('Missing loader')
      if (isPublic) { fileMeta.url = `https://${fileMeta.cid.toString()}.ipfs.w3s.link/` }
      if (fileMeta.car && blocks.loader) {
        const ld = blocks.loader as DbLoader
        fileMeta.file = async () => await decodeFile({
          get: async (cid: AnyLink) => {
            const reader = await ld.loadFileCar(fileMeta.car!, isPublic)
            const block = await reader.get(cid as CID)
            if (!block) throw new Error(`Missing block ${cid.toString()}`)
            return block.bytes
          }
        }, fileMeta.cid, fileMeta)
      }
    }
    files[filename] = fileMeta
  }
}

async function getValueFromLink(blocks: TransactionBlockstore | LoggingFetcher, link: AnyLink): Promise<DocValue> {
  const block = await blocks.get(link)
  if (!block) throw new Error(`Missing linked block ${link.toString()}`)
  const { value } = (await decode({ bytes: block.bytes, hasher, codec })) as { value: DocValue }
  readFiles(blocks, value)
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
      return ({ value: null })
    }
  }
}

export async function clockChangesSince(
  blocks: TransactionBlockstore | LoggingFetcher,
  head: ClockHead,
  since: ClockHead,
  opts: ChangesOptions
): Promise<{ result: DocUpdate[], head: ClockHead }> {
  const eventsFetcher = (opts.dirty ? new DirtyEventFetcher<EventData>(blocks) : new EventFetcher<EventData>(blocks)) as EventFetcher<EventData>
  const keys: Set<string> = new Set()
  const updates = await gatherUpdates(blocks, eventsFetcher, head, since, [], keys, new Set<string>(), opts.limit || Infinity)
  return { result: updates.reverse(), head }
}

async function gatherUpdates(
  blocks: TransactionBlockstore | LoggingFetcher,
  eventsFetcher: EventFetcher<EventData>,
  head: ClockHead,
  since: ClockHead,
  updates: DocUpdate[] = [],
  keys: Set<string>, didLinks: Set<string>,
  limit: number
): Promise<DocUpdate[]> {
  if (limit <= 0) return updates
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
        updates = await gatherUpdates(blocks, eventsFetcher, event.parents, since, updates, keys, didLinks, limit)
      }
    } else {
      keys.add(key)
      const docValue = await getValueFromLink(blocks, value)
      updates.push({ key, value: docValue.doc, del: docValue.del })
      limit--
      if (event.parents) {
        updates = await gatherUpdates(blocks, eventsFetcher, event.parents, since, updates, keys, didLinks, limit)
      }
    }
  }
  return updates
}

export async function * getAllEntries(blocks: TransactionBlockstore, head: ClockHead) {
  // return entries(blocks, head)
  for await (const [key, link] of entries(blocks, head)) {
    const docValue = await getValueFromLink(blocks, link)
    yield { key, value: docValue.doc, del: docValue.del } as DocUpdate
  }
}

export async function * clockVis(blocks: TransactionBlockstore, head: ClockHead) {
  for await (const line of vis(blocks, head)) {
    yield line
  }
}

export async function doCompact(blocks: TransactionBlockstore, head: ClockHead) {
  const blockLog = new LoggingFetcher(blocks)
  const newBlocks = new Transaction(blocks)

  for await (const [, link] of entries(blockLog, head)) {
    const bl = await blockLog.get(link)
    if (!bl) throw new Error('Missing block: ' + link.toString())
    // await newBlocks.put(link, bl.bytes)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const _line of vis(blockLog, head)) {
    void 1
  }

  const result = await root(blockLog, head)
  for (const { cid, bytes } of [...result.additions, ...result.removals]) {
    newBlocks.putSync(cid, bytes)
  }

  await clockChangesSince(blockLog, head, [], {})

  for (const cid of blockLog.cids) {
    const bl = await blocks.get(cid)
    if (!bl) throw new Error('Missing block: ' + cid.toString())
    await newBlocks.put(cid, bl.bytes)
  }

  await blocks.commitCompaction(newBlocks, head)
}
