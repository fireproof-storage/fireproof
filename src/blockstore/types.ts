import type { CID, Link, Version } from "multiformats";
import type { BlockCodec } from "../runtime/wait-pr-multiformats/codec-interface.js";
import { CarTransaction, DocFileMeta, Falsy, StoreType, SuperThis } from "../types.js";
import { BlockFetcher } from "./transaction.js";
import { CommitQueue } from "./commit-queue.js";
import { KeyBag, KeyBagRuntime } from "../runtime/key-bag.js";
import { CoerceURI, CryptoRuntime, CTCryptoKey, Logger, Result, URI } from "@adviser/cement";
import { EventBlock } from "@fireproof/vendor/@web3-storage/pail/clock";
import { TaskManager } from "./task-manager.js";
import { SerdeGateway, SerdeGatewayInterceptor } from "./serde-gateway.js";
import { CarReader } from "@ipld/car";

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

export interface IvAndBytes {
  readonly bytes: Uint8Array;
  readonly iv: Uint8Array;
}

export interface BytesWithIv {
  readonly bytes: Uint8Array;
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
  readonly value: IvAndBytes;
}

export interface KeyMaterial {
  readonly key: Uint8Array;
  readonly keyStr: string;
}

export interface KeyWithFingerPrint {
  readonly fingerPrint: string;
  readonly key: CTCryptoKey;
}

export interface KeyWithFingerExtract extends KeyWithFingerPrint {
  extract(): Promise<KeyMaterial>;
}

export interface CodecOpts {
  readonly ivCalc: "random" | "hash";
  readonly noIVVerify: boolean;
}
export interface KeyedCrypto {
  readonly ivLength: number; // in bytes only 12 and 16 are allowed
  readonly logger: Logger;
  readonly crypto: CryptoRuntime;
  readonly url: URI;
  // readonly codec: BlockCodec<number, IvAndBytes>;
  // readonly isEncrypting: boolean;
  fingerPrint(): Promise<string>;
  algo(iv?: Uint8Array): { name: string; iv: Uint8Array; tagLength: number };
  codec(iv?: Uint8Array, codecOpts?: Partial<CodecOpts>): BlockCodec<number, Uint8Array>;
  _decrypt(data: IvAndBytes): Promise<Uint8Array>;
  _encrypt(data: BytesWithIv): Promise<Uint8Array>;
  // encode(data: Uint8Array): Promise<Uint8Array>;
  // decode(bytes: Uint8Array | ArrayBuffer): Promise<Uint8Array>;
}

export interface BlobLike {
  /**
   * Returns a ReadableStream which yields the Blob data.
   */
  stream: () => ReadableStream;
}

export interface StoreFactory {
  makeMetaStore?: (loader: Loadable) => Promise<MetaStore>;
  makeDataStore?: (loader: Loadable) => Promise<DataStore>;
  makeWALStore?: (loader: Loadable) => Promise<WALStore>;

  encodeFile?: (blob: BlobLike) => Promise<{ cid: AnyLink; blocks: AnyBlock[] }>;
  decodeFile?: (blocks: unknown, cid: AnyLink, meta: DocFileMeta) => Promise<File>;
}

export interface StoreUrls {
  // string means local storage
  // URL means schema selects the storeType
  // readonly base: CoerceURI;
  readonly meta: CoerceURI;
  readonly data: CoerceURI;
  // readonly index: CoerceURI;
  readonly wal: CoerceURI;
}

// export interface StoreUrlBaseOpts {
//   readonly base?: CoerceURI;
//   readonly data?: Partial<StoreUrls>
//   readonly idx?: Partial<StoreUrls>
// }

export interface StoreEnDeFile {
  readonly encodeFile: (blob: BlobLike) => Promise<{ cid: AnyLink; blocks: AnyBlock[] }>;
  readonly decodeFile: (blocks: unknown, cid: AnyLink, meta: DocFileMeta) => Promise<File>;
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
  readonly data: URI;
  readonly file: URI;
  readonly wal: URI;
}

export interface StoreURIRuntime {
  readonly data: StoreURIs;
  readonly idx: StoreURIs;
}

export interface StoreFactoryItem {
  readonly sthis: SuperThis;
  readonly url: URI;
  readonly gatewayInterceptor?: SerdeGatewayInterceptor;
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
  makeMetaStore(sfi: StoreFactoryItem): Promise<MetaStore>;
  makeDataStore(sfi: StoreFactoryItem): Promise<DataStore>;
  makeWALStore(sfi: StoreFactoryItem): Promise<WALStore>;
  encodeFile(blob: BlobLike): Promise<{ cid: AnyLink; blocks: AnyBlock[] }>;
  decodeFile(blocks: unknown, cid: AnyLink, meta: DocFileMeta): Promise<File>;
}

export interface CommitOpts {
  readonly noLoader?: boolean;
  readonly compact?: boolean;
  // readonly public?: boolean;
}

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
  readonly loaded: Promise<void>;
  // connectMeta(ref: RefLoadable | RefBlockstore): void;
  connectStorage(ref: RefLoadable | RefBlockstore): void;

  // metaUpload(bytes: Uint8Array, params: UploadMetaFnParams): Promise<Uint8Array[] | Falsy>;
  // dataUpload(bytes: Uint8Array, params: UploadDataFnParams, opts?: { public?: boolean }): Promise<void>;
  // metaDownload(params: DownloadMetaFnParams): Promise<Uint8Array[] | Falsy>;
  // dataDownload(params: DownloadDataFnParams): Promise<Uint8Array | Falsy>;
}

export interface BaseStore {
  readonly storeType: StoreType;
  readonly realGateway: SerdeGateway;
  // readonly url: URI
  url(): URI;
  // readonly name: string;
  onStarted(fn: () => void): void;
  onClosed(fn: () => void): void;

  keyedCrypto(): Promise<KeyedCrypto>;

  close(): Promise<Result<void>>;
  destroy(): Promise<Result<void>>;
  readonly ready?: () => Promise<void>;
  start(): Promise<Result<URI>>;
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

export interface DataStore extends BaseStore {
  readonly storeType: "data";
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
  // readonly storeEnDeFile: StoreEnDeFile;
  // readonly public: boolean;
  readonly meta?: DbMeta;
  // readonly name?: string;
  readonly threshold: number;
}

export interface Loadable {
  // readonly name: string; // = "";
  readonly sthis: SuperThis;
  readonly ebOpts: BlockstoreRuntime;
  carLog: CarLog;
  remoteMetaStore?: MetaStore;
  remoteFileStore?: DataStore;
  remoteCarStore?: DataStore;
  readonly taskManager: TaskManager;

  ready(): Promise<void>;
  close(): Promise<void>;

  keyBag(): Promise<KeyBag>;
  metaStore(): Promise<MetaStore>;
  fileStore(): Promise<DataStore>;
  WALStore(): Promise<WALStore>;
  carStore(): Promise<DataStore>;

  handleDbMetasFromStore(metas: DbMeta[]): Promise<void>;

  commit<T = TransactionMeta>(t: CarTransaction, done: T, opts: CommitOpts): Promise<CarGroup>;
  destroy(): Promise<void>;
  getBlock(cid: AnyLink): Promise<AnyBlock | Falsy>;
  loadFileCar(cid: AnyLink /*, isPublic = false*/): Promise<CarReader>;
  loadCar(cid: AnyLink): Promise<CarReader>;
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
