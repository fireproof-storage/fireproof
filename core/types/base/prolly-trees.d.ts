declare module "prolly-trees/base" {
  declare type AnyLink = Link<unknown, number, number, Version>;
  declare type KeyLiteral = string | number | boolean;
  declare type IndexKeyType = KeyLiteral | KeyLiteral[];

  declare type DocFragment = Uint8Array | string | number | boolean | null | AnyLink | DocFragment[] | object;

  declare interface IndexRow<K extends IndexKeyType, T extends DocFragment> {
    readonly id: string;
    readonly key: IndexKey<K>;
    readonly value: T;
  }
  // ProllyNode type based on the ProllyNode from 'prolly-trees/base'
  declare interface BaseNode<K extends IndexKeyType, T extends DocFragment> {
    getAllEntries(): PromiseLike<{ [x: string]: unknown; result: IndexRow<K, T>[] }>;
    getMany<KI extends IndexKeyType>(removeIds: KI[]): Promise<{ /* [x: K]: unknown; */ result: IndexKey<K>[] }>;
    range(a: string, b: string): Promise<{ result: ProllyIndexRow<K, T>[] }>;
    get(key: string): Promise<{ result: ProllyIndexRow<K, T>[] }>;
    bulk(bulk: (IndexUpdate<K> | IndexUpdateString)[]): PromiseLike<{
      readonly root?: ProllyNode<K, T>;
      readonly blocks: Block[];
    }>;
    readonly address: Promise<Link>;
    readonly distance: number;
    compare: (a: unknown, b: unknown) => number;
    readonly cache: unknown;
    readonly block: Promise<Block>;
  }

  declare interface StaticProllyOptions<T> {
    readonly cache: unknown;
    chunker: (entry: T, distance: number) => Promise<boolean>;
    readonly codec: unknown;
    readonly hasher: unknown;
    compare: (a: T, b: T) => number;
  }
}

declare module "prolly-trees/db-index" {
  declare function create<K extends IndexKeyType, T extends DocFragment>(opts: CreateOpts): Promise<BaseNode<K, T>[]>;
  declare function load(opts: LoadOpts): Promise<BaseNode>;
}

declare module "prolly-trees/utils" {
  declare interface Entry {
    identity(): number;
  }
  declare function bf<T>(factor: number): (entry: T, dist: number) => Promise<boolean>;
  // declare function bf(factor: number): (entry: Entry) => Promise<boolean>;
  declare function simpleCompare(a: number | string, b: number | string): number;
}

declare module "prolly-trees/cache" {
  declare interface Address {
    asCID: string;
  }
  declare interface Node {
    address: Address;
  }
  declare interface Cache {
    has(): boolean;
    get(key: Address): Node | undefined;
    set(node: Node): Promise<void>;
  }
  declare const nocache: Cache;
  declare const global: Cache;
}

declare module "prolly-trees/cid-set" {
  declare interface CreateOpts {
    get: unknown;
    cache: Cache;
    chunker: unknown;
    list: unknown;
    codec: unknown;
    hasher: unknown;
    sorted: unknown;
  }
  declare function create(opts: CreateOpts): void;

  declare interface LoadOpts {
    cid: Address;
    get: unknown;
    cache: Cache;
    chunker: unknown;
    codec: unknown;
    hasher: unknown;
    // ...opts: unkown
  }
  declare function load(opts: LoadOpts): Promise<Node>;
}
