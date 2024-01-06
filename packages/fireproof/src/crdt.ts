import {
  EncryptedBlockstore,
  type CompactionFetcher,
  type TransactionMeta,
  type CarTransaction
} from '@fireproof/encrypted-blockstore'

import { store, crypto } from './eb-web'

import {
  clockChangesSince,
  applyBulkUpdateToCrdt,
  getValueFromCrdt,
  readFiles,
  getAllEntries,
  clockVis,
  getBlock,
  doCompact
} from './crdt-helpers'
import type {
  DocUpdate,
  CRDTMeta,
  ClockHead,
  ConfigOpts,
  ChangesOptions,
  IdxMetaMap
} from './types'
import { index, type Index } from './index'
import { CRDTClock } from './crdt-clock'

export class CRDT {
  name: string | null
  opts: ConfigOpts = {}
  ready: Promise<void>
  blockstore: EncryptedBlockstore
  indexBlockstore: EncryptedBlockstore

  indexers: Map<string, Index> = new Map()

  clock: CRDTClock = new CRDTClock()

  constructor(name?: string, opts?: ConfigOpts) {
    this.name = name || null
    this.opts = opts || this.opts
    this.blockstore = new EncryptedBlockstore(
      this.name,
      {
        applyMeta: async (meta: TransactionMeta) => {
          const crdtMeta = meta as unknown as CRDTMeta
          await this.clock.applyHead(crdtMeta.head, [])
        },
        compact: async (blocks: CompactionFetcher) => {
          await doCompact(blocks, this.clock.head)
          return { head: this.clock.head } as TransactionMeta
        },
        crypto,
        store
      },
      this.opts
    )
    this.clock.blocks = this.blockstore
    this.indexBlocks = new EncryptedBlockstore(
      this.opts.persistIndexes && this.name ? this.name + '.idx' : null,
      {
        applyMeta: async (meta: TransactionMeta) => {
          const idxCarMeta = meta as unknown as IdxMetaMap
          for (const [name, idx] of Object.entries(idxCarMeta.indexes)) {
            index({ _crdt: this }, name, undefined, idx as any)
          }
        },
        crypto,
        store
      },
      this.opts
    )
    this.ready = Promise.all([this.blockstore.ready, this.indexBlocks.ready]).then(() => {})
    this.clock.onZoom(() => {
      for (const idx of this.indexers.values()) {
        idx._resetIndex()
      }
    })
    this.clock.onTock(async () => {
      if (this.blockstore.loader && this.blockstore.loader.carLog.length < 100) return
      await this.compact()
    })
  }

  async bulk(updates: DocUpdate[], options?: object): Promise<CRDTMeta> {
    await this.ready
    const prevHead = [...this.clock.head]
    const meta = (await this.blockstore.transaction(
      async (tblocks: CarTransaction): Promise<TransactionMeta> => {
        const { head } = await applyBulkUpdateToCrdt(tblocks, this.clock.head, updates, options)
        updates = updates.map(({ key, value, del, clock }) => {
          readFiles(this.blockstore, { doc: value })
          return { key, value, del, clock }
        })
        return { head } as TransactionMeta
      }
    )) as CRDTMeta
    await this.clock.applyHead(meta.head, prevHead, updates)
    return meta
  }

  // if (snap) await this.clock.applyHead(crdtMeta.head, this.clock.head)

  async allDocs() {
    await this.ready
    const result: DocUpdate[] = []
    for await (const entry of getAllEntries(this.blockstore, this.clock.head)) {
      result.push(entry)
    }
    return { result, head: this.clock.head }
  }

  async vis() {
    await this.ready
    const txt = []
    for await (const line of clockVis(this.blockstore, this.clock.head)) {
      txt.push(line)
    }
    return txt.join('\n')
  }

  async getBlock(cidString: string) {
    await this.ready
    return await getBlock(this.blockstore, cidString)
  }

  async get(key: string) {
    await this.ready
    const result = await getValueFromCrdt(this.blockstore, this.clock.head, key)
    if (result.del) return null
    return result
  }

  async changes(since: ClockHead = [], opts: ChangesOptions = {}) {
    await this.ready
    return await clockChangesSince(this.blockstore, this.clock.head, since, opts)
  }

  async compact() {
    return await this.blockstore.compact()
  }
}
