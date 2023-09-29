/* eslint-disable import/first */
import { format, parse, ToString } from '@ipld/dag-json'
import { openDB, IDBPDatabase } from 'idb'
import { AnyBlock, AnyLink, DbMeta } from './types'
import { DataStore as DataStoreBase, MetaStore as MetaStoreBase } from './store'
import { RemoteWAL as RemoteWALBase, WALState } from './remote-wal'

// ts-unused-exports:disable-next-line
export class DataStore extends DataStoreBase {
  tag: string = 'car-browser-idb'
  idb: IDBPDatabase<unknown> | null = null

  async _withDB(dbWorkFun: (arg0: any) => any) {
    if (!this.idb) {
      const dbName = `fp.${this.STORAGE_VERSION}.${this.loader.keyId}.${this.loader.name}`
      this.idb = await openDB(dbName, 1, {
        upgrade(db): void {
          db.createObjectStore('cars')
        }
      })
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return await dbWorkFun(this.idb)
  }

  async load(cid: AnyLink): Promise<AnyBlock> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return await this._withDB(async (db: IDBPDatabase<unknown>) => {
      const tx = db.transaction(['cars'], 'readonly')
      const bytes = (await tx.objectStore('cars').get(cid.toString())) as Uint8Array
      if (!bytes) throw new Error(`missing idb block ${cid.toString()}`)
      return { cid, bytes }
    })
  }

  async save(car: AnyBlock): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return await this._withDB(async (db: IDBPDatabase<unknown>) => {
      const tx = db.transaction(['cars'], 'readwrite')
      await tx.objectStore('cars').put(car.bytes, car.cid.toString())
      return await tx.done
    })
  }

  async remove(cid: AnyLink): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return await this._withDB(async (db: IDBPDatabase<unknown>) => {
      const tx = db.transaction(['cars'], 'readwrite')
      await tx.objectStore('cars').delete(cid.toString())
      return await tx.done
    })
  }
}

// ts-unused-exports:disable-next-line

export class RemoteWAL extends RemoteWALBase {
  tag: string = 'wal-browser-ls'

  headerKey(branch: string) {
    // remove 'public' on next storage version bump
    return `fp.${this.STORAGE_VERSION}.wal.${this.loader.name}.${branch}`
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async load(branch = 'main'): Promise<WALState | null> {
    try {
      const bytesString = localStorage.getItem(this.headerKey(branch))
      if (!bytesString) return null
      return parse<WALState>(bytesString)
    } catch (e) {
      return null
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async save(state: WALState, branch = 'main'): Promise<void> {
    try {
      const encoded: ToString<WALState> = format(state)
      localStorage.setItem(this.headerKey(branch), encoded)
    } catch (e) {}
  }
}

// ts-unused-exports:disable-next-line
export class MetaStore extends MetaStoreBase {
  tag: string = 'header-browser-ls'

  headerKey(branch: string) {
    return `fp.${this.STORAGE_VERSION}.meta.${this.name}.${branch}`
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async load(branch: string = 'main'): Promise<DbMeta[] | null> {
    try {
      const bytesString = localStorage.getItem(this.headerKey(branch))
      if (!bytesString) return null
      // browser assumes a single writer process
      // to support concurrent updates to the same database across multiple tabs
      // we need to implement the same kind of mvcc.crdt solution as in store-fs and connect-s3
      return [this.parseHeader(bytesString)]
    } catch (e) {
      return null
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async save(meta: DbMeta, branch: string = 'main') {
    try {
      const headerKey = this.headerKey(branch)
      const bytes = this.makeHeader(meta)
      localStorage.setItem(headerKey, bytes)
      return null
    } catch (e) {
      return null
    }
  }
}
