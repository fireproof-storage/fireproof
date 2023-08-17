import { format, parse, ToString } from '@ipld/dag-json'
import { AnyBlock, AnyLink, DbMeta } from './types'

import { PACKAGE_VERSION } from './version'
const match = PACKAGE_VERSION.match(/^([^.]*\.[^.]*)/)
if (!match) throw new Error('invalid version: ' + PACKAGE_VERSION)
export const STORAGE_VERSION = match[0]

abstract class VersionedStore {
  STORAGE_VERSION: string = STORAGE_VERSION
}

export abstract class HeaderStore extends VersionedStore {
  tag: string = 'header-base'
  name: string
  constructor(name: string) {
    super()
    this.name = name
  }

  makeHeader({ car, key }: DbMeta): ToString<DbMeta> {
    const encoded = format({ car, key } as DbMeta)
    return encoded
  }

  parseHeader(headerData: ToString<DbMeta>): DbMeta {
    const got = parse<DbMeta>(headerData)
    return got
  }

  abstract load(branch?: string): Promise<DbMeta | null>
  abstract save(dbMeta: DbMeta, branch?: string): Promise<void>
}

export abstract class CarStore extends VersionedStore {
  tag: string = 'car-base'
  name: string
  constructor(name: string) {
    super()
    this.name = name
  }

  abstract load(cid: AnyLink): Promise<AnyBlock>
  abstract save(car: AnyBlock): Promise<void>
  abstract remove(cid: AnyLink): Promise<void>
}
