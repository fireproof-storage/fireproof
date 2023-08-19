/* eslint-disable import/first */
// console.log('import store-node-fs')

import { join, dirname } from 'path'
import { homedir } from 'os'
import { mkdir, readFile, writeFile, unlink } from 'fs/promises'
import type { AnyBlock, AnyLink, DbMeta } from './types'
import { STORAGE_VERSION, MetaStore as MetaStoreBase, DataStore as DataStoreBase } from './store'

export class MetaStore extends MetaStoreBase {
  tag: string = 'header-node-fs'
  static dataDir: string = join(homedir(), '.fireproof', 'v' + STORAGE_VERSION, 'meta')

  async load(branch: string = 'main'): Promise<DbMeta | null> {
    const filepath = join(MetaStore.dataDir, this.name, branch + '.json')
    const bytes = await readFile(filepath).catch((e: Error & { code: string }) => {
      if (e.code === 'ENOENT') return null
      throw e
    })
    return bytes ? this.parseHeader(bytes.toString()) : null
  }

  async save(meta: DbMeta, branch: string = 'main'): Promise<void> {
    const filepath = join(MetaStore.dataDir, this.name, branch + '.json')
    const bytes = this.makeHeader(meta)
    await writePathFile(filepath, bytes)
  }
}

export const testConfig = {
  dataDir: MetaStore.dataDir
}

export class DataStore extends DataStoreBase {
  tag: string = 'car-node-fs'
  static dataDir: string = join(homedir(), '.fireproof', 'v' + STORAGE_VERSION, 'data')

  async save(car: AnyBlock): Promise<void> {
    const filepath = this.cidPath(car.cid)
    await writePathFile(filepath, car.bytes)
  }

  private cidPath(cid: AnyLink) {
    return join(DataStore.dataDir, this.name, cid.toString() + '.car')
  }

  async load(cid: AnyLink): Promise<AnyBlock> {
    const filepath = this.cidPath(cid)
    const bytes = await readFile(filepath)
    return { cid, bytes: new Uint8Array(bytes) }
  }

  async remove(cid: AnyLink): Promise<void> {
    const filepath = this.cidPath(cid)
    await unlink(filepath)
  }
}

async function writePathFile(path: string, data: Uint8Array | string) {
  await mkdir(dirname(path), { recursive: true })
  return await writeFile(path, data)
}
