/* eslint-disable import/first */
console.log('import store-browser')

import { openDB, IDBPDatabase } from 'idb'
import { AnyBlock, AnyLink, DbMeta } from './types'
import { CarStore as CarStoreBase, HeaderStore as HeaderStoreBase } from './store'

export class CarStore extends CarStoreBase {
  tag: string = 'car-browser-idb'
  keyId: string = 'public'
  idb: IDBPDatabase<unknown> | null = null

  async _withDB(dbWorkFun: (arg0: any) => any) {
    if (!this.idb) {
      const dbName = `fp.${this.STORAGE_VERSION}.${this.keyId}.${this.name}`
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

export class HeaderStore extends HeaderStoreBase {
  tag: string = 'header-browser-ls'
  keyId: string = 'public'
  decoder: TextDecoder
  encoder: TextEncoder

  constructor(name: string) {
    super(name)
    this.decoder = new TextDecoder()
    this.encoder = new TextEncoder()
  }

  headerKey(branch: string) {
    return `fp.${this.STORAGE_VERSION}.${this.keyId}.${this.name}.${branch}`
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async load(branch: string = 'main'): Promise<DbMeta | null> {
    try {
      const bytesString = localStorage.getItem(this.headerKey(branch))
      if (!bytesString) return null
      return this.parseHeader(bytesString)
    } catch (e) {
      return null
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async save(meta: DbMeta, branch: string = 'main'): Promise<void> {
    try {
      const headerKey = this.headerKey(branch)
      const bytes = this.makeHeader(meta)
      return localStorage.setItem(headerKey, bytes)
    } catch (e) {}
  }
}
