import { WriteQueue, writeQueue } from './write-queue'
import { CRDT } from './crdt'
import type { BulkResult, DocUpdate, ClockHead, Doc, FireproofOptions } from './types'

export class Database {
  static databases: Map<string, Database> = new Map()

  name: string
  opts: FireproofOptions = {}

  _listeners: Set<ListenerFn> = new Set()
  _crdt: CRDT
  // _indexes: Map<string, Index> = new Map()
  _writeQueue: WriteQueue

  constructor(name: string, opts?: FireproofOptions) {
    this.name = name
    this.opts = opts || this.opts
    this._crdt = new CRDT(name, this.opts)
    this._writeQueue = writeQueue(async (updates: DocUpdate[]) => {
      const r = await this._crdt.bulk(updates)
      await this._notify(updates)
      return r
    })
  }

  async get(id: string): Promise<Doc> {
    const got = await this._crdt.get(id).catch(e => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      e.message = `Not found: ${id} - ` + e.message
      throw e
    })
    if (!got) throw new Error(`Not found: ${id}`)
    const { doc } = got
    return { _id: id, ...doc }
  }

  async put(doc: Doc): Promise<DbResponse> {
    const { _id, ...value } = doc
    const docId = _id || 'f' + Math.random().toString(36).slice(2) // todo uuid v7
    const result: BulkResult = await this._writeQueue.push({ key: docId, value } as DocUpdate)
    return { id: docId, clock: result?.head } as DbResponse
  }

  async del(id: string): Promise<DbResponse> {
    const result = await this._writeQueue.push({ key: id, del: true })
    return { id, clock: result?.head } as DbResponse
  }

  async changes(since: ClockHead = []): Promise<ChangesResponse> {
    const { result, head } = await this._crdt.changes(since)
    const rows = result.map(({ key, value }) => ({
      key, value: { _id: key, ...value } as Doc
    }))
    return { rows, clock: head }
  }

  subscribe(listener: ListenerFn): () => void {
    this._listeners.add(listener)
    return () => {
      this._listeners.delete(listener)
    }
  }

  async _notify(updates: DocUpdate[]) {
    if (this._listeners.size) {
      const docs = updates.map(({ key, value }) => ({ _id: key, ...value }))
      for (const listener of this._listeners) {
        await listener(docs)
      }
    }
  }
}

type ChangesResponse = {
  clock: ClockHead
  rows: { key: string; value: Doc }[]
}

type DbResponse = {
  id: string
  clock: ClockHead
}

type ListenerFn = (docs: Doc[]) => Promise<void> | void

export function database(name: string, opts?: FireproofOptions): Database {
  if (!Database.databases.has(name)) {
    Database.databases.set(name, new Database(name, opts))
  }
  return Database.databases.get(name)!
}
