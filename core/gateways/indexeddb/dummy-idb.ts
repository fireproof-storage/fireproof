import {
  IDBPObjectStore,
  TypedDOMStringList,
  IDBPTransaction,
  IDBPDatabase,
  StoreNames,
  DBSchema,
  IDBPCursor,
  IDBPCursorWithValue,
  IDBPCursorWithValueIteratorValue,
  IDBPIndex,
  IndexNames,
  StoreKey,
  StoreValue,
} from "idb";

type ClearType<Mode extends IDBTransactionMode> = Mode extends "readonly" ? undefined : () => Promise<void>;
type AddType<
  DBTypes extends DBSchema | unknown,
  StoreName extends StoreNames<DBTypes>,
  Mode extends IDBTransactionMode,
> = Mode extends "readonly"
  ? undefined
  : (
      value: StoreValue<DBTypes, StoreName>,
      key?: IDBKeyRange | StoreKey<DBTypes, StoreName> | undefined,
    ) => Promise<StoreKey<DBTypes, StoreName>>;
type PutType<
  DBTypes extends DBSchema | unknown,
  StoreName extends StoreNames<DBTypes>,
  Mode extends IDBTransactionMode,
> = Mode extends "readonly"
  ? undefined
  : (
      value: StoreValue<DBTypes, StoreName>,
      key?: IDBKeyRange | StoreKey<DBTypes, StoreName> | undefined,
    ) => Promise<StoreKey<DBTypes, StoreName>>;

type DeleteType<
  DBTypes extends DBSchema | unknown,
  StoreName extends StoreNames<DBTypes>,
  Mode extends IDBTransactionMode,
> = Mode extends "readonly" ? undefined : (key: IDBKeyRange | StoreKey<DBTypes, StoreName>) => Promise<void>;

type CreateIndexType<
  DBTypes extends DBSchema | unknown,
  TxStores extends ArrayLike<StoreNames<DBTypes>>,
  StoreName extends StoreNames<DBTypes>,
  Mode extends IDBTransactionMode,
> = Mode extends "versionchange"
  ? <IndexName extends IndexNames<DBTypes, StoreName>>(
      name: IndexName,
      keyPath: string | string[],
      options?: IDBIndexParameters,
    ) => IDBPIndex<DBTypes, TxStores, StoreName, IndexName, Mode>
  : undefined;

export class ReadDummyIDBPObjectStore<
  DBTypes extends DBSchema | unknown = unknown,
  TxStores extends ArrayLike<StoreNames<DBTypes>> = ArrayLike<StoreNames<DBTypes>>,
  StoreName extends StoreNames<DBTypes> = StoreNames<DBTypes>,
  Mode extends IDBTransactionMode = "readonly",
> implements IDBPObjectStore<DBTypes, TxStores, StoreName, Mode> {
  //   readonly indexNames: TypedDOMStringList<string> = undefined as unknown as TypedDOMStringList<string>;
  //   readonly transaction: IDBPTransaction<unknown, ArrayLike<string>, "readonly">;

  readonly name: string;
  readonly autoIncrement: boolean = false;
  readonly keyPath: string | string[] = [];
  readonly transaction: IDBPTransaction<DBTypes, TxStores, Mode>;

  constructor(name: string, transaction: IDBPTransaction<DBTypes, TxStores, Mode>) {
    this.transaction = transaction;
    this.name = name;
  }
  readonly indexNames: TypedDOMStringList<IndexNames<DBTypes, StoreName>> = undefined as unknown as TypedDOMStringList<
    IndexNames<DBTypes, StoreName>
  >;

  readonly add: AddType<DBTypes, StoreName, Mode> = ((
    _value: StoreValue<DBTypes, StoreName>,
    _key?: IDBKeyRange | StoreKey<DBTypes, StoreName> | undefined,
  ): Promise<StoreKey<DBTypes, StoreName>> => {
    throw new Error("add not implemented.");
  }) as AddType<DBTypes, StoreName, Mode>;

  //   = (_value: StoreValue<DBTypes, StoreName>, _key?: IDBKeyRange | StoreKey<DBTypes, StoreName> | undefined) => {
  //     throw new Error("add not implemented.");
  //   } as unknown as AddType<DBTypes, StoreName, Mode>;

  clear: ClearType<Mode> = undefined as ClearType<Mode>;

  createIndex: CreateIndexType<DBTypes, TxStores, StoreName, Mode> = undefined as CreateIndexType<
    DBTypes,
    TxStores,
    StoreName,
    Mode
  >;

  delete: DeleteType<DBTypes, StoreName, Mode> = (async (_key: IDBKeyRange | StoreKey<DBTypes, StoreName>): Promise<void> => {
    throw new Error("delete not implemented.");
  }) as DeleteType<DBTypes, StoreName, Mode>;

  put: PutType<DBTypes, StoreName, Mode> = undefined as PutType<DBTypes, StoreName, Mode>;

  get(_query: IDBKeyRange | StoreKey<DBTypes, StoreName>): Promise<StoreValue<DBTypes, StoreName> | undefined> {
    return Promise.resolve(undefined);
  }
  getAll(
    _query?: IDBKeyRange | StoreKey<DBTypes, StoreName> | null | undefined,
    _count?: number,
  ): Promise<StoreValue<DBTypes, StoreName>[]> {
    return Promise.resolve([]);
  }
  getAllKeys(
    _query?: IDBKeyRange | StoreKey<DBTypes, StoreName> | null | undefined,
    _count?: number,
  ): Promise<StoreKey<DBTypes, StoreName>[]> {
    return Promise.resolve([]);
  }
  getKey(_query: IDBKeyRange | StoreKey<DBTypes, StoreName>): Promise<StoreKey<DBTypes, StoreName> | undefined> {
    return Promise.resolve(undefined);
  }
  index<IndexName extends IndexNames<DBTypes, StoreName>>(
    _name: IndexName,
  ): IDBPIndex<DBTypes, TxStores, StoreName, IndexName, Mode> {
    throw new Error("Method not implemented.");
  }
  openCursor(
    _query?: IDBKeyRange | StoreKey<DBTypes, StoreName> | null | undefined,
    _direction?: IDBCursorDirection,
  ): Promise<IDBPCursorWithValue<DBTypes, TxStores, StoreName, unknown, Mode> | null> {
    throw new Error("Method not implemented.");
  }
  openKeyCursor(
    _query?: IDBKeyRange | StoreKey<DBTypes, StoreName> | null | undefined,
    _direction?: IDBCursorDirection,
  ): Promise<IDBPCursor<DBTypes, TxStores, StoreName, unknown, Mode> | null> {
    throw new Error("Method not implemented.");
  }
  iterate(
    _query?: IDBKeyRange | StoreKey<DBTypes, StoreName> | null | undefined,
    _direction?: IDBCursorDirection,
  ): AsyncIterableIterator<IDBPCursorWithValueIteratorValue<DBTypes, TxStores, StoreName, unknown, Mode>> {
    throw new Error("Method not implemented.");
  }
  [Symbol.asyncIterator](): AsyncIterableIterator<IDBPCursorWithValueIteratorValue<DBTypes, TxStores, StoreName, unknown, Mode>> {
    throw new Error("Method not implemented.");
  }
  deleteIndex(_name: string): void {
    throw new Error("Method not implemented.");
  }

  count(_key?: IDBKeyRange | IDBValidKey | null | undefined): Promise<number> {
    throw new Error("count not implemented.");
  }
}

export class ReadDummyIDBPDatabase implements IDBPDatabase<unknown> {
  get objectStoreNames(): TypedDOMStringList<string> {
    throw new Error("objectStoreNames not implemented.");
  }

  readonly version: number;
  readonly name: string;
  constructor(name: string, version = 666) {
    this.name = name;
    this.version = version;
  }

  createObjectStore<Name extends string>(
    _name: Name,
    _optionalParameters?: IDBObjectStoreParameters,
  ): IDBPObjectStore<unknown, ArrayLike<string>, Name, "versionchange"> {
    throw new Error("createObjectStore not implemented.");
  }
  deleteObjectStore(_name: string): void {
    throw new Error("deleteObjectStore not implemented.");
  }

  transaction<Name extends StoreNames<unknown>, Mode extends IDBTransactionMode = "readonly">(
    storeNames: Name,
    mode?: Mode,
    options?: IDBTransactionOptions,
  ): IDBPTransaction<unknown, [Name], Mode>;
  transaction<Names extends ArrayLike<StoreNames<unknown>>, Mode extends IDBTransactionMode = "readonly">(
    _storeNames: Names,
    _mode?: Mode,
    _options?: IDBTransactionOptions,
  ): IDBPTransaction<unknown, Names, Mode> {
    return {
      done: Promise.resolve(),
      objectStore: function (this: IDBPTransaction, storeName: string) {
        return new ReadDummyIDBPObjectStore(storeName, this);
      },
    } as IDBPTransaction<unknown, Names, Mode>;
  }
  add<Name extends string>(_storeName: Name, _value: never, _key?: IDBKeyRange | IDBValidKey | undefined): Promise<IDBValidKey> {
    throw new Error("add not implemented.");
  }
  clear(_name: string): Promise<void> {
    throw new Error("clear not implemented.");
  }
  count<Name extends string>(_storeName: Name, _key?: IDBKeyRange | IDBValidKey | null | undefined): Promise<number> {
    throw new Error("count not implemented.");
  }
  countFromIndex<Name extends string, IndexName extends string>(
    _storeName: Name,
    _indexName: IndexName,
    _key?: IDBKeyRange | IDBValidKey | null | undefined,
  ): Promise<number> {
    throw new Error("countFromIndex not implemented.");
  }
  delete<Name extends string>(_storeName: Name, _key: IDBKeyRange | IDBValidKey): Promise<void> {
    return Promise.resolve();
  }
  get<Name extends string>(_storeName: Name, _query: IDBKeyRange | IDBValidKey): Promise<unknown> {
    throw new Error("get not implemented.");
  }
  getFromIndex<Name extends string, IndexName extends string>(
    _storeName: Name,
    _indexName: IndexName,
    _query: IDBKeyRange | IDBValidKey,
  ): Promise<unknown> {
    throw new Error("getFromIndex not implemented.");
  }
  getAll<Name extends string>(
    _storeName: Name,
    _query?: IDBKeyRange | IDBValidKey | null | undefined,
    _count?: number,
  ): Promise<unknown[]> {
    return Promise.resolve([]);
  }
  getAllFromIndex<Name extends string, IndexName extends string>(
    _storeName: Name,
    _indexName: IndexName,
    _query?: IDBKeyRange | IDBValidKey | null | undefined,
    _count?: number,
  ): Promise<unknown[]> {
    return Promise.resolve([]);
  }
  getAllKeys<Name extends string>(
    _storeName: Name,
    _query?: IDBKeyRange | IDBValidKey | null | undefined,
    _count?: number,
  ): Promise<IDBValidKey[]> {
    return Promise.resolve([]);
  }
  getAllKeysFromIndex<Name extends string, IndexName extends string>(
    _storeName: Name,
    _indexName: IndexName,
    _query?: IDBKeyRange | IDBValidKey | null | undefined,
    _count?: number,
  ): Promise<IDBValidKey[]> {
    return Promise.resolve([]);
  }
  getKey<Name extends string>(_storeName: Name, _query: IDBKeyRange | IDBValidKey): Promise<IDBValidKey | undefined> {
    return Promise.resolve(undefined);
  }
  getKeyFromIndex<Name extends string, IndexName extends string>(
    _storeName: Name,
    _indexName: IndexName,
    _query: IDBKeyRange | IDBValidKey,
  ): Promise<IDBValidKey | undefined> {
    return Promise.resolve(undefined);
  }
  put<Name extends string>(_storeName: Name, _value: unknown, _key?: IDBKeyRange | IDBValidKey | undefined): Promise<IDBValidKey> {
    throw new Error("put not implemented.");
  }

  onabort: ((this: IDBDatabase, ev: Event) => never) | null = null;
  onclose: ((this: IDBDatabase, ev: Event) => never) | null = null;
  onerror: ((this: IDBDatabase, ev: Event) => never) | null = null;

  onversionchange: ((this: IDBDatabase, ev: IDBVersionChangeEvent) => never) | null = null;
  close(): void {
    throw new Error("close not implemented.");
  }
  addEventListener(_type: unknown, _listener: unknown, _options?: unknown): void {
    throw new Error("addEventListener not implemented.");
  }
  removeEventListener(_type: unknown, _listener: unknown, _options?: unknown): void {
    throw new Error("removeEventListener not implemented.");
  }
  dispatchEvent(_event: Event): boolean {
    throw new Error("dispatchEvent not implemented.");
  }
}
