import type { Link } from 'multiformats'

export type AnyLink = Link<unknown, number, number, 1 | 0>
export type AnyBlock = { cid: AnyLink; bytes: Uint8Array }
export type AnyDecodedBlock = { cid: AnyLink; bytes: Uint8Array; value: any }

export interface CarMakeable {
  entries(): Iterable<AnyBlock>
  get(cid: AnyLink): Promise<AnyBlock | undefined>
}

type CarHeader = {
  cars: AnyLink[]
  compact: AnyLink[]
  meta: TransactionMeta
}

type NestedData =
  | Uint8Array
  | string
  | number
  | boolean
  | null
  | AnyLink
  | NestedData[]
  | { [key: string]: NestedData }

export type TransactionMeta = {
  [key: string]: NestedData
}

export type CryptoOpts = {
  crypto: any,
  randomBytes: (size: number) => Uint8Array
}

export type StoreOpts = {
  MetaStore: any
  DataStore: any
  RemoteWAL: any
}

export type CommitOpts = { noLoader?: boolean; compact?: boolean; public?: boolean }

export type DbMeta = { car: AnyLink; key: string | null }
