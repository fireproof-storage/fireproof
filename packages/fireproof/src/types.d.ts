import type { Link } from 'multiformats'
import type { EventLink } from '@alanshaw/pail/clock'
import type { EventData } from '@alanshaw/pail/crdt'

export type FireproofOptions = {
  public?: boolean
  meta?: DbMeta
  persistIndexes?: boolean
}

export type ClockLink = EventLink<EventData>
export type ClockHead = ClockLink[]

export type DocFragment = string | number | boolean | null | DocFragment[] | { [key: string]: DocFragment }

export type Doc = DocBody & {
  _id?: string
}

export type DocFileMeta = {
  type: string;
  size: number;
  cid: AnyLink;
  car?: AnyLink;
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
  key?: string // these two can be richer than keys...
  prefix?: string | [string]
}

export type AnyLink = Link<unknown, number, number, 1 | 0>
export type AnyBlock = { cid: AnyLink; bytes: Uint8Array }
export type AnyDecodedBlock = { cid: AnyLink; bytes: Uint8Array, value: any }

export type BlockFetcher = { get: (link: AnyLink) => Promise<AnyBlock | undefined> }

type CallbackFn = (k: DocFragment, v?: DocFragment) => void

export type MapFn = (doc: Doc, map: CallbackFn) => DocFragment | void

export type DbMeta = { car: AnyLink, key: string | null }

export type CommitOpts = { noLoader?: boolean, compact?: boolean }

export interface CarMakeable {
  entries(): Iterable<AnyBlock>
  get(cid: AnyLink): Promise<AnyBlock | undefined>
}

export type UploadMetaFnParams = {
  name: string,
  branch: string,
}

export type UploadDataFnParams = {
  type: 'data' | 'file',
  name: string,
  car: string,
  size: string
}

export type MetaUploadFn = (bytes: Uint8Array, params: UploadMetaFnParams) => Promise<Uint8Array[] | null>
export type DataUploadFn = (bytes: Uint8Array, params: UploadDataFnParams) => Promise<void | AnyLink>

export type DownloadFnParamTypes = 'data' | 'file'

export type DownloadDataFnParams = {
  type: DownloadFnParamTypes,
  name: string,
  car: string,
}

export type DownloadMetaFnParams = {
  name: string,
  branch: string,
}

export type MetaDownloadFn = (params: DownloadMetaFnParams) => Promise<Uint8Array[] | null>

export type DataDownloadFn = (params: DownloadDataFnParams) => Promise<Uint8Array | null>

export type LoadHandler = (dbMetas: DbMeta[]) => Promise<void>

export interface Connection {
  ready: Promise<any>
  metaUpload: MetaUploadFn
  dataUpload: DataUploadFn
  metaDownload: MetaDownloadFn
  dataDownload: DataDownloadFn
  // remove: (params: DownloadFnParams) => Promise<void>
  refresh?: () => Promise<void>
}

export type ChangesOptions = {
  dirty?: boolean
  limit?: number
}
