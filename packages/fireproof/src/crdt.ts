import { TransactionBlockstore, IndexBlockstore } from './transaction'
import { clockChangesSince, applyBulkUpdateToCrdt, getValueFromCrdt, readFiles, getAllEntries, clockVis, getBlock, getThatBlock } from './crdt-helpers'
import type { DocUpdate, BulkResult, ClockHead, FireproofOptions, ChangesOptions } from './types'
import type { Index } from './index'
import { CRDTClock } from './crdt-clock'
import { DbLoader } from './loaders'

export class CRDT {
  name: string | null
  opts: FireproofOptions = {}
  ready: Promise<void>
  blocks: TransactionBlockstore
  indexBlocks: IndexBlockstore

  indexers: Map<string, Index> = new Map()

  clock: CRDTClock = new CRDTClock()
  // isCompacting = false
  // compacting : Promise<AnyLink|void> = Promise.resolve()
  // writing: Promise<BulkResult|void> = Promise.resolve()

  constructor(name?: string, opts?: FireproofOptions) {
    this.name = name || null
    this.opts = opts || this.opts
    this.blocks = new TransactionBlockstore(this.name, this.clock, this.opts)
    this.clock.blocks = this.blocks
    this.indexBlocks = new IndexBlockstore(
      this.opts.persistIndexes && this.name ? this.name + '.idx' : null,
      this,
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
    const loader = this.blocks.loader as DbLoader

    const prevHead = [...this.clock.head]

    const writing = (async () => {
      await loader?.compacting
      if (loader?.isCompacting) {
        throw new Error('cant bulk while compacting')
      }
      const got = await this.blocks.transaction(async (tblocks): Promise<BulkResult> => {
        const { head } = await applyBulkUpdateToCrdt(tblocks, this.clock.head, updates, options)
        updates = updates.map(({ key, value, del, clock }) => {
          readFiles(this.blocks, { doc: value })
          return { key, value, del, clock }
        })
        if (loader?.awaitingCompact) {
          console.log('missing?', head.toString())
        }
        if (loader?.isCompacting) {
          console.log('compacting?', head.toString())
        }
        return { head }
      })
      await this.clock.applyHead(got.head, prevHead, updates)
      return got
    })()
    if (loader) {
      const wr = loader.writing
      loader.writing = wr.then(async () => {
        loader.isWriting = true
        await writing
        loader.isWriting = false
        return wr
      })
    }
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

  async getThatBlock() {
    const blockJson = { cid: 'bafyreib7ee4pscqpuioxobmh3ac5xbbslypmaqqbkugalhw67hnco6dvoa', bytes: 'omRkYXRhpGNrZXl4JDAxOGFmNzdiLWZmMTUtNzI5Ny04ODZiLTYwMjViM2MxODI2ZWRyb2902CpYJQABcRIgKVLI53HO1TFDbPUoSaybd0mop2oX/CRFm1RrpiY4ne9kdHlwZWNwdXRldmFsdWXYKlglAAFxEiAGw53MVtPzeeGT/itfdLBfCVu6MTj96AHU6v9a3K/wYGdwYXJlbnRzgdgqWCUAAXESIJiL5qjdpgghUfbQLpKJeCgMX+ubhoTpYBoZHYdzbQJ/' }
    return await getThatBlock(blockJson)
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
    await this.ready
    if (this.blocks.loader) {
      await (this.blocks.loader as DbLoader).compact(this.blocks)
    }
  }
}
