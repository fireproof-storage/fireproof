import type { CID } from 'multiformats'
import { encode, decode } from 'multiformats/block'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import * as codec from '@ipld/dag-cbor'
import { put, get, root, entries, EventData } from '@alanshaw/pail/crdt'
import { EventFetcher, vis } from '@alanshaw/pail/clock'
import { Transaction } from './transaction'
import type { TransactionBlockstore } from './transaction'
import type { DocUpdate, ClockHead, BlockFetcher, AnyLink, DocValue, BulkResult, ChangesOptions, Doc, DocFileMeta, FileResult } from './types'
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
    const link = await makeLinkForDoc(tblocks, update)
    result = await put(tblocks, head, update.key, link, options)
    const resRoot = result.root.toString()
    const isReturned = result.additions.some(a => a.cid.toString() === resRoot)
    if (!isReturned) {
      const hasRoot = await tblocks.get(result.root) // is a db-wide get
      if (!hasRoot) {
        console.error(`missing root in additions: ${result.additions.length} ${resRoot} keys: ${updates.map(u => u.key).toString()}`)
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
async function makeLinkForDoc(blocks: Transaction, update: DocUpdate): Promise<AnyLink> {
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
    console.log('processing files', doc._files)
    const dbBlockstore = blocks.parent as TransactionBlockstore
    const t = new Transaction(dbBlockstore)
    dbBlockstore.transactions.add(t)
    const didPut = []
    for (const filename in doc._files) {
      if (File === doc._files[filename].constructor) {
        const file = doc._files[filename] as File
        const { cid, blocks: fileBlocks } = await encodeFile(file)
        console.log('encoded file', cid.toString(), filename)
        didPut.push(filename)
        for (const block of fileBlocks) {
          t.putSync(block.cid, block.bytes)
        }
        doc._files[filename] = { cid, type: file.type, size: file.size } as DocFileMeta
      }
    }
    if (didPut.length) {
      const car = await dbBlockstore.loader?.commit(t, { files: doc._files } as FileResult)
      if (car) {
        for (const name of didPut) {
          doc._files[name] = { car, ...doc._files[name] } as DocFileMeta
        }
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

function readFiles(blocks: TransactionBlockstore, { doc }: DocValue) {
  if (doc && doc._files) {
    // console.log('readFiles', doc)
    for (const filename in doc._files) {
      const fileMeta = doc._files[filename] as DocFileMeta
      if (fileMeta.cid) {
        // const reader = blocks
        if (fileMeta.car && blocks.loader) {
          const ld = blocks.loader as DbLoader
          fileMeta.file = async () => await decodeFile({
            get: async (cid: AnyLink) => {
              // console.log('filefile get', cid, fileMeta.car)
              const reader = await ld.loadFileCar(fileMeta.car!)
              // console.log('filefile reader', reader)
              const block = await reader.get(cid as CID)
              if (!block) throw new Error(`Missing block ${cid.toString()}`)
              return block.bytes
            }
          }, fileMeta.cid, fileMeta)
        }
        // console.log('reading file', fileMeta)
      }
      doc._files[filename] = fileMeta
    }
  }
}

async function getValueFromLink(blocks: TransactionBlockstore, link: AnyLink): Promise<DocValue> {
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
  blocks: TransactionBlockstore,
  head: ClockHead,
  since: ClockHead,
  opts: ChangesOptions
): Promise<{ result: DocUpdate[], head: ClockHead }> {
  const eventsFetcher = (opts.dirty ? new DirtyEventFetcher<EventData>(blocks) : new EventFetcher<EventData>(blocks)) as EventFetcher<EventData>
  const keys: Set<string> = new Set()
  const updates = await gatherUpdates(blocks, eventsFetcher, head, since, [], keys)
  return { result: updates.reverse(), head }
}

async function gatherUpdates(
  blocks: TransactionBlockstore,
  eventsFetcher: EventFetcher<EventData>,
  head: ClockHead,
  since: ClockHead,
  updates: DocUpdate[] = [],
  keys: Set<string>
): Promise<DocUpdate[]> {
  const sHead = head.map(l => l.toString())
  for (const link of since) {
    if (sHead.includes(link.toString())) {
      return updates
    }
  }
  for (const link of head) {
    const { value: event } = await eventsFetcher.get(link)
    if (!event) continue
    const { key, value } = event.data
    if (keys.has(key)) {
      if (event.parents) {
        updates = await gatherUpdates(blocks, eventsFetcher, event.parents, since, updates, keys)
      }
    } else {
      keys.add(key)
      const docValue = await getValueFromLink(blocks, value)
      updates.push({ key, value: docValue.doc, del: docValue.del })
      if (event.parents) {
        updates = await gatherUpdates(blocks, eventsFetcher, event.parents, since, updates, keys)
      }
    }
  }
  return updates
}

export async function doCompact(blocks: TransactionBlockstore, head: ClockHead) {
  const blockLog = new LoggingFetcher(blocks)
  const newBlocks = new Transaction(blocks)

  for await (const [, link] of entries(blockLog, head)) {
    const bl = await blocks.get(link)
    if (!bl) throw new Error('Missing block: ' + link.toString())
    await newBlocks.put(link, bl.bytes)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const _line of vis(blockLog, head)) {
    void 1
  }

  for (const cid of blockLog.cids) {
    const bl = await blocks.get(cid)
    if (!bl) throw new Error('Missing block: ' + cid.toString())
    await newBlocks.put(cid, bl.bytes)
  }

  await blocks.commitCompaction(newBlocks, head)
}

class LoggingFetcher implements BlockFetcher {
  blocks: BlockFetcher
  cids: Set<AnyLink> = new Set()
  constructor(blocks: BlockFetcher) {
    this.blocks = blocks
  }

  async get(cid: AnyLink) {
    this.cids.add(cid)
    return await this.blocks.get(cid)
  }
}
