import type { CID, Link, Version } from "multiformats";
import { Attachable, Attached, CarTransaction, DocFileMeta, Falsy, GatewayUrls, StoreType, SuperThis } from "../types.js";
import { BlockFetcher } from "./transaction.js";
import { CommitQueue } from "./commit-queue.js";
import { KeyBag, KeyBagRuntime, KeysItem } from "../runtime/key-bag.js";
import { CoerceURI, CryptoRuntime, CTCryptoKey, Future, Logger, Result, URI } from "@adviser/cement";
import { EventBlock } from "@fireproof/vendor/@web3-storage/pail/clock";
import { TaskManager, TaskManagerParams } from "./task-manager.js";
import { SerdeGateway, SerdeGatewayInterceptor } from "./serde-gateway.js";
import { Context } from "../context.js";
import { AsyncBlockCodec } from "../runtime/wait-pr-multiformats/codec-interface.js";

export type AnyLink = Link<unknown, number, number, Version>;
export type CarGroup = AnyLink[];
// export type CarLog = CarGroup[];

export type FroozenCarLog = CarGroup[];
export class CarLog {
  readonly _logs: CarGroup[] = [];

  get length() {
    return this._logs.length;
  }
  last() {
    const x = [...this._logs[this._logs.length - 1]];
    Object.freeze(x);
    return x;
  }
  xunshift(logs: CarGroup) {
    // console.log(
    //   "CarLog-unshift",
    //   logs.map((l) => l.toString()),
    // );
    this._logs.unshift(logs);
  }
  update(logs: FroozenCarLog) {
    // console.log(
    //   "CarLog-update",
    //   logs.map((l) => l.map((l) => l.toString())),
    // );
    this._logs.length = 0;
    this._logs.push(...logs);
  }
  asArray(): FroozenCarLog {
    // in production it should be
    // return this._logs

    const a = [
      ...this._logs.map((l) => {
        const x = [...l];
        Object.freeze(x);
        return x;
      }),
    ];
    Object.freeze(a);
    return a;
  }
}
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

// export interface EncryptOpts {
//   readonly key: ArrayBuffer;
//   readonly cid: AnyLink;
//   readonly bytes: Uint8Array;
// }

export interface IvKeyIdData {
  readonly iv: Uint8Array;
  readonly keyId: Uint8Array;
  readonly data: Uint8Array;
}

export interface IvAndKeyAndBytes {
  readonly bytes: Uint8Array;
  readonly key: CTCryptoKey;
  readonly iv: Uint8Array;
}

export interface BytesAndKeyWithIv {
  readonly bytes: Uint8Array;
  readonly key: CTCryptoKey;
  readonly iv?: Uint8Array;
}

// export interface DecryptOpts {
//   readonly key: ArrayBuffer;
//   readonly value: IvAndBytes;
// }

export interface AnyDecodedBlock {
  readonly cid: AnyLink;
  readonly bytes: Uint8Array;
  readonly value: Uint8Array;
}

export interface CarMakeable {
  entries(): AsyncIterable<AnyBlock>;
  get(cid: AnyLink): Promise<AnyBlock | undefined>;
}

export interface CarHeader<T> {
  readonly cars: FroozenCarLog;
  readonly compact: FroozenCarLog;
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

export interface TransactionWrapper<M extends TransactionMeta> {
  meta: M;
  cars?: CarGroup;
  t: CarTransaction;
}

export type TransactionMeta = unknown;
//CRDTMeta | IndexTransactionMeta | FileTransactionMeta;

// export interface MakeCodecCrypto {
//   subtle: {
//     decrypt: (algo: { name: string; iv: Uint8Array; tagLength: number }, key: CryptoKey, data: Uint8Array) => Promise<ArrayBuffer>;
//     encrypt: (algo: { name: string; iv: Uint8Array; tagLength: number }, key: CryptoKey, data: Uint8Array) => Promise<ArrayBuffer>;
//   };
// }

// an implementation of this Interface contains the keymaterial
// so that the fp-core can use the decrypt and encrypt without knowing the key
export interface EncryptedBlock {
  readonly value: IvAndKeyAndBytes;
}

export interface KeyMaterial {
  readonly key: Uint8Array;
  readonly keyStr: string;
}

export interface KeyWithFingerPrint {
  readonly fingerPrint: string;
  readonly key: CTCryptoKey;
  extract(): Promise<KeyMaterial>;
}

// export interface KeyWithFingerExtract extends KeyWithFingerPrint {
// }

export interface CodecOpts {
  readonly ivCalc: "random" | "hash";
  readonly noIVVerify: boolean;
}

export interface KeyUpsertResult {
  readonly modified: boolean;
  readonly kfp: KeyWithFingerPrint;
}

export interface KeysByFingerprint {
  readonly id: string;
  readonly name: string;
  get(fingerPrint?: Uint8Array | string): Promise<KeyWithFingerPrint | undefined>;
  upsert(key: string | Uint8Array, def?: boolean): Promise<Result<KeyUpsertResult>>;
  asKeysItem(): Promise<KeysItem>;
}

export interface CryptoAction {
  readonly ivLength: number; // in bytes only 12 and 16 are allowed
  readonly logger: Logger;
  readonly crypto: CryptoRuntime;
  readonly url: URI;
  readonly key: KeysByFingerprint;
  // readonly codec: BlockCodec<number, IvAndBytes>;
  // readonly isEncrypting: boolean;
  // keyByFingerPrint(id: Uint8Array | string): Promise<Result<KeyWithFingerPrint>>;
  // fingerPrint(): Promise<string>;

  algo(iv?: Uint8Array): { name: string; iv: Uint8Array; tagLength: number };
  codec(iv?: Uint8Array, codecOpts?: Partial<CodecOpts>): AsyncBlockCodec<24, Uint8Array, IvKeyIdData>;
  _decrypt(data: IvAndKeyAndBytes): Promise<Uint8Array>;
  _encrypt(data: BytesAndKeyWithIv): Promise<Uint8Array>;
  // encode(data: Uint8Array): Promise<Uint8Array>;
  // decode(bytes: Uint8Array | ArrayBuffer): Promise<Uint8Array>;
}

// export interface BlobLike {
//   /**
//    * Returns a ReadableStream which yields the Blob data.
//    */
//   stream: () => ReadableStream;
// }

export interface StoreFactory {
  // makeMetaStore?: (loader: Loadable) => Promise<MetaStore>;
  // makeDataStore?: (loader: Loadable) => Promise<DataStore>;
  // makeWALStore?: (loader: Loadable) => Promise<WALStore>;

  encodeFile?: (blob: Blob) => Promise<{ cid: AnyLink; blocks: AnyBlock[] }>;
  decodeFile?: (blocks: unknown, cid: AnyLink, meta: DocFileMeta) => Promise<File>;
}

export interface StoreUrls {
  // string means local storage
  // URL means schema selects the storeType
  // readonly base: CoerceURI;
  readonly meta: CoerceURI;
  readonly car: CoerceURI;
  readonly file: CoerceURI;
  // readonly index: CoerceURI;
  readonly wal: CoerceURI;
}

// export interface StoreUrlBaseOpts {
//   readonly base?: CoerceURI;
//   readonly data?: Partial<StoreUrls>
//   readonly idx?: Partial<StoreUrls>
// }

export interface StoreEnDeFile {
  readonly encodeFile: (blob: Blob) => Promise<{ cid: AnyLink; blocks: AnyBlock[] }>;
  readonly decodeFile: (blocks: unknown, cid: AnyLink, meta: DocFileMeta) => Promise<Result<File>>;
}

export interface StoreUrlsOpts {
  // readonly urls?: StoreUrlBaseOpts;
  // readonly func?: StoreFactory;
  readonly base?: CoerceURI;
  readonly data?: Partial<StoreUrls>;
  readonly idx?: Partial<StoreUrls>;
}

export interface StoreURIs {
  readonly meta: URI;
  readonly car: URI;
  readonly file: URI;
  readonly wal: URI;
}

export interface StoreURIRuntime {
  readonly data: StoreURIs;
  readonly idx: StoreURIs;
}

export interface UrlAndInterceptor {
  readonly url: URI;
  readonly gatewayInterceptor?: SerdeGatewayInterceptor;
}
export interface StoreFactoryItem {
  // readonly sthis: SuperThis;
  readonly byStore: GatewayUrls;
  // readonly keybag: KeyBag;
  readonly loader: Loadable;
}

export interface StoreRuntime {
  // readonly isIndex?: string; // index prefix
  //xx readonly stores: Partial<Stores>;
  // the factories should produce ready-to-use stores
  // which means they have to call start() on the store
  // to fullfill lifecycle requirements
  // to release resources, like one ledger connection
  // for all stores a refcount on close() should be used
  // makeMetaStore(sfi: StoreFactoryItem): Promise<MetaStore>;
  // makeDataStore(sfi: StoreFactoryItem): Promise<DataStore>;
  // makeWALStore(sfi: StoreFactoryItem): Promise<WALStore>;

  makeStores(sfi: StoreFactoryItem): Promise<DataAndMetaAndWalStore>;

  encodeFile(blob: Blob): Promise<{ cid: AnyLink; blocks: AnyBlock[] }>;
  decodeFile(blocks: unknown, cid: AnyLink, meta: DocFileMeta): Promise<Result<File>>;
}

export interface CommitOpts {
  readonly noLoader?: boolean;
  readonly compact?: boolean;
  // readonly public?: boolean;
}

// export interface DbMetaWithSource extends DbMeta {
//   readonly srcUrls: {
//     readonly car: string
//     readonly file: string
//     readonly meta: string
//     readonly local?: string
//   }[]
// }

export interface WriteableDataAndMetaStore {
  file: FileStore;
  car: CarStore;
  meta: MetaStore;
}

export type DataAndMetaStore = Readonly<WriteableDataAndMetaStore>;

export interface WriteableDataAndMetaAndWalStore extends WriteableDataAndMetaStore {
  wal?: WALStore;
}

export type DataAndMetaAndWalStore = Readonly<WriteableDataAndMetaAndWalStore>;

export type LocalDataAndMetaAndWalStore = Readonly<Omit<WriteableDataAndMetaAndWalStore, "wal">> & { readonly wal: WALStore };

// export interface DbMetaLocalRemoteStores extends DbMeta {
//   readonly store: {
//     readonly local: DataAndMetaStore;
//     readonly remotes: DataAndMetaStore[];
//   };
// }

export interface DbMeta {
  readonly cars: CarGroup;
  // key?: string;
}

// export interface UploadMetaFnParams {
//   readonly name: string;
//   readonly branch: string;
// }

// export type FnParamTypes = "data" | "file";

// export interface UploadDataFnParams {
//   readonly type: FnParamTypes;
//   readonly name: string;
//   readonly car: string;
//   readonly size: string;
// }

// export interface DownloadDataFnParams {
//   readonly type: FnParamTypes;
//   readonly name: string;
//   readonly car: string;
// }

// export interface DownloadMetaFnParams {
//   readonly name: string;
//   readonly branch: string;
// }

export type LoadHandler = (dbMetas: DbMeta[]) => Promise<void>;

export interface RefLoadable {
  readonly loader: Loadable;
}
export interface RefBlockstore {
  readonly blockstore: RefLoadable;
}

export interface Connection {
  // readonly loader?: Loadable;
  // connectMeta(ref: RefLoadable | RefBlockstore): void;

  // this indicates if a store is completely loaded from a peer
  loaded(): Future<void>;
  readonly context: Context;
  connectStorage(ref: RefLoadable | RefBlockstore): void;

  // metaUpload(bytes: Uint8Array, params: UploadMetaFnParams): Promise<Uint8Array[] | Falsy>;
  // dataUpload(bytes: Uint8Array, params: UploadDataFnParams, opts?: { public?: boolean }): Promise<void>;
  // metaDownload(params: DownloadMetaFnParams): Promise<Uint8Array[] | Falsy>;
  // dataDownload(params: DownloadDataFnParams): Promise<Uint8Array | Falsy>;
}

export interface BaseStore {
  readonly storeType: StoreType;
  readonly realGateway: SerdeGateway;
  readonly logger: Logger;
  // readonly url: URI
  url(): URI;
  // readonly name: string;
  // onStarted(fn: () => void): void;
  // onClosed(fn: () => void): void;

  keyedCrypto(): Promise<CryptoAction>;

  close(): Promise<Result<void>>;
  destroy(): Promise<Result<void>>;
  readonly ready?: () => Promise<void>;
  start(dam: DataAndMetaStore): Promise<Result<URI>>;
}

export interface DbMetaEvent {
  readonly eventCid: CarClockLink;
  readonly parents: CarClockHead;
  readonly dbMeta: DbMeta;
}

export function DbMetaEventEqual(a: DbMetaEvent, b: DbMetaEvent): boolean {
  return (
    a.eventCid.equals(b.eventCid) &&
    a.parents.length === b.parents.length &&
    a.parents.every((p, i) => p.equals(b.parents[i])) &&
    a.dbMeta.cars.length === b.dbMeta.cars.length &&
    a.dbMeta.cars.every((c, i) => c.equals(b.dbMeta.cars[i]))
  );
}

export function DbMetaEventsEqual(a: DbMetaEvent[], b: DbMetaEvent[]): boolean {
  return a.length === b.length && a.every((e, i) => DbMetaEventEqual(e, b[i]));
}

export interface MetaStore extends BaseStore {
  readonly storeType: "meta";
  load(branch?: string): Promise<DbMeta[] | Falsy>;
  // branch is defaulted to "main"
  save(meta: DbMeta, branch?: string): Promise<Result<void>>;
  // onLoad(branch: string, loadHandler: LoadHandler): () => void;
  // handleByteHeads(byteHeads: Uint8Array, branch?: string): Promise<DbMetaEvent[]>;
}

// export interface RemoteMetaStore extends MetaStore {
// }

export interface DataSaveOpts {
  readonly public: boolean;
}

export interface CarStore extends BaseStore {
  readonly storeType: "car";
  load(cid: AnyLink): Promise<AnyBlock>;
  save(car: AnyBlock, opts?: DataSaveOpts): Promise</*AnyLink | */ void>;
  remove(cid: AnyLink): Promise<Result<void>>;
}

export interface FileStore extends BaseStore {
  readonly storeType: "file";
  load(cid: AnyLink): Promise<AnyBlock>;
  save(car: AnyBlock, opts?: DataSaveOpts): Promise</*AnyLink | */ void>;
  remove(cid: AnyLink): Promise<Result<void>>;
}

export interface WALState {
  readonly operations: DbMeta[];
  readonly noLoaderOps: DbMeta[];
  readonly fileOperations: {
    readonly cid: AnyLink;
    readonly public: boolean;
  }[];
}

export interface WALStore extends BaseStore {
  readonly storeType: "wal";
  ready(): Promise<void>;
  readonly processing?: Promise<void> | undefined;
  readonly processQueue: CommitQueue<void>;

  process(): Promise<void>;
  enqueue(dbMeta: DbMeta, opts: CommitOpts): Promise<void>;
  enqueueFile(fileCid: AnyLink /*, publicFile?: boolean*/): Promise<void>;
  load(): Promise<WALState | Falsy>;
  save(state: WALState): Promise<void>;
}

export type CompactFetcher = BlockFetcher & {
  readonly loggedBlocks: CarTransaction;
};
export type CompactFn = (blocks: CompactFetcher) => Promise<TransactionMeta>;

export interface StoreRuntimeUrls {
  readonly meta: URI;
  readonly data: URI;
  readonly wal: URI;
}

export interface BlockstoreParams {
  readonly logger: Logger;
  readonly applyMeta: (meta: TransactionMeta, snap?: boolean) => Promise<void>;
  readonly compact: CompactFn;
  readonly autoCompact: number;
  readonly crypto: CryptoRuntime;
  readonly public: boolean;
  readonly meta: DbMeta;
  readonly threshold: number;
  readonly gatewayInterceptor?: SerdeGatewayInterceptor;
  readonly storeEnDeFile: Partial<StoreEnDeFile>;
  readonly keyBag: KeyBagRuntime;
  readonly storeUrls: StoreURIs;
  readonly storeRuntime: StoreRuntime;
  readonly taskManager: TaskManagerParams;
}

export type BlockstoreOpts = Partial<BlockstoreParams> & {
  readonly keyBag: KeyBagRuntime;
  readonly storeUrls: StoreURIs;
  readonly storeRuntime: StoreRuntime;
};

export interface BlockstoreRuntime {
  readonly logger: Logger;
  readonly applyMeta: (meta: TransactionMeta, snap?: boolean) => Promise<void>;
  readonly compact: CompactFn;
  readonly autoCompact: number;
  readonly crypto: CryptoRuntime;
  readonly storeRuntime: StoreRuntime;
  readonly keyBag: KeyBagRuntime;
  readonly storeUrls: StoreURIs;
  readonly gatewayInterceptor?: SerdeGatewayInterceptor;
  readonly taskManager: TaskManagerParams;
  // readonly storeEnDeFile: StoreEnDeFile;
  // readonly public: boolean;
  readonly meta?: DbMeta;
  // readonly name?: string;
  readonly threshold: number;
}

export type LocalActiveStore = Omit<ActiveStore, "active"> & { readonly active: LocalDataAndMetaAndWalStore };
export interface AttachedStores {
  // fileStore(): Promise<DataStore>;
  // carStore(): Promise<DataStore>;
  // metaStore(): Promise<MetaStore>;

  local(): LocalActiveStore;
  forRemotes(actionFn: (store: ActiveStore) => Promise<unknown>): Promise<void>;
  remotes(): ActiveStore[];
  activate(store: DataAndMetaStore | CoerceURI): ActiveStore;
  attach(attached: Attachable): Promise<Attached>;
  detach(): Promise<void>;
}

export interface BaseAttachedStores {
  local(): BaseStore;
  // without local and active
  remotes(): BaseStore[];
}

export interface CarAttachedStores extends BaseAttachedStores {
  local(): CarStore;
  // without local and active
  remotes(): CarStore[];
}

export abstract class BaseActiveStore {
  abstract readonly ref: ActiveStore;
  abstract readonly active: BaseStore;

  // readonly local: ActiveStore;
  // readonly remotes: ActiveStore[];

  abstract local(): BaseStore;
  abstract remotes(): BaseStore[];

  protected abstract readonly xattached: BaseAttachedStores;
}

// export abstract class CarActiveStore extends BaseActiveStore {
//   readonly ref: ActiveStore;
//   readonly active: CarStore;
//   readonly xattached: CarAttachedStores;
// }

export interface FileAttachedStores extends BaseAttachedStores {
  local(): FileStore;
  // without local and active
  remotes(): FileStore[];
}

export abstract class CarActiveStore extends BaseActiveStore {
  // readonly ref: ActiveStore;
  // readonly active: CarStore;
  protected abstract readonly xattached: CarAttachedStores;
  abstract local(): CarStore;
  abstract remotes(): CarStore[];
}

export abstract class FileActiveStore extends BaseActiveStore {
  // readonly ref: ActiveStore;
  // readonly active: FileStore;
  protected abstract readonly xattached: FileAttachedStores;
  abstract local(): FileStore;
  abstract remotes(): FileStore[];
}

export type CIDActiveStore = CarActiveStore | FileActiveStore;

export interface MetaAttachedStores extends BaseAttachedStores {
  local(): MetaStore;
  remotes(): MetaStore[];
}

export abstract class MetaActiveStore extends BaseActiveStore {
  // readonly ref: ActiveStore;
  // readonly active: MetaStore;
  protected abstract readonly xattached: MetaAttachedStores;
  abstract local(): MetaStore;
  abstract remotes(): MetaStore[];
}

export interface WALAttachedStores extends BaseAttachedStores {
  local(): WALStore;
  remotes(): WALStore[];
}

export abstract class WALActiveStore extends BaseActiveStore {
  // readonly ref: ActiveStore;
  // readonly active: WALStore;
  protected abstract readonly xattached: WALAttachedStores;
  abstract local(): WALStore;
  abstract remotes(): WALStore[];
}

export interface ActiveStore {
  readonly active: DataAndMetaAndWalStore;
  baseStores(): BaseStore[];
  carStore(): CarActiveStore;
  fileStore(): FileActiveStore;
  metaStore(): MetaActiveStore;
  walStore(): WALActiveStore;

  local(): LocalActiveStore;
  remotes(): ActiveStore[];

  readonly xattached: AttachedStores;
}

export interface CarCacheItem {
  readonly type: "car" | "block";
  readonly cid: AnyLink;
  readonly blocks: AnyBlock[];
  readonly roots: CID[];
}

export interface Loadable {
  // readonly name: string; // = "";
  readonly sthis: SuperThis;
  readonly ebOpts: BlockstoreRuntime;
  readonly carLog: CarLog;

  // xremoteMetaStore?: MetaStore;
  // xremoteFileStore?: DataStore;
  // xremoteCarStore?: DataStore;

  readonly attachedStores: AttachedStores;

  attach(attached: Attachable): Promise<Attached>;

  readonly taskManager: TaskManager;

  ready(): Promise<void>;
  close(): Promise<void>;

  keyBag(): Promise<KeyBag>;
  // metaStore(): Promise<MetaStore>;
  // fileStore(): Promise<DataStore>;
  // WALStore(): Promise<WALStore>;
  // carStore(): Promise<DataStore>;

  handleDbMetasFromStore(metas: DbMeta[], store: ActiveStore): Promise<void>;

  commit<T = TransactionMeta>(t: CarTransaction, done: T, opts: CommitOpts): Promise<CarGroup>;
  destroy(): Promise<void>;
  getBlock(cid: AnyLink, store: ActiveStore): Promise<AnyBlock | Falsy>;
  loadFileCar(cid: AnyLink /*, isPublic = false*/, store: ActiveStore): Promise<CarCacheItem>;
  loadCar(cid: AnyLink, store: ActiveStore): Promise<CarCacheItem>;
  commitFiles(
    t: CarTransaction,
    done: TransactionMeta /* opts: CommitOpts = { noLoader: false, compact: false } */,
  ): Promise<CarGroup>;
  entries(cache?: boolean): AsyncIterableIterator<AnyBlock>;
}

export interface DbMetaBinary {
  readonly dbMeta: Uint8Array;
}
export type DbMetaEventBlock = EventBlock<DbMetaBinary>;
export type CarClockLink = Link<DbMetaEventBlock, number, number, Version>;
export type CarClockHead = CarClockLink[];
