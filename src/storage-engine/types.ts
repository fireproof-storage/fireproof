import type { Link } from "multiformats";
import { DataStore, MetaStore } from "./store";
import { RemoteWAL } from "./remote-wal";
import type { Loader } from "./loader";
import { F } from "vite/dist/node/types.d-aGj9QkWt";

export type AnyLink = Link<any, number, number, 1 | 0>;
export type CarGroup = AnyLink[];
export type CarLog = CarGroup[];
export type AnyAnyLink = Link<any, any, any, any>;
export type AnyBlock = { cid: AnyLink; bytes: Uint8Array };
export type AnyAnyBlock = { cid: AnyAnyLink; bytes: Uint8Array };
export type AnyDecodedBlock = { cid: AnyLink; bytes: Uint8Array; value: any };

export interface CarMakeable {
  entries(): Iterable<AnyBlock>;
  get(cid: AnyLink): Promise<AnyBlock | undefined>;
}

export type CarHeader = {
  readonly cars: CarLog;
  readonly compact: CarLog;
  readonly meta: TransactionMeta;
};

type NestedData =
  | Uint8Array
  | string
  | number
  | boolean
  | undefined
  | null
  | AnyLink
  | NestedData[]
  | { [key: string]: NestedData };

export type TransactionMeta = Record<string, NestedData>;

export interface CryptoOpts {
  readonly crypto: any;
  randomBytes(size: number): Uint8Array;
}

export interface StoreOpts {
  makeMetaStore(loader: Loader): MetaStore;
  makeDataStore(name: string): DataStore;
  makeRemoteWAL(loader: Loader): RemoteWAL;
}
export type CommitOpts = {
  readonly noLoader?: boolean;
  readonly compact?: boolean;
  readonly public?: boolean;
};

export type DbMeta = {
  readonly cars: CarGroup;
  readonly key?: string;
};

export type UploadMetaFnParams = {
  readonly name: string;
  readonly branch: string;
};

export type FnParamTypes = "data" | "file";

export type UploadDataFnParams = {
  readonly type: FnParamTypes;
  readonly name: string;
  readonly car: string;
  readonly size: string;
};

export type DownloadDataFnParams = {
  readonly type: FnParamTypes;
  readonly name: string;
  readonly car: string;
};

export type DownloadMetaFnParams = {
  readonly name: string;
  readonly branch: string;
};
