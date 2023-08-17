/* eslint-disable import/first */
console.log('import store-node-fs')

import { join, dirname } from 'path'
import { homedir } from 'os'
import { mkdir, readFile, writeFile, unlink } from 'fs/promises'
import type { AnyBlock, AnyLink, DbMeta } from './types'
import { STORAGE_VERSION, HeaderStore as HeaderStoreBase, CarStore as CarStoreBase } from './store'

export class HeaderStore extends HeaderStoreBase {
  tag: string = 'header-node-fs'
  keyId: string = 'public'
  static dataDir: string = join(homedir(), '.fireproof', 'v' + STORAGE_VERSION)

  async load(branch: string = 'main'): Promise<DbMeta | null> {
    const filepath = join(HeaderStore.dataDir, this.name, branch + '.json')
    const bytes = await readFile(filepath).catch((e: Error & { code: string }) => {
      if (e.code === 'ENOENT') return null
      throw e
    })
    return bytes ? this.parseHeader(bytes.toString()) : null
  }

  async save(meta: DbMeta, branch: string = 'main'): Promise<void> {
    const filepath = join(HeaderStore.dataDir, this.name, branch + '.json')
    const bytes = this.makeHeader(meta)
    await writePathFile(filepath, bytes)
  }
}

export const testConfig = {
  dataDir: HeaderStore.dataDir
}

export class CarStore extends CarStoreBase {
  tag: string = 'car-node-fs'
  static dataDir: string = join(homedir(), '.fireproof', 'v' + STORAGE_VERSION)

  async save(car: AnyBlock): Promise<void> {
    const filepath = join(CarStore.dataDir, this.name, car.cid.toString() + '.car')
    await writePathFile(filepath, car.bytes)
  }

  async load(cid: AnyLink): Promise<AnyBlock> {
    const filepath = join(CarStore.dataDir, this.name, cid.toString() + '.car')
    const bytes = await readFile(filepath)
    return { cid, bytes: new Uint8Array(bytes) }
  }

  async remove(cid: AnyLink): Promise<void> {
    const filepath = join(CarStore.dataDir, this.name, cid.toString() + '.car')
    await unlink(filepath)
  }
}

async function writePathFile(path: string, data: Uint8Array | string) {
  await mkdir(dirname(path), { recursive: true })
  return await writeFile(path, data)
}
