import { format, parse, ToString } from '@ipld/dag-json'
import { AnyBlock, AnyLink, CommitOpts, DbMeta } from './types'

import { PACKAGE_VERSION } from './version'
import type { Loader } from './loader'
import { DbLoader } from './loaders'
// import { RemoteDataStore, RemoteMetaStore } from './store-remote'
const match = PACKAGE_VERSION.match(/^([^.]*\.[^.]*)/)
if (!match) throw new Error('invalid version: ' + PACKAGE_VERSION)
export const STORAGE_VERSION = match[0]

// const mockStore = new Map<string, ToString<WALState>>()

abstract class VersionedStore {
  STORAGE_VERSION: string = STORAGE_VERSION
  name: string
  constructor(name: string) {
    this.name = name
  }
}

export abstract class MetaStore extends VersionedStore {
  tag: string = 'header-base'

  makeHeader({ car, key }: DbMeta): ToString<DbMeta> {
    const encoded = format({ car, key } as DbMeta)
    return encoded
  }

  parseHeader(headerData: ToString<DbMeta>): DbMeta {
    const got = parse<DbMeta>(headerData)
    return got
  }

  abstract load(branch?: string): Promise<DbMeta[] | null>
  abstract save(dbMeta: DbMeta, branch?: string): Promise<DbMeta[] | null>
}

export type WALState = {
  operations: DbMeta[]
  noLoaderOps: DbMeta[]
  fileOperations: {cid: AnyLink, public: boolean}[]
}

export abstract class RemoteWAL {
  tag: string = 'rwal-base'

  STORAGE_VERSION: string = STORAGE_VERSION
  loader: Loader
  ready: Promise<void>

  walState: WALState = { operations: [], noLoaderOps: [], fileOperations: [] }
  processing: Promise<void> | undefined = undefined

  constructor(loader: Loader) {
    this.loader = loader
    this.ready = (async () => {
      const walState = await this.load().catch(e => {
        console.error('error loading wal', e)
        return null
      })
      this.walState.operations = walState?.operations || []
      this.walState.fileOperations = walState?.fileOperations || []
    })()
  }

  async enqueue(dbMeta: DbMeta, opts: CommitOpts) {
    await this.ready
    if (opts.noLoader) {
      this.walState.noLoaderOps.push(dbMeta)
    } else {
      this.walState.operations.push(dbMeta)
    }
    await this.save(this.walState)
    if (!opts.noLoader) { void this._process() }
  }

  async enqueueFile(fileCid: AnyLink, publicFile = false) {
    await this.ready
    this.walState.fileOperations.push({ cid: fileCid, public: publicFile })
    // await this.save(this.walState)
  }

  async _process() {
    await this.ready
    if (!this.loader.remoteCarStore) return
    if (this.processing) return this.processing
    const p = (async () => {
      await this._int_process()
    })()
    this.processing = p
    await p
    this.processing = undefined

    if (this.walState.operations.length || this.walState.fileOperations.length) setTimeout(() => void this._process(), 0)
  }

  async _int_process() {
    if (!this.loader.remoteCarStore) return
    const rmlp = (async () => {
      const operations = [...this.walState.operations]
      const fileOperations = [...this.walState.fileOperations]
      const noLoaderOps = [...this.walState.noLoaderOps]
      const uploads: Promise<void|AnyLink>[] = []

      if (operations.length) {
        for (const dbMeta of noLoaderOps.concat(operations)) {
          const uploadP = (async () => {
            const car = await this.loader.carStore!.load(dbMeta.car)
            if (!car) throw new Error(`missing car ${dbMeta.car.toString()}`)
            return await this.loader.remoteCarStore!.save(car)
          })()
          uploads.push(uploadP)
        }
      }
      if (fileOperations.length) {
        const dbLoader = this.loader as DbLoader
        for (const { cid: fileCid, public: publicFile } of fileOperations) {
          const uploadP = (async () => {
            const fileBlock = await dbLoader.fileStore!.load(fileCid)
            await dbLoader.remoteFileStore?.save(fileBlock, { public: publicFile })
          })()
          uploads.push(uploadP)
        }
      }

      await Promise.all(uploads)
      // clear operations, leaving any new ones that came in while we were uploading
      if (operations.length) {
        await this.loader.remoteMetaStore?.save(operations[operations.length - 1])
        this.walState.noLoaderOps.splice(0, noLoaderOps.length)
      }
      this.walState.operations.splice(0, operations.length)
      this.walState.fileOperations.splice(0, fileOperations.length)
      await this.save(this.walState)
    })()
    this.loader.remoteMetaLoading = rmlp
    await rmlp
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  // async load(branch = 'main'): Promise<WALState | null> {
  //   const got = mockStore.get(branch)
  //   if (!got) return null
  //   return parse<WALState>(got)
  // }

  // eslint-disable-next-line @typescript-eslint/require-await
  // async save(state: WALState, branch = 'main'): Promise<null> {
  //   const encoded: ToString<WALState> = format(state)
  //   mockStore.set(branch, encoded)
  //   return null
  // }

  abstract load(branch?: string): Promise<WALState | null>
  abstract save(state: WALState, branch?: string): Promise<void>
}

type DataSaveOpts = {
  public?: boolean
}

export abstract class DataStore {
  tag: string = 'car-base'

  STORAGE_VERSION: string = STORAGE_VERSION
  loader: Loader
  constructor(loader: Loader) {
    this.loader = loader
  }

  abstract load(cid: AnyLink): Promise<AnyBlock>
  abstract save(car: AnyBlock, opts?: DataSaveOpts): Promise<void|AnyLink>
  abstract remove(cid: AnyLink): Promise<void>
}
