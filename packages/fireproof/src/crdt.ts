import { FireproofBlockstore, LoggingFetcher } from './transaction'
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
  BulkResult,
  ClockHead,
  FireproofOptions,
  ChangesOptions,
  CarHeader,
  IdxMetaMap,
  TransactionMeta
} from './types'
import type { Index } from './index'
import { index } from './index'
import { CRDTClock } from './crdt-clock'

export class CRDT {
  name: string | null
  opts: FireproofOptions = {}
  ready: Promise<void>
  blocks: FireproofBlockstore
  indexBlocks: FireproofBlockstore

  indexers: Map<string, Index> = new Map()

  clock: CRDTClock = new CRDTClock()

  constructor(name?: string, opts?: FireproofOptions) {
    this.name = name || null
    this.opts = opts || this.opts
    this.blocks = new FireproofBlockstore(
      this.name,
      {
        defaultHeaderMeta: { head: [] },
        applyMeta: async (meta: TransactionMeta, snap = false) => {
          const crdtMeta = meta as unknown as BulkResult
          if (snap) {
            await this.clock.applyHead(crdtMeta.head, this.clock.head)
          } else {
            await this.clock.applyHead(crdtMeta.head, [])
          }
        }
      },
      this.opts
    )
    this.clock.blocks = this.blocks
    this.indexBlocks = new FireproofBlockstore(
      this.opts.persistIndexes && this.name ? this.name + '.idx' : null,
      {
        defaultHeaderMeta: { indexes: {} },
        applyMeta: async (meta: TransactionMeta, snap = false) => {
          const idxCarMeta = meta as unknown as IdxMetaMap
          for (const [name, idx] of Object.entries(idxCarMeta.indexes)) {
            index({ _crdt: this }, name, undefined, idx as any)
          }
        }
      },
      this.opts
    )
    this.ready = Promise.all([this.blocks.ready, this.indexBlocks.ready]).then(() => {})
    this.clock.onZoom(() => {
      for (const idx of this.indexers.values()) {
        idx._resetIndex()
      }
    })
    this.clock.onTock(async () => {
      if (this.blocks.loader && this.blocks.loader.carLog.length < 100) return
      await this.compact()
    })
  }

  async bulk(updates: DocUpdate[], options?: object): Promise<BulkResult> {
    await this.ready
    // this error handling belongs in the transaction blockstore
    // const loader = this.blocks.loader as DbLoader

    const prevHead = [...this.clock.head]

    const writing = (async () => {
      // await loader?.compacting
      // if (loader?.isCompacting) {
      //   throw new Error('cant bulk while compacting')
      // }
      const got = (await this.blocks.transaction(async (tblocks): Promise<TransactionMeta> => {
        const { head } = await applyBulkUpdateToCrdt(tblocks, this.clock.head, updates, options)
        updates = updates.map(({ key, value, del, clock }) => {
          readFiles(this.blocks, { doc: value })
          return { key, value, del, clock }
        })
        // if (loader?.awaitingCompact) {
        //   console.log('missing?', head.toString())
        // }
        // if (loader?.isCompacting) {
        //   console.log('compacting?', head.toString())
        // }
        return { head } as TransactionMeta
      })) as BulkResult
      await this.clock.applyHead(got.head, prevHead, updates)
      return got
    })()
    // if (loader) {
    //   const wr = loader.writing
    //   loader.writing = wr.then(async () => {
    //     loader.isWriting = true
    //     await writing
    //     loader.isWriting = false
    //     return wr
    //   })
    // }
    return (await writing)!
  }

  async allDocs() {
    await this.ready
    const result: DocUpdate[] = []
    for await (const entry of getAllEntries(this.blocks, this.clock.head)) {
      result.push(entry)
    }
    return { result, head: this.clock.head }
  }

  async vis() {
    await this.ready
    const txt = []
    for await (const line of clockVis(this.blocks, this.clock.head)) {
      txt.push(line)
    }
    return txt.join('\n')
  }

  async getBlock(cidString: string) {
    await this.ready
    return await getBlock(this.blocks, cidString)
  }

  async get(key: string) {
    await this.ready
    const result = await getValueFromCrdt(this.blocks, this.clock.head, key)
    if (result.del) return null
    return result
  }

  async changes(since: ClockHead = [], opts: ChangesOptions = {}) {
    await this.ready
    return await clockChangesSince(this.blocks, this.clock.head, since, opts)
  }

  async compact() {
    return await this.blocks.compact(async (blockLog: LoggingFetcher) => {
      await doCompact(blockLog, this.clock.head)
      return { head: this.clock.head } as TransactionMeta
    })
  }
}
