/* eslint-disable import/first */
import { format, parse, ToString } from '@ipld/dag-json'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { mkdir, readFile, writeFile, unlink } from 'fs/promises'
import type { AnyBlock, AnyLink, DbMeta } from './types'
import { STORAGE_VERSION, MetaStore as MetaStoreBase, DataStore as DataStoreBase } from './store'
import { RemoteWAL as RemoteWALBase, WALState } from './remote-wal'
import type { Loadable, Loader } from './loader'

export const makeDataStore = (name: string) => new DataStore(name);
export const makeMetaStore = (loader: Loader) => new MetaStore(loader.name);
export const makeRemoteWAL = (loader: Loadable) => new RemoteWAL(loader);



export class RemoteWAL extends RemoteWALBase {
  filePathForBranch(branch: string): string {
    return join(MetaStore.dataDir, this.loader.name, 'wal', branch + '.json')
  }

  async load(branch = 'main'): Promise<WALState | null> {
    const filepath = this.filePathForBranch(branch)
    const bytes = await readFile(filepath).catch((e: Error & { code: string }) => {
      if (e.code === 'ENOENT') return null
      throw e
    })
    return bytes ? parse<WALState>(bytes.toString()) : null
  }

  async save(state: WALState, branch = 'main'): Promise<void> {
    const encoded: ToString<WALState> = format(state)
    const filepath = this.filePathForBranch(branch)
    await writePathFile(filepath, encoded)
  }
}


export class MetaStore extends MetaStoreBase {
  tag: string = 'header-node-fs'
  static dataDir: string = join(homedir(), '.fireproof', 'v' + STORAGE_VERSION)

  filePathForBranch(branch: string): string {
    return join(MetaStore.dataDir, this.name, 'meta', branch + '.json')
  }

  async load(branch: string = 'main'): Promise<DbMeta[] | null> {
    const filepath = this.filePathForBranch(branch)
    const bytes = await readFile(filepath).catch((e: Error & { code: string }) => {
      if (e.code === 'ENOENT') return null
      throw e
    })
    // currently FS is last-write-wins, assumes single writer process
    return bytes ? [this.parseHeader(bytes.toString())] : null
  }

  async save(meta: DbMeta, branch: string = 'main') {
    const filepath = this.filePathForBranch(branch)
    const bytes = this.makeHeader(meta)
    await writePathFile(filepath, bytes)
    return null
  }
}


export const testConfig = {
  dataDir: MetaStore.dataDir
}


export class DataStore extends DataStoreBase {
  tag: string = 'car-node-fs'
  static dataDir: string = join(homedir(), '.fireproof', 'v' + STORAGE_VERSION)

  async save(car: AnyBlock): Promise<void> {
    const filepath = this.cidPath(car.cid)
    await writePathFile(filepath, car.bytes)
  }

  private cidPath(cid: AnyLink) {
    return join(DataStore.dataDir, this.name, 'data', cid.toString() + '.car')
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
