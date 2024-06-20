import type { CID, Link } from "multiformats";
import { DataStore, MetaStore } from "./store";
import { RemoteWAL } from "./remote-wal";
import type { Loader } from "./loader";
import { CRDTMeta } from "../types";

export type AnyLink = Link<unknown, number, number, 1 | 0>;
export type CarGroup = AnyLink[];
export type CarLog = CarGroup[];
export type AnyAnyLink = Link<unknown, number, number, 1>;
export interface AnyBlock {
  cid: AnyLink;
  bytes: Uint8Array;
}
export interface AnyAnyBlock {
  cid: AnyAnyLink;
  bytes: Uint8Array;
}
export interface AnyDecodedBlock {
  cid: AnyLink;
  bytes: Uint8Array;
  value: unknown;
}

export interface CarMakeable {
  entries(): Iterable<AnyBlock>;
  get(cid: AnyLink): Promise<AnyBlock | undefined>;
}

export interface CarHeader<T> {
  readonly cars: CarLog;
  readonly compact: CarLog;
  readonly meta: T;
}

// type NestedData =
//   | Uint8Array
//   | string
//   | number
//   | boolean
//   | undefined
//   | null
//   | AnyLink
//   | NestedData[]
//   | { [key: string]: NestedData };

export interface IdxMeta {
  readonly byId: CID;
  readonly byKey: CID;
  readonly head: CarGroup;
  readonly name: string;
  readonly map: string; // is this really a string of javascript who is eval'd?
}
export interface IndexTransactionMeta {
  readonly indexes: Record<string, IdxMeta>;
  readonly cars?: CarGroup;
}
// // Record<string, NestedData>;
export type TransactionMeta = CRDTMeta & {
  readonly cars?: CarGroup;
  readonly files?: AnyLink[];
};
// export type TransactionMeta = {
//   readonly head: ClockHead;
// };

export type MetaType = TransactionMeta | IndexTransactionMeta;

export interface CryptoOpts {
  readonly crypto: unknown;
  randomBytes(size: number): Uint8Array;
}

export interface StoreOpts {
  makeMetaStore(loader: Loader): MetaStore;
  makeDataStore(name: string): DataStore;
  makeRemoteWAL(loader: Loader): RemoteWAL;
}
export interface CommitOpts {
  readonly noLoader?: boolean;
  readonly compact?: boolean;
  readonly public?: boolean;
}

export interface DbMeta {
  readonly cars: CarGroup;
  readonly key?: string;
}

export interface UploadMetaFnParams {
  readonly name: string;
  readonly branch: string;
}

export type FnParamTypes = "data" | "file";

export interface UploadDataFnParams {
  readonly type: FnParamTypes;
  readonly name: string;
  readonly car: string;
  readonly size: string;
}

export interface DownloadDataFnParams {
  readonly type: FnParamTypes;
  readonly name: string;
  readonly car: string;
}

export interface DownloadMetaFnParams {
  readonly name: string;
  readonly branch: string;
}
