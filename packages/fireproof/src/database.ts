import { uuidv7 } from 'uuidv7'

import { WriteQueue, writeQueue } from './write-queue'
import { CRDT } from './crdt'
import { index } from './index'

import type { BulkResult, DocUpdate, ClockHead, Doc, FireproofOptions, MapFn, QueryOpts } from './types'
// import { encodeFile } from './files'

type DbName = string | null

export class Database {
  static databases: Map<string, Database> = new Map()

  name: DbName
  opts: FireproofOptions = {}

  _listeners: Set<ListenerFn> = new Set()
  _crdt: CRDT
  _writeQueue: WriteQueue

  constructor(name?: string, opts?: FireproofOptions) {
    this.name = name || null
    this.opts = opts || this.opts
    this._crdt = new CRDT(name, this.opts)
    this._crdt.clock.onTick((updates: DocUpdate[]) => {
      void this._notify(updates)
    })
    this._writeQueue = writeQueue(async (updates: DocUpdate[]) => {
      return await this._crdt.bulk(updates)
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
    return { _id: id, ...doc } as Doc
  }

  async put(doc: Doc): Promise<DbResponse> {
    const { _id, ...value } = doc
    const docId = _id || uuidv7()
    const result: BulkResult = await this._writeQueue.push({ key: docId, value } as DocUpdate)
    return { id: docId, clock: result?.head } as DbResponse
  }

  // async putFile(id: string, name: string|null, file: File): Promise<DbResponse> {
  //   const doc = await this.get(id).catch(() => ({ _id: id } as Doc))
  //   const { _id, ...value } = doc
  //   const fileRecord = { [name || file.name]: file }
  //   value._files = { ...doc._files, ...fileRecord }
  //   const result: BulkResult = await this._writeQueue.push({ key: _id, value } as DocUpdate)
  //   return { id, clock: result?.head } as DbResponse
  // }

  async del(id: string): Promise<DbResponse> {
    const result = await this._writeQueue.push({ key: id, del: true })
    return { id, clock: result?.head } as DbResponse
  }

  async changes(since: ClockHead = [], opts: ChangesOptions = {}): Promise<ChangesResponse> {
    const { result, head } = await this._crdt.changes(since, opts)
    const rows = result.map(({ key, value, del }) => ({
      key, value: (del ? { _id: key, _deleted: true } : { _id: key, ...value }) as Doc
    }))
    return { rows, clock: head }
  }

  subscribe(listener: ListenerFn): () => void {
    this._listeners.add(listener)
    return () => {
      this._listeners.delete(listener)
    }
  }

  async query(field: string | MapFn, opts: QueryOpts = {}) {
    const idx = (typeof field === 'string')
      ? index({ _crdt: this._crdt }, field)
      : index({ _crdt: this._crdt }, makeName(field.toString()))
    return await idx.query(opts)
  }

  async compact() {
    await this._crdt.compact()
  }

  async _notify(updates: DocUpdate[]) {
    if (this._listeners.size) {
      const docs = updates.map(({ key, value }) => ({ _id: key, ...value }))
      for (const listener of this._listeners) {
        await (async () => await listener(docs))().catch((e: Error) => {
          console.error('listener error', e)
        })
      }
    }
  }
}

type ChangesOptions = {
  dirty?: boolean
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

export function fireproof(name: string, opts?: FireproofOptions): Database {
  if (!Database.databases.has(name)) {
    const db = new Database(name, opts)
    // public API
    ;['get', 'put', 'del', 'changes', 'subscribe', 'query'].forEach((fn) => {
      // @ts-ignore
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      db[fn] = db[fn].bind(db)
    })
    Database.databases.set(name, db)
  }
  return Database.databases.get(name)!
}

function makeName(fnString: string) {
  const regex = /\(([^,()]+,\s*[^,()]+|\[[^\]]+\],\s*[^,()]+)\)/g
  let found: RegExpExecArray | null = null
  const matches = Array.from(fnString.matchAll(regex), match => match[1].trim())
  if (matches.length === 0) {
    found = /=>\s*(.*)/.exec(fnString)
  }
  if (!found) {
    return fnString
  } else {
    // it's a consise arrow function, match everythign after the arrow
    return found[1]
  }
}
