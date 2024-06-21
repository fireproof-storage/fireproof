import type { CID, Link, Version } from "multiformats";
import { DataStore, MetaStore } from "./store";
import { RemoteWAL } from "./remote-wal";
import type { Loadable } from "./loader";
import { CRDTMeta, DocFileMeta } from "../types";

export type AnyLink = Link<unknown, number, number, Version>;
export type CarGroup = AnyLink[];
export type CarLog = CarGroup[];
export type AnyAnyLink = Link<unknown, number, number, Version>;

export type AnyLinkFn = (cid: AnyLink) => Promise<AnyBlock | undefined>;

export interface AnyBlock {
  readonly cid: Link<unknown, number, number, Version>;
  readonly bytes: Uint8Array;
}

export interface CIDBlock {
  readonly cid: CID<unknown, number, number, Version>;
  readonly bytes: Uint8Array;
}

export function toCIDBlock(block: AnyBlock): CIDBlock {
  return block as CIDBlock;
}
export interface AnyAnyBlock {
  readonly cid: AnyAnyLink;
  readonly bytes: Uint8Array;
}

export interface EncryptOpts {
  readonly key: ArrayBuffer;
  readonly cid: AnyLink;
  readonly bytes: Uint8Array;
}

export interface DecryptOptsValue {
  readonly bytes: Uint8Array;
  readonly iv: Uint8Array;
}

export interface DecryptOpts {
  readonly key: ArrayBuffer;
  readonly value: DecryptOptsValue;
}

export interface AnyDecodedBlock {
  readonly cid: AnyLink;
  readonly bytes: Uint8Array;
  readonly value: DecryptOptsValue;
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

// export interface MakeCodecCrypto {
//   subtle: {
//     decrypt: (algo: { name: string; iv: Uint8Array; tagLength: number }, key: CryptoKey, data: Uint8Array) => Promise<ArrayBuffer>;
//     encrypt: (algo: { name: string; iv: Uint8Array; tagLength: number }, key: CryptoKey, data: Uint8Array) => Promise<ArrayBuffer>;
//   };
// }

export interface CryptoOpts {
  // readonly crypto: MakeCodecCrypto; //| unknown;
  readonly importKey: typeof crypto.subtle.importKey;
  //(format: "raw", key: ArrayBuffer, algo: string, extractable: boolean, usages: string[]) => Promise<CryptoKey>;
  readonly decrypt: (
    algo: { name: string; iv: Uint8Array; tagLength: number },
    key: CryptoKey,
    data: Uint8Array,
  ) => Promise<ArrayBuffer>;
  readonly encrypt: (
    algo: { name: string; iv: Uint8Array; tagLength: number },
    key: CryptoKey,
    data: Uint8Array,
  ) => Promise<ArrayBuffer>;
  readonly digestSHA256: (data: Uint8Array) => Promise<ArrayBuffer>;
  readonly randomBytes: (size: number) => Uint8Array;
}

export interface BlobLike {
  /**
   * Returns a ReadableStream which yields the Blob data.
   */
  stream: () => ReadableStream;
}

export interface StoreOpts {
  readonly stores?: {
    // string means local storage
    // URL means schema selects the storeType
    readonly meta?: string | URL;
    readonly data?: string | URL;
    readonly indexes?: string | URL;
    readonly remoteWAL?: string | URL;
  };
  makeMetaStore?: (loader: Loadable) => Promise<MetaStore>;
  makeDataStore?: (loader: Loadable) => Promise<DataStore>;
  makeRemoteWAL?: (loader: Loadable) => Promise<RemoteWAL>;

  encodeFile?: (blob: BlobLike) => Promise<{ cid: AnyLink; blocks: AnyBlock[] }>;
  decodeFile?: (blocks: unknown, cid: AnyLink, meta: DocFileMeta) => Promise<File>;
}

export interface StoreRuntime {
  readonly stores: {
    readonly meta: URL;
    readonly data: URL;
    readonly indexes: URL;
    readonly remoteWAL: URL;
  };
  makeMetaStore(loader: Loadable): Promise<MetaStore>;
  makeDataStore(loader: Loadable): Promise<DataStore>;
  makeRemoteWAL(loader: Loadable): Promise<RemoteWAL>;
  encodeFile(blob: BlobLike): Promise<{ cid: AnyLink; blocks: AnyBlock[] }>;
  decodeFile(blocks: unknown, cid: AnyLink, meta: DocFileMeta): Promise<File>;
}

export interface CommitOpts {
  readonly noLoader?: boolean;
  readonly compact?: boolean;
  readonly public?: boolean;
}

export interface DbMeta {
  readonly cars: CarGroup;
  key?: string;
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
