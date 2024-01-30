import type { Link } from 'multiformats'
import { DataStore, MetaStore } from './store';
import { RemoteWAL } from './remote-wal';
import { Loader } from './loader';

export type AnyLink = Link<any, number, number, 1 | 0>
export type AnyAnyLink = Link<any, any, any, any>
export type AnyBlock = { cid: AnyLink; bytes: Uint8Array }
export type AnyAnyBlock = { cid: AnyAnyLink; bytes: Uint8Array }
export type AnyDecodedBlock = { cid: AnyLink; bytes: Uint8Array; value: any }

export interface CarMakeable {
  entries(): Iterable<AnyBlock>
  get(cid: AnyLink): Promise<AnyBlock | undefined>
}

export type CarHeader = {
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

export type TransactionMeta = Record<string, NestedData>;

export type CryptoOpts = {
  crypto: any,
  randomBytes: (size: number) => Uint8Array
}

export type StoreOpts = {
  makeMetaStore: (name: string) => MetaStore
  makeDataStore: (name: string) => DataStore
  makeRemoteWAL: (loader: Loader) => RemoteWAL
}
export type CommitOpts = { noLoader?: boolean; compact?: boolean; public?: boolean }

export type DbMeta = { car: AnyLink; key: string | null }
