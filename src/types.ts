import type { EventLink } from "@web3-storage/pail/clock/api";
import type { Operation } from "@web3-storage/pail/crdt/api";

import type { DbMeta, CryptoOpts, StorexOpts, AnyLink } from "./storage-engine/index.js";

export type Falsy = false | null | undefined;

export function isFalsy(value: unknown): value is Falsy {
  return value === false && value === null && value === undefined;
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

export interface ConfigOpts {
  readonly public?: boolean;
  readonly meta?: DbMeta;
  readonly persistIndexes?: boolean;
  readonly autoCompact?: number;
  readonly crypto?: CryptoOpts;
  readonly store?: StorexOpts;
  readonly indexStore?: StorexOpts;
  readonly threshold?: number;
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
}

export interface DbResponse {
  readonly id: string;
  readonly clock: ClockHead;
}

export type UpdateListenerFn<T extends DocTypes> = (docs: DocWithId<T>[]) => Promise<void> | void;
export type NoUpdateListenerFn = () => Promise<void> | void;
export type ListenerFn<T extends DocTypes> = UpdateListenerFn<T> | NoUpdateListenerFn;
