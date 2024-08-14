import type { CID, Link, Version } from "multiformats";
import type { BlockCodec } from "../runtime/wait-pr-multiformats/codec-interface";
import { DocFileMeta, Falsy, StoreType } from "../types.js";
import { BlockFetcher, CarTransaction } from "./transaction.js";
import { Logger, Result } from "../utils.js";
import { CommitQueue } from "./commit-queue.js";
import { KeyBagOpts } from "../runtime/key-bag.js";
import { CoerceURI, CryptoRuntime, CTCryptoKey, URI } from "@adviser/cement";

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

export interface KeyWithFingerPrint {
  readonly fingerPrint: string;
  readonly key: CTCryptoKey;
}

export interface CodecOpts {
  readonly ivCalc: "random" | "hash";
  readonly noIVVerify: boolean;
}
export interface KeyedCrypto {
  readonly ivLength: number;
  readonly logger: Logger;
  readonly crypto: CryptoRuntime;
  readonly url: URI;
  // readonly codec: BlockCodec<number, IvAndBytes>;
  readonly isEncrypting: boolean;
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

export interface StoreOpts extends StoreFactory {
  readonly isIndex?: string; // index prefix
  readonly stores?: {
    // string means local storage
    // URL means schema selects the storeType
    readonly base?: CoerceURI;

    readonly meta?: CoerceURI;
    readonly data?: CoerceURI;
    readonly index?: CoerceURI;
    readonly wal?: CoerceURI;
  };
}

export interface StoreRuntime {
  // the factories should produce ready-to-use stores
  // which means they have to call start() on the store
  // to fullfill lifecycle requirements
  // to release resources, like one database connection
  // for all stores a refcount on close() should be used
  makeMetaStore(loader: Loadable): Promise<MetaStore>;
  makeDataStore(loader: Loadable): Promise<DataStore>;
  makeWALStore(loader: Loadable): Promise<WALStore>;
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

export interface Connection {
  readonly loader?: Loadable;
  readonly loaded: Promise<void>;
  connectMeta_X({ loader }: { loader?: Loadable }): void;
  connectStorage_X({ loader }: { loader?: Loadable }): void;

  // metaUpload(bytes: Uint8Array, params: UploadMetaFnParams): Promise<Uint8Array[] | Falsy>;
  // dataUpload(bytes: Uint8Array, params: UploadDataFnParams, opts?: { public?: boolean }): Promise<void>;
  // metaDownload(params: DownloadMetaFnParams): Promise<Uint8Array[] | Falsy>;
  // dataDownload(params: DownloadDataFnParams): Promise<Uint8Array | Falsy>;
}

export interface BaseStore {
  readonly storeType: StoreType;
  // readonly url: URI
  url(): URI;
  readonly name: string;
  onStarted(fn: () => void): void;
  onClosed(fn: () => void): void;

  keyedCrypto(): Promise<KeyedCrypto>;

  close(): Promise<Result<void>>;
  destroy(): Promise<Result<void>>;
  readonly ready?: () => Promise<void>;
  start(): Promise<Result<URI>>;
}

export interface MetaStore extends BaseStore {
  readonly storeType: "meta";
  load(branch?: string): Promise<DbMeta[] | Falsy>;
  // branch is defaulted to "main"
  save(meta: DbMeta, branch?: string): Promise<Result<void>>;
}

export interface RemoteMetaStore extends MetaStore {
  handleByteHeads(byteHeads: Uint8Array[], branch?: string): Promise<DbMeta[]>;
}

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
  operations: DbMeta[];
  noLoaderOps: DbMeta[];
  fileOperations: {
    readonly cid: AnyLink;
    readonly public: boolean;
  }[];
}

export interface WALStore extends BaseStore {
  readonly storeType: "wal";
  ready: () => Promise<void>;
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

export type BlockstoreOpts = Partial<{
  readonly logger: Logger;
  readonly applyMeta: (meta: TransactionMeta, snap?: boolean) => Promise<void>;
  readonly compact: CompactFn;
  readonly autoCompact: number;
  readonly crypto: CryptoRuntime;
  readonly store: StoreOpts;
  readonly keyBag: KeyBagOpts;
  readonly public: boolean;
  readonly meta: DbMeta;
  readonly name: string;
  readonly threshold: number;
}>;

export interface BlockstoreRuntime {
  readonly logger: Logger;
  readonly applyMeta: (meta: TransactionMeta, snap?: boolean) => Promise<void>;
  readonly compact: CompactFn;
  readonly autoCompact: number;
  readonly crypto: CryptoRuntime;
  readonly store: StoreOpts;
  readonly storeRuntime: StoreRuntime;
  readonly keyBag: Partial<KeyBagOpts>;
  // readonly public: boolean;
  readonly meta?: DbMeta;
  readonly name?: string;
  readonly threshold: number;
}

export interface Loadable {
  readonly name: string; // = "";
  readonly logger: Logger;
  readonly ebOpts: BlockstoreRuntime;
  remoteCarStore?: DataStore;
  carStore(): Promise<DataStore>;
  carLog: CarLog; // = new Array<CarGroup>();
  remoteMetaStore?: RemoteMetaStore;
  remoteFileStore?: DataStore;
  ready(): Promise<void>;
  close(): Promise<void>;
  fileStore(): Promise<DataStore>;
  WALStore(): Promise<WALStore>;
  handleDbMetasFromStore(metas: DbMeta[]): Promise<void>;
}
