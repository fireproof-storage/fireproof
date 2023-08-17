import type { ClockHead, DocUpdate, MapFn, IndexUpdate, QueryOpts, IdxMeta, IdxCarHeader } from './types'
import { IndexBlockstore } from './transaction'
import { bulkIndex, indexEntriesForChanges, byIdOpts, byKeyOpts, IndexTree, applyQuery, encodeRange, encodeKey, loadIndex } from './indexer-helpers'
import { CRDT } from './crdt'

export function index({ _crdt }: { _crdt: CRDT}, name: string, mapFn?: MapFn, meta?: IdxMeta): Index {
  if (mapFn && meta) throw new Error('cannot provide both mapFn and meta')
  if (mapFn && mapFn.constructor.name !== 'Function') throw new Error('mapFn must be a function')
  if (_crdt.indexers.has(name)) {
    const idx = _crdt.indexers.get(name)!
    idx.applyMapFn(name, mapFn, meta)
  } else {
    const idx = new Index(_crdt, name, mapFn, meta)
    _crdt.indexers.set(name, idx)
  }
  return _crdt.indexers.get(name)!
}

export class Index {
  blocks: IndexBlockstore
  crdt: CRDT
  name: string | null = null
  mapFn: MapFn | null = null
  mapFnString: string = ''
  byKey = new IndexTree()
  byId = new IndexTree()
  indexHead: ClockHead | undefined = undefined
  includeDocsDefault: boolean = false
  initError: Error | null = null
  ready: Promise<void>

  constructor(crdt: CRDT, name: string, mapFn?: MapFn, meta?: IdxMeta) {
    this.blocks = crdt.indexBlocks
    this.crdt = crdt
    this.applyMapFn(name, mapFn, meta)
    if (!(this.mapFnString || this.initError)) throw new Error('missing mapFnString')
    this.ready = this.blocks.ready.then((header: IdxCarHeader) => {
      // @ts-ignore
      if (header.head) throw new Error('cannot have head in idx header')
      if (header.indexes === undefined) throw new Error('missing indexes in idx header')
      for (const [name, idx] of Object.entries(header.indexes)) {
        index({ _crdt: crdt }, name, undefined, idx as IdxMeta)
      }
    })
  }

  applyMapFn(name: string, mapFn?: MapFn, meta?: IdxMeta) {
    if (mapFn && meta) throw new Error('cannot provide both mapFn and meta')
    if (this.name && this.name !== name) throw new Error('cannot change name')
    this.name = name
    try {
      if (meta) {
        // hydrating from header
        if (this.indexHead &&
          this.indexHead.map(c => c.toString()).join() !== meta.head.map(c => c.toString()).join()) {
          throw new Error('cannot apply meta to existing index')
        }
        this.byId.cid = meta.byId
        this.byKey.cid = meta.byKey
        this.indexHead = meta.head
        if (this.mapFnString) {
          // we already initialized from application code
          if (this.mapFnString !== meta.map) throw new Error('cannot apply different mapFn meta')
        } else {
          // we are first
          this.mapFnString = meta.map
        }
      } else {
        if (this.mapFn) {
          // we already initialized from application code
          if (mapFn) {
            if (this.mapFn.toString() !== mapFn.toString()) throw new Error('cannot apply different mapFn app2')
          }
        } else {
          // application code is creating an index
          if (!mapFn) {
            mapFn = makeMapFnFromName(name)
          }
          if (this.mapFnString) {
            // we already loaded from a header
            if (this.mapFnString !== mapFn.toString()) throw new Error('cannot apply different mapFn app')
          } else {
            // we are first
            this.mapFnString = mapFn.toString()
          }
          this.mapFn = mapFn
        }
      }
      const matches = /=>\s*(.*)/.test(this.mapFnString)
      this.includeDocsDefault = matches
    } catch (e) {
      this.initError = e as Error
    }
  }

  async query(opts: QueryOpts = {}) {
    await this._updateIndex()
    await this._hydrateIndex()
    if (!this.byKey.root) return await applyQuery(this.crdt, { result: [] }, opts)
    if (this.includeDocsDefault && opts.includeDocs === undefined) opts.includeDocs = true
    if (opts.range) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      const { result, ...all } = await this.byKey.root.range(...encodeRange(opts.range))
      return await applyQuery(this.crdt, { result, ...all }, opts)
    }
    if (opts.key) {
      const encodedKey = encodeKey(opts.key)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      return await applyQuery(this.crdt, await this.byKey.root.get(encodedKey), opts)
    }
    if (opts.prefix) {
      if (!Array.isArray(opts.prefix)) opts.prefix = [opts.prefix]
      const start = [...opts.prefix, NaN]
      const end = [...opts.prefix, Infinity]
      const encodedR = encodeRange([start, end])
      return await applyQuery(this.crdt, await this.byKey.root.range(...encodedR), opts)
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const { result, ...all } = await this.byKey.root.getAllEntries() // funky return type
    return await applyQuery(this.crdt, {
      result: result.map(({ key: [k, id], value }) =>
        ({ key: k, id, value })),
      ...all
    }, opts)
  }

  async _hydrateIndex() {
    if (this.byId.root && this.byKey.root) return
    if (!this.byId.cid || !this.byKey.cid) return
    this.byId.root = await loadIndex(this.blocks, this.byId.cid, byIdOpts)
    this.byKey.root = await loadIndex(this.blocks, this.byKey.cid, byKeyOpts)
  }

  async _updateIndex() {
    await this.ready
    if (this.initError) throw this.initError
    if (!this.mapFn) throw new Error('No map function defined')
    const { result, head } = await this.crdt.changes(this.indexHead)
    if (result.length === 0) {
      this.indexHead = head
      return { byId: this.byId, byKey: this.byKey }
    }
    let staleKeyIndexEntries: IndexUpdate[] = []
    let removeIdIndexEntries: IndexUpdate[] = []
    if (this.byId.root) {
      const removeIds = result.map(({ key }) => key)
      const { result: oldChangeEntries } = await this.byId.root.getMany(removeIds) as { result: Array<[string, string] | string> }
      staleKeyIndexEntries = oldChangeEntries.map(key => ({ key, del: true }))
      removeIdIndexEntries = oldChangeEntries.map((key) => ({ key: key[1], del: true }))
    }
    const indexEntries = indexEntriesForChanges(result, this.mapFn) // use a getter to translate from string
    const byIdIndexEntries: DocUpdate[] = indexEntries.map(({ key }) => ({ key: key[1], value: key }))
    const indexerMeta: Map<string, IdxMeta> = new Map()
    for (const [name, indexer] of this.crdt.indexers) {
      if (indexer.indexHead) {
        indexerMeta.set(name, {
          byId: indexer.byId.cid,
          byKey: indexer.byKey.cid,
          head: indexer.indexHead,
          map: indexer.mapFnString,
          name: indexer.name
        } as IdxMeta)
      }
    }
    return await this.blocks.transaction(async (tblocks): Promise<IdxMeta> => {
      this.byId = await bulkIndex(
        tblocks,
        this.byId,
        removeIdIndexEntries.concat(byIdIndexEntries),
        byIdOpts
      )
      this.byKey = await bulkIndex(tblocks, this.byKey, staleKeyIndexEntries.concat(indexEntries), byKeyOpts)
      this.indexHead = head
      return { byId: this.byId.cid, byKey: this.byKey.cid, head, map: this.mapFnString, name: this.name } as IdxMeta
    }, indexerMeta)
  }
}

function makeMapFnFromName(name: string): MapFn {
  return (doc) => {
    if (doc[name]) return doc[name]
  }
}
