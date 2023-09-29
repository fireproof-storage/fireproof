import { format, parse, ToString } from '@ipld/dag-json'
import { AnyBlock, AnyLink, DbMeta } from './types'

import { PACKAGE_VERSION } from './version'
import type { Loader } from './loader'
const match = PACKAGE_VERSION.match(/^([^.]*\.[^.]*)/)
if (!match) throw new Error('invalid version: ' + PACKAGE_VERSION)
export const STORAGE_VERSION = match[0]

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
  abstract save(car: AnyBlock, opts?: DataSaveOpts): Promise<void | AnyLink>
  abstract remove(cid: AnyLink): Promise<void>
}
