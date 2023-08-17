import type { Link } from 'multiformats'
import type { EventLink } from '@alanshaw/pail/clock'
import type { EventData } from '@alanshaw/pail/crdt'

export type FireproofOptions = {
  public?: boolean
}

export type ClockHead = EventLink<EventData>[]

export type DocFragment = string | number | boolean | null | DocFragment[] | { [key: string]: DocFragment }

export type Doc = DocBody & {
  _id?: string
}

type DocBody = {
  [key: string]: DocFragment
}

type DocMeta = {
  proof?: DocFragment
  clock?: ClockHead
}

export type DocUpdate = {
  key: string
  value?: { [key: string]: any}
  del?: boolean
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

type CarHeader = {
  cars: AnyLink[]
  compact: AnyLink[]
}

export type IdxMeta = {
  byId: AnyLink
  byKey: AnyLink
  map: string
  name: string
  head: ClockHead
}

type IdxMetaMap = {
  indexes: Map<string, IdxMeta>
}

export type IdxCarHeader = CarHeader & IdxMetaMap

export type DbCarHeader = CarHeader & {
  head: ClockHead
}

export type AnyCarHeader = DbCarHeader | IdxCarHeader

export type QueryOpts = {
  descending?: boolean
  limit?: number
  includeDocs?: boolean
  range?: [IndexKey, IndexKey]
  key?: string // these two can be richer than keys...
  prefix?: string | [string]
}

export type AnyLink = Link<unknown, number, number, 1 | 0>
export type AnyBlock = { cid: AnyLink; bytes: Uint8Array }
export type AnyDecodedBlock = { cid: AnyLink; bytes: Uint8Array, value: any }

export type BlockFetcher = { get: (link: AnyLink) => Promise<AnyBlock | undefined> }

type CallbackFn = (k: string, v?: DocFragment) => void

export type MapFn = (doc: Doc, map: CallbackFn) => DocFragment | void

export type DbMeta = { car: AnyLink, key: string | null }

export interface CarMakeable {
  entries(): Iterable<AnyBlock>
  get(cid: AnyLink): Promise<AnyBlock | undefined>
}
