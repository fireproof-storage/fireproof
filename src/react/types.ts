import type {
  DocFragment,
  DocResponse,
  DocSet,
  DocTypes,
  DocWithId,
  IndexKeyType,
  IndexRow,
  MapFn,
  QueryOpts,
  Database,
  AllDocsQueryOpts,
  ChangesOptions,
  ClockHead,
} from "@fireproof/core";

export interface LiveQueryResult<T extends DocTypes, K extends IndexKeyType, R extends DocFragment = T> {
  readonly docs: DocWithId<T>[];
  readonly rows: IndexRow<K, T, R>[];
  /** @internal */
  readonly length: number;
  /** @internal */
  map<U>(callbackfn: (value: DocWithId<T>, index: number, array: DocWithId<T>[]) => U): U[];
  /** @internal */
  filter(predicate: (value: DocWithId<T>, index: number, array: DocWithId<T>[]) => boolean): DocWithId<T>[];
  /** @internal */
  forEach(callbackfn: (value: DocWithId<T>, index: number, array: DocWithId<T>[]) => void): void;
  /** @internal */
  [Symbol.iterator](): Iterator<DocWithId<T>>;
}

export type UseLiveQuery = <T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T>(
  mapFn: string | MapFn<T>,
  query?: QueryOpts<K>,
  initialRows?: IndexRow<K, T, R>[],
) => LiveQueryResult<T, K, R>;

export interface AllDocsResult<T extends DocTypes> {
  readonly docs: DocWithId<T>[];
}

export interface ChangesResult<T extends DocTypes> {
  readonly docs: DocWithId<T>[];
}

export type UseAllDocs = <T extends DocTypes>(query?: AllDocsQueryOpts) => AllDocsResult<T>;

export type UseChanges = <T extends DocTypes>(since: ClockHead, opts: ChangesOptions) => ChangesResult<T>;

export interface UpdateDocFnOptions {
  readonly replace?: boolean;
  readonly reset?: boolean;
}

export type UpdateDocFn<T extends DocTypes> = (newDoc?: DocSet<T>, options?: UpdateDocFnOptions) => void;

export type StoreDocFn<T extends DocTypes> = (existingDoc?: DocWithId<T>) => Promise<DocResponse>;

export type DeleteDocFn<T extends DocTypes> = (existingDoc?: DocWithId<T>) => Promise<DocResponse>;

export type UseDocumentResultTuple<T extends DocTypes> = [DocWithId<T>, UpdateDocFn<T>, StoreDocFn<T>, DeleteDocFn<T>];

export interface UseDocumentResultObject<T extends DocTypes> {
  doc: DocWithId<T>;
  merge: (newDoc: Partial<T>) => void;
  replace: (newDoc: T) => void;
  reset: () => void;
  refresh: () => Promise<void>;
  save: StoreDocFn<T>;
  remove: DeleteDocFn<T>;
  submit: (e?: Event) => Promise<void>;
}

export type UseDocumentResult<T extends DocTypes> = UseDocumentResultObject<T> & UseDocumentResultTuple<T>;

export type UseDocumentInitialDocOrFn<T extends DocTypes> = DocSet<T> | (() => DocSet<T>);
export type UseDocument = <T extends DocTypes>(initialDocOrFn: UseDocumentInitialDocOrFn<T>) => UseDocumentResult<T>;

export interface UseFireproof {
  readonly database: Database;
  readonly useDocument: UseDocument;
  readonly useLiveQuery: UseLiveQuery;
  readonly useAllDocs: UseAllDocs;
  readonly useChanges: UseChanges;
}
