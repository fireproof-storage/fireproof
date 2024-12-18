import type { EventLink } from "@web3-storage/pail/clock/api";
import type { Operation } from "@web3-storage/pail/crdt/api";

import type { DbMeta, AnyLink, StoreUrlsOpts, StoreEnDeFile, GatewayInterceptor } from "./blockstore/index.js";
import { EnvFactoryOpts, Env, Logger, CryptoRuntime, Result } from "@adviser/cement";

// import type { MakeDirectoryOptions, PathLike, Stats } from "fs";
import { KeyBagOpts } from "./runtime/key-bag.js";

export type { DbMeta };

export type Falsy = false | null | undefined;

export function isFalsy(value: unknown): value is Falsy {
  return value === false && value === null && value === undefined;
}

export enum PARAM {
  SUFFIX = "suffix",
  URL_GEN = "urlGen", // "urlGen" | "default"
  STORE_KEY = "storekey",
  STORE = "store",
  KEY = "key",
  INDEX = "index",
  NAME = "name",
  VERSION = "version",
  FRAG_SIZE = "fragSize",
  IV_VERIFY = "ivVerify",
  IV_HASH = "ivHash",
  FRAG_FID = "fid",
  FRAG_OFS = "ofs",
  FRAG_LEN = "len",
  FRAG_HEAD = "headerSize",
  EXTRACTKEY = "extractKey",
  // FS = "fs",
}

export function throwFalsy<T>(value: T | Falsy): T {
  if (isFalsy(value)) {
    throw new Error("value is Falsy");
  }
  return value;
}

export function falsyToUndef<T>(value: T | Falsy): T | undefined {
  if (isFalsy(value)) {
    return undefined;
  }
  return value;
}

export type StoreType = "data" | "wal" | "meta";
export interface FPStats {
  isFile(): boolean;
  isDirectory(): boolean;
  isBlockDevice(): boolean;
  isCharacterDevice(): boolean;
  isSymbolicLink(): boolean;
  isFIFO(): boolean;
  isSocket(): boolean;
  uid: number | Falsy;
  gid: number | Falsy;
  size: number | Falsy;
  atime: Date | Falsy;
  mtime: Date | Falsy;
  ctime: Date | Falsy;
  birthtime: Date | Falsy;
}

export interface SysFileSystem {
  start(): Promise<SysFileSystem>;
  mkdir(path: string, options?: { recursive: boolean }): Promise<string | undefined>;
  readdir(path: string /*, options?: unknown*/): Promise<string[]>;
  rm(path: string, options?: { recursive: boolean }): Promise<void>;
  copyFile(source: string, destination: string): Promise<void>;
  readfile(path: string /*, options?: { encoding: BufferEncoding; flag?: string }*/): Promise<Uint8Array>;
  stat(path: string): Promise<FPStats>;
  unlink(path: string): Promise<void>;
  writefile(path: string, data: Uint8Array | string): Promise<void>;
}

export interface PathOps {
  join(...args: string[]): string;
  dirname(path: string): string;
  basename(path: string): string;
}

export type ToUInt8 = Uint8Array | Result<Uint8Array>;
export type PromiseToUInt8 = ToUInt8 | Promise<Uint8Array> | Promise<Result<Uint8Array>>;

export interface TextEndeCoder {
  encode(input: string): Uint8Array;
  decode(input: ToUInt8): string;
}
export interface SuperThisOpts {
  // readonly crypto?: CryptoRuntime;
  readonly logger: Logger;
  readonly pathOps: PathOps;
  readonly crypto: CryptoRuntime;
  readonly env: EnvFactoryOpts;
  readonly txt: TextEndeCoder;
  readonly ctx: Record<string, unknown>;
}

export interface SuperThis {
  readonly logger: Logger;
  readonly env: Env;
  readonly pathOps: PathOps;
  readonly ctx: Record<string, unknown>;
  readonly txt: TextEndeCoder;
  timeOrderedNextId(time?: number): { str: string; toString: () => string };
  nextId(bytes?: number): { str: string; bin: Uint8Array; toString: () => string };
  start(): Promise<void>;
  clone(override: Partial<SuperThisOpts>): SuperThis;
}

export interface ConfigOpts extends Partial<SuperThisOpts> {
  readonly public?: boolean;
  readonly meta?: DbMeta;
  // readonly persistIndexes?: boolean;
  readonly gatewayInterceptor?: GatewayInterceptor;
  readonly autoCompact?: number;
  readonly storeUrls?: StoreUrlsOpts;
  readonly storeEnDe?: StoreEnDeFile;
  readonly threshold?: number;
  readonly keyBag?: Partial<KeyBagOpts>;
}

export type ClockLink = EventLink<Operation>;

export type ClockHead = ClockLink[];

export type DocFragment = Uint8Array | string | number | boolean | null | AnyLink | DocFragment[] | object;
// | { [key: string]: DocFragment };

export type DocLiteral = string | number | boolean | Uint8Array | unknown;

export type DocObject = NonNullable<unknown>;
export type DocTypes = DocObject;

export type DocRecord<T extends DocObject> = T;

export type UnknownDoc = DocRecord<never>;

export type DocFiles = Record<string, DocFileMeta | File>;

export interface DocBase {
  readonly _id: string;
  readonly _files?: DocFiles;
  readonly _publicFiles?: DocFiles;
  readonly _deleted?: boolean;
}

export type DocWithId<T extends DocTypes> = DocBase & T;

export type DocSet<T extends DocTypes> = Partial<DocBase> & T;

export interface DocFileMeta {
  readonly type: string;
  readonly size: number;
  readonly cid: AnyLink;
  readonly car?: AnyLink;
  url?: string;
  file?: () => Promise<File>;
}

export interface DocUpdate<T extends DocTypes> {
  readonly id: string;
  readonly value?: DocSet<T>;
  readonly del?: boolean;
  readonly clock?: ClockLink; // would be useful to give ClockLinks a type
}

// todo merge into above
export interface DocValue<T extends DocTypes> {
  readonly doc: DocWithId<T>;
  readonly del: boolean;
  readonly cid: AnyLink;
}

export type KeyLiteral = string | number | boolean;
export type IndexKeyType = KeyLiteral | KeyLiteral[];
export type IndexKey<K extends IndexKeyType> = [K, string];

export interface IndexUpdate<K extends IndexKeyType> {
  readonly key: IndexKey<K>;
  readonly value?: DocFragment;
  readonly del?: boolean;
}

export interface IndexUpdateString {
  readonly key: string;
  readonly value?: DocFragment;
  readonly del?: boolean;
}

// export interface IndexRowObject<K extends IndexKeyType, T extends DocObject> {
//   readonly id: string;
//   readonly key: K;
//   readonly value: T
//   // readonly row: T // DocFragment;
//   // readonly doc?: DocWithId<T>;
//   // value?: T;
//   // readonly del?: boolean;
// }

// export interface IndexRowLiteral<K extends IndexKeyType, T extends DocLiteral> {
//   readonly id: string;
//   readonly key: IndexKey<K>;
//   readonly value: T
// }

// export type IndexRow<K extends IndexKeyType, T extends DocTypes> =
//   T extends DocLiteral ? IndexRowLiteral<K, T> : IndexRowObject<K, T>

export interface IndexRow<K extends IndexKeyType, T extends DocObject, R extends DocFragment> {
  readonly id: string;
  readonly key: K; // IndexKey<K>;
  readonly value: R;
  readonly doc?: DocWithId<T>;
}

export interface IndexRows<K extends IndexKeyType, T extends DocObject, R extends DocFragment = T> {
  readonly rows: IndexRow<K, T, R>[];
}
export interface CRDTMeta {
  readonly head: ClockHead;
}

export interface IndexTransactionMeta {
  readonly indexes: Record<string, IdxMeta>;
}

export interface FileTransactionMeta {
  readonly files?: AnyLink[];
}

export type MetaType = CRDTMeta | IndexTransactionMeta | FileTransactionMeta;

export interface IdxMeta {
  readonly byId: AnyLink;
  readonly byKey: AnyLink;
  readonly map: string;
  readonly name: string;
  readonly head: ClockHead;
}

export interface IdxMetaMap {
  readonly indexes?: Map<string, IdxMeta>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface QueryOpts<K extends IndexKeyType> {
  readonly descending?: boolean;
  readonly limit?: number;
  includeDocs?: boolean;
  readonly range?: [IndexKeyType, IndexKeyType];
  readonly key?: DocFragment;
  readonly keys?: DocFragment[];
  prefix?: IndexKeyType;
}

export interface AllDocsQueryOpts extends QueryOpts<string> {
  readonly key?: string;
  readonly keys?: string[];
  prefix?: string;
}

export type QueryStreamMarker = { kind: "preexisting"; done: boolean } | { kind: "new" };

export interface QueryResponse<T extends DocTypes> {
  snapshot(): Promise<DocWithId<T>[]>;
  live(opts?: { since?: ClockHead }): ReadableStream<{ doc: DocWithId<T>; marker: QueryStreamMarker }>;
  future(): ReadableStream<{ doc: DocWithId<T>; marker: QueryStreamMarker }>;
}

type EmitFn = (k: IndexKeyType, v?: DocFragment) => void;
export type MapFn<T extends DocTypes> = (doc: DocWithId<T>, emit: EmitFn) => DocFragment | unknown;

export interface ChangesOptions {
  readonly dirty?: boolean;
  readonly limit?: number;
}

export interface ChangesResponseRow<T extends DocTypes> {
  readonly key: string;
  readonly value: DocWithId<T>;
  readonly clock?: ClockLink;
}

export interface ChangesResponse<T extends DocTypes> {
  readonly clock: ClockHead;
  readonly rows: ChangesResponseRow<T>[];
  readonly name?: string;
}

export interface DocResponse {
  readonly id: string;
  readonly clock: ClockHead;
  readonly name?: string;
}

export type UpdateListenerFn<T extends DocTypes> = (docs: DocWithId<T>[]) => Promise<void> | void;
export type NoUpdateListenerFn = () => Promise<void> | void;
export type ListenerFn<T extends DocTypes> = UpdateListenerFn<T> | NoUpdateListenerFn;
