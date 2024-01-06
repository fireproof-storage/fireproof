import type { Link } from 'multiformats'
import type { EventLink } from '@alanshaw/pail/clock'
import type { EventData } from '@alanshaw/pail/crdt'

import type { TransactionMeta } from '@fireproof/encrypted-blockstore'

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

export type Doc = DocBody & DocBase

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

type DocFiles = {
  [key: string]: File | DocFileMeta
}

type DocBody = {
  _files?: DocFiles
  _publicFiles?: DocFiles
  [key: string]: DocFragment
}

// type DocMeta = {
//   proof?: DocFragment
//   clock?: ClockHead
// }

export type DocUpdate = {
  key: string
  value?: { [key: string]: any }
  del?: boolean
  clock?: AnyLink
}
// todo merge into above
export type DocValue = {
  doc?: DocBody
  del?: boolean
}

export type IndexKey = [string, string] | string

export type IndexUpdate = {
  key: IndexKey
  value?: DocFragment
  del?: boolean
}

export type IndexRow = {
  id: string
  key: IndexKey
  row?: DocFragment
  doc?: Doc | null
  value?: DocFragment
  del?: boolean
}

export type CRDTMeta = {
  head: ClockHead
}

// export type FileMeta = {
//   files: { [key: string]: DocFileMeta }
// }

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
export type MapFn = (doc: Doc, emit: EmitFn) => DocFragment | void

export type ChangesOptions = {
  dirty?: boolean
  limit?: number
}

export type ChangesResponse = {
  clock: ClockHead
  rows: { key: string; value: Doc }[]
}

export type DbResponse = {
  id: string
  clock: ClockHead
}
