import type { EventLink } from "@fireproof/vendor/@web3-storage/pail/clock/api";
import type { Operation } from "@fireproof/vendor/@web3-storage/pail/crdt/api";
import type { Block, UnknownLink, Version } from "multiformats";
import type { EnvFactoryOpts, Env, Logger, CryptoRuntime, Result, CoerceURI } from "@adviser/cement";

import type {
  CarTransactionOpts,
  DbMeta,
  AnyLink,
  StoreUrlsOpts,
  StoreEnDeFile,
  SerdeGatewayInterceptor,
  Loadable,
  AnyBlock,
  TransactionMeta,
  TransactionWrapper,
  BlockstoreRuntime,
  StoreURIRuntime,
  DataAndMetaAndWalStore,
  UrlAndInterceptor,
  MetaStore,
  WALStore,
  BaseStore,
  FileStore,
  CarStore,
} from "./blockstore/index.js";

// import type { MakeDirectoryOptions, PathLike, Stats } from "fs";
import type { KeyBagOpts, KeyBagRuntime } from "./runtime/key-bag.js";
import type { WriteQueueParams } from "./write-queue.js";
import type { Index } from "./indexer.js";
import type { Context } from "./context.js";

export type { DbMeta };

export type Falsy = false | null | undefined;

export type Unreg = () => void;

export function isFalsy(value: unknown): value is Falsy {
  return value === false && value === null && value === undefined;
}

export const PARAM = {
  SUFFIX: "suffix",
  URL_GEN: "urlGen", // "urlGen" | "default"
  STORE_KEY: "storekey",
  STORE: "store",
  KEY: "key",
  INDEX: "index",
  NAME: "name",
  VERSION: "version",
  RUNTIME: "runtime", // "node" | "deno" | "browser"
  FRAG_SIZE: "fragSize",
  IV_VERIFY: "ivVerify",
  IV_HASH: "ivHash",
  FRAG_FID: "fid",
  FRAG_OFS: "ofs",
  FRAG_LEN: "len",
  FRAG_HEAD: "headerSize",
  EXTRACTKEY: "extractKey",
  SELF_REFLECT: "selfReflect", // if no subscribe in Gateway see your own META updates
  CAR_PARALLEL: "parallel",
  CAR_CACHE_SIZE: "carCacheSize",
  CAR_COMPACT_CACHE_SIZE: "carCompactCacheSize",
  CAR_META_CACHE_SIZE: "carMetaCacheSize",
  GENESIS_CID: "baembeiarootfireproofgenesisblockaaaafireproofgenesisblocka",
  // FS = "fs",
};
export type PARAMS = (typeof PARAM)[keyof typeof PARAM];

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

export type StoreType = "car" | "file" | "wal" | "meta";
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
  readonly env: Partial<EnvFactoryOpts>;
  readonly txt: TextEndeCoder;
  readonly ctx: Record<string, unknown>;
}

export interface SuperThis {
  readonly logger: Logger;
  readonly loggerCollector?: Logger;
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
  readonly writeQueue?: Partial<WriteQueueParams>;
  readonly gatewayInterceptor?: SerdeGatewayInterceptor;
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
  readonly lastModified?: number;
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

export interface AllDocsResponse<T extends DocTypes> {
  readonly rows: {
    readonly key: string;
    readonly value: DocWithId<T>;
  }[];
  readonly clock: ClockHead;
  readonly name?: string;
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

export interface BulkResponse {
  readonly ids: string[];
  readonly clock: ClockHead;
  readonly name?: string;
}

export type UpdateListenerFn<T extends DocTypes> = (docs: DocWithId<T>[]) => Promise<void> | void;
export type NoUpdateListenerFn = () => Promise<void> | void;
export type ListenerFn<T extends DocTypes> = UpdateListenerFn<T> | NoUpdateListenerFn;

export interface CRDTEntry {
  readonly data: string;
  readonly parents: string[];
  readonly cid: string;
}

export type VoidFn = () => void;
export type UnReg = () => void;
export interface CRDTClock {
  readonly head: ClockHead;
  onTock(fn: VoidFn): UnReg;
  onTick(fn: (updates: DocUpdate<DocTypes>[]) => void): UnReg;
  applyHead(newHead: ClockHead, prevHead: ClockHead, updates?: DocUpdate<DocTypes>[]): Promise<void>;
  onZoom(fn: VoidFn): UnReg;
  close(): Promise<void>;
  ready(): Promise<void>;
}

export interface CarTransaction {
  readonly parent: BaseBlockstore;
  get<T, C extends number, A extends number, V extends Version>(cid: AnyLink): Promise<Block<T, C, A, V> | undefined>;

  superGet(cid: AnyLink): Promise<AnyBlock | undefined>;

  // needed for genesis block
  unshift(cid: UnknownLink, bytes: Uint8Array<ArrayBufferLike>): void;
  putSync(cid: UnknownLink, bytes: Uint8Array<ArrayBufferLike>): void;

  put(cid: UnknownLink, bytes: Uint8Array<ArrayBufferLike>): Promise<void>;

  entries(): AsyncIterableIterator<AnyBlock>;
}

export interface BaseBlockstore {
  readonly transactions: Set<CarTransaction>;
  readonly sthis: SuperThis;
  readonly loader: Loadable;
  readonly ebOpts: BlockstoreRuntime;
  ready(): Promise<void>;
  close(): Promise<void>;
  destroy(): Promise<void>;
  compact(): Promise<void>;
  readonly logger: Logger;

  get<T, C extends number, A extends number, V extends Version>(cid: AnyLink): Promise<Block<T, C, A, V> | undefined>;
  put(cid: UnknownLink, bytes: Uint8Array<ArrayBufferLike>): Promise<void>;

  transaction<M extends TransactionMeta>(
    fn: (t: CarTransaction) => Promise<M>,
    _opts?: CarTransactionOpts,
  ): Promise<TransactionWrapper<M>>;

  // get<T, C extends number, A extends number, V extends Version>(cid: AnyAnyLink): Promise<Block<T, C, A, V> | undefined>
  // transaction<M extends TransactionMeta>(
  //   fn: (t: CarTransaction) => Promise<M>,
  //   _opts?: CarTransactionOpts,
  // ): Promise<TransactionWrapper<M>>

  openTransaction(opts: CarTransactionOpts /* = { add: true, noLoader: false }*/): CarTransaction;

  commitTransaction<M extends TransactionMeta>(
    t: CarTransaction,
    done: M,
    opts: CarTransactionOpts,
  ): Promise<TransactionWrapper<M>>;
  entries(): AsyncIterableIterator<AnyBlock>;
}

export interface CRDT extends ReadyCloseDestroy, HasLogger, HasSuperThis, HasCRDT {
  readonly logger: Logger;
  readonly sthis: SuperThis;
  // self reference to fullfill HasCRDT
  readonly crdt: CRDT;
  readonly clock: CRDTClock;

  readonly blockstore: BaseBlockstore;
  readonly indexBlockstore: BaseBlockstore;
  readonly indexers: Map<string, Index<IndexKeyType, DocTypes>>;

  bulk<T extends DocTypes>(updates: DocUpdate<T>[]): Promise<CRDTMeta>;
  ready(): Promise<void>;
  close(): Promise<void>;
  destroy(): Promise<void>;
  allDocs<T extends DocTypes>(): Promise<{ result: DocUpdate<T>[]; head: ClockHead }>;
  vis(): Promise<string>;
  getBlock(cidString: string): Promise<Block>;
  get(key: string): Promise<DocValue<DocTypes> | Falsy>;
  // defaults by impl
  changes<T extends DocTypes>(
    since?: ClockHead,
    opts?: ChangesOptions,
  ): Promise<{
    result: DocUpdate<T>[];
    head: ClockHead;
  }>;
  compact(): Promise<void>;
}

export interface HasCRDT {
  readonly crdt: CRDT;
}

export interface RefLedger {
  readonly ledger: Ledger;
}

export interface HasLogger {
  readonly logger: Logger;
}

export interface HasSuperThis {
  readonly sthis: SuperThis;
}

export interface ReadyCloseDestroy {
  close(): Promise<void>;
  destroy(): Promise<void>;
  ready(): Promise<void>;
}

export interface CoerceURIandInterceptor {
  readonly url: CoerceURI;
  readonly gatewayInterceptor?: SerdeGatewayInterceptor;
}

/**
 * @description used by an attachable do define the urls of the attached gateways
 */
export interface GatewayUrlsParam {
  readonly car: CoerceURIandInterceptor;
  readonly file: CoerceURIandInterceptor;
  readonly meta: CoerceURIandInterceptor;
  // if set this is a local Attachment
  readonly wal?: CoerceURIandInterceptor;
}

export interface GatewayUrls {
  readonly car: UrlAndInterceptor;
  readonly file: UrlAndInterceptor;
  readonly meta: UrlAndInterceptor;
  readonly wal?: UrlAndInterceptor;
}

export interface Attachable {
  readonly name: string;
  /**
   * @description prepare allows the Attable to register the gateways and
   * then return the urls of the gateways
   */
  prepare(): Promise<GatewayUrlsParam>;
}

export class DataAndMetaAndWalAndBaseStore implements DataAndMetaAndWalStore {
  readonly wal?: WALStore | undefined;
  readonly file: FileStore;
  readonly car: CarStore;
  readonly meta: MetaStore;
  readonly baseStores: BaseStore[];

  constructor(dam: DataAndMetaAndWalStore) {
    this.wal = dam.wal;
    this.file = dam.file;
    this.car = dam.car;
    this.meta = dam.meta;
    this.baseStores = [this.file, this.car, this.meta];
    if (this.wal) {
      this.baseStores.push(this.wal);
    }
  }
}

export interface Attached {
  readonly gatewayUrls: GatewayUrls;

  readonly stores: DataAndMetaAndWalAndBaseStore;

  detach(): Promise<void>;
  status(): "attached" | "loading" | "loaded" | "error" | "detached" | "syncing" | "idle";
}

export interface Database extends ReadyCloseDestroy, HasLogger, HasSuperThis {
  // readonly name: string;
  readonly ledger: Ledger;
  readonly logger: Logger;
  readonly sthis: SuperThis;
  readonly id: string;
  readonly name: string;

  onClosed(fn: () => void): void;

  attach(a: Attachable): Promise<Attached>;

  get<T extends DocTypes>(id: string): Promise<DocWithId<T>>;
  put<T extends DocTypes>(doc: DocSet<T>): Promise<DocResponse>;
  bulk<T extends DocTypes>(docs: DocSet<T>[]): Promise<BulkResponse>;
  del(id: string): Promise<DocResponse>;
  remove(id: string): Promise<DocResponse>;
  changes<T extends DocTypes>(since?: ClockHead, opts?: ChangesOptions): Promise<ChangesResponse<T>>;
  allDocs<T extends DocTypes>(opts?: AllDocsQueryOpts): Promise<AllDocsResponse<T>>;
  allDocuments<T extends DocTypes>(): Promise<{
    rows: {
      key: string;
      value: DocWithId<T>;
    }[];
    clock: ClockHead;
  }>;
  subscribe<T extends DocTypes>(listener: ListenerFn<T>, updates?: boolean): () => void;

  query<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T>(
    field: string | MapFn<T>,
    opts?: QueryOpts<K>,
  ): Promise<IndexRows<K, T, R>>;
  compact(): Promise<void>;
}

export interface WriteQueue<T extends DocUpdate<S>, S extends DocTypes = DocTypes> {
  push(task: T): Promise<MetaType>;
  bulk(tasks: T[]): Promise<MetaType>;
  close(): Promise<void>;
}

export interface LedgerOpts {
  readonly name: string;
  // readonly public?: boolean;
  readonly meta?: DbMeta;
  readonly gatewayInterceptor?: SerdeGatewayInterceptor;

  readonly writeQueue: WriteQueueParams;
  // readonly factoryUnreg?: () => void;
  // readonly persistIndexes?: boolean;
  // readonly autoCompact?: number;
  readonly storeUrls: StoreURIRuntime;
  readonly storeEnDe: StoreEnDeFile;
  readonly keyBag: KeyBagRuntime;
  // readonly threshold?: number;
}

export interface Ledger extends HasCRDT {
  readonly opts: LedgerOpts;
  // readonly name: string;
  readonly writeQueue: WriteQueue<DocUpdate<DocTypes>>;

  readonly logger: Logger;
  readonly sthis: SuperThis;
  readonly id: string;

  readonly name: string;

  readonly context: Context;

  onClosed(fn: () => void): () => void;

  attach(a: Attachable): Promise<Attached>;

  close(): Promise<void>;
  destroy(): Promise<void>;
  ready(): Promise<void>;

  subscribe<T extends DocTypes>(listener: ListenerFn<T>, updates?: boolean): () => void;

  // asDB(): Database;

  // get<T extends DocTypes>(id: string): Promise<DocWithId<T>>;
  // put<T extends DocTypes>(doc: DocSet<T>): Promise<DocResponse>;
  // bulk<T extends DocTypes>(docs: DocSet<T>[]): Promise<BulkResponse>;
  // del(id: string): Promise<DocResponse>;
  // changes<T extends DocTypes>(since?: ClockHead, opts?: ChangesOptions): Promise<ChangesResponse<T>>;
  // allDocs<T extends DocTypes>(opts?: AllDocsQueryOpts): Promise<AllDocsResponse<T>>;
  // allDocuments<T extends DocTypes>(): Promise<{
  //   rows: {
  //     key: string;
  //     value: DocWithId<T>;
  //   }[];
  //   clock: ClockHead;
  // }>;
  // subscribe<T extends DocTypes>(listener: ListenerFn<T>, updates?: boolean): () => void;

  // query<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T>(
  //   field: string | MapFn<T>,
  //   opts?: QueryOpts<K>,
  // ): Promise<IndexRows<K, T, R>>;
  // compact(): Promise<void>;
}
