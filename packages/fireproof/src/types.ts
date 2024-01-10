import type { Link } from 'multiformats'
import type { EventLink } from '@alanshaw/pail/clock'
import type { EventData } from '@alanshaw/pail/crdt'

import type { DbMeta } from '@fireproof/encrypted-blockstore'

export type ConfigOpts = {
  public?: boolean
  meta?: DbMeta
  persistIndexes?: boolean
}

// ts-unused-exports:disable-next-line
export type ClockLink = EventLink<EventData>

export type ClockHead = ClockLink[]

export type DocFragment =
  | Uint8Array
  | string
  | number
  | boolean
  | null
  | AnyLink
  | DocFragment[]
  | { [key: string]: DocFragment }

export type DocRecord = Record<string, DocFragment>;
export type Doc<T extends DocRecord = {}> = DocBase & DocBody<T>

export type DocBase = {
  _id?: string
  _files?: DocFiles
  _publicFiles?: DocFiles
}

export type DocFileMeta = {
  type: string
  size: number
  cid: AnyLink
  car?: AnyLink
  url?: string
  file?: () => Promise<File>
}

export type DocFiles = Record<string, DocFileMeta | File>;

export type DocBody<T extends DocRecord = {}> = {
  _id?: string;
} & { [K in Exclude<keyof T, keyof DocBase>]: DocFragment } & T

export type DocUpdate = {
  key: string
  value?: Record<string, any>
  del?: boolean
  clock?: AnyLink
}
// todo merge into above
export type DocValue = {
  doc?: DocBase
  del?: boolean
}

export type IndexKey = [string, string] | string

export type IndexUpdate = {
  key: IndexKey
  value?: DocFragment
  del?: boolean
}

export type IndexRow<T extends DocRecord = {}> = {
  id: string
  key: IndexKey
  row?: DocFragment
  doc?: Doc<T> | null
  value?: DocFragment
  del?: boolean
}

export type CRDTMeta = {
  head: ClockHead
}

export type IdxMeta = {
  byId: AnyLink
  byKey: AnyLink
  map: string
  name: string
  head: ClockHead
}

export type IdxMetaMap = {
  indexes: Map<string, IdxMeta>
}

export type QueryOpts = {
  descending?: boolean
  limit?: number
  includeDocs?: boolean
  range?: [IndexKey, IndexKey]
  key?: DocFragment
  keys?: DocFragment[]
  prefix?: DocFragment | [DocFragment]
}

export type AnyLink = Link<unknown, number, number, 1 | 0>
export type AnyBlock = { cid: AnyLink; bytes: Uint8Array }
export type AnyDecodedBlock = { cid: AnyLink; bytes: Uint8Array; value: any }

type EmitFn = (k: DocFragment, v?: DocFragment) => void
export type MapFn = <T extends DocRecord = {}>(doc: Doc<T>, emit: EmitFn) => DocFragment | void

export type ChangesOptions = {
  dirty?: boolean
  limit?: number
}

export type ChangesResponse<T extends DocRecord = {}> = {
  clock: ClockHead
  rows: { 
    key: string; 
    value: Doc<T> 
  }[]
}

export type DbResponse = {
  id: string
  clock: ClockHead
}
