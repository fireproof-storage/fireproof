import type { Link } from 'multiformats'
import type { EventLink } from '@alanshaw/pail/clock'
import type { EventData } from '@alanshaw/pail/crdt'
import { ClockHead, Doc } from './types'

export type FireproofOptions = {
  public?: boolean
  meta?: DbMeta
  persistIndexes?: boolean
}

// ts-unused-exports:disable-next-line
export type ClockLink = EventLink<EventData>

export type ClockHead = ClockLink[]

export type DocFragment = Uint8Array | string | number | boolean | null | DocFragment[] | { [key: string]: DocFragment }

export type Doc = DocBody & DocBase

export type DocBase = {
  _id?: string
  _files?: DocFiles
  _publicFiles?: DocFiles
}

export type DocFileMeta = {
  type: string;
  size: number;
  cid: AnyLink;
  car?: AnyLink;
  url?: string;
  file?: () => Promise<File>;
}

type DocFiles = {
  [key: string]: File | DocFileMeta
}

export type FileCarHeader = {
  files: AnyLink[]
}
type DocBody = {
  _files?: DocFiles
  _publicFiles?: DocFiles
  [key: string]: DocFragment
}

type DocMeta = {
  proof?: DocFragment
  clock?: ClockHead
}

export type DocUpdate = {
  key: string
  value?: { [key: string]: any }
  del?: boolean
  clock?: AnyLink
}

export type DocValue = {
  doc?: DocBody
  del?: boolean
}

type IndexCars = {
  [key: string]: AnyLink
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

type CarCommit = {
  car?: AnyLink
}

export type BulkResult = {
  head: ClockHead
}

export type FileResult = {
  files: { [key: string]: DocFileMeta }
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

type CarHeader = {
  cars: AnyLink[]
  compact: AnyLink[]
}

export type IdxCarHeader = CarHeader & IdxMetaMap

export type DbCarHeader = CarHeader & {
  head: ClockHead
}

export type AnyCarHeader = DbCarHeader | IdxCarHeader | FileCarHeader

export type CarLoaderHeader = DbCarHeader | IdxCarHeader

export type QueryOpts = {
  descending?: boolean
  limit?: number
  includeDocs?: boolean
  range?: [IndexKey, IndexKey]
  key?: DocFragment,
  keys?: DocFragment[]
  prefix?: DocFragment | [DocFragment]
}

export type AnyLink = Link<unknown, number, number, 1 | 0>
export type AnyBlock = { cid: AnyLink; bytes: Uint8Array }
export type AnyDecodedBlock = { cid: AnyLink; bytes: Uint8Array, value: any }

export type BlockFetcher = { get: (link: AnyLink) => Promise<AnyBlock | undefined> }

type CallbackFn = (k: DocFragment, v?: DocFragment) => void

export type MapFn = (doc: Doc, map: CallbackFn) => DocFragment | void

export type DbMeta = { car: AnyLink, key: string | null }

export type CommitOpts = { noLoader?: boolean, compact?: boolean, public?: boolean }

export interface CarMakeable {
  entries(): Iterable<AnyBlock>
  get(cid: AnyLink): Promise<AnyBlock | undefined>
}



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
