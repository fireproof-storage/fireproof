import type { Link } from "multiformats";
import type { EventLink } from "@web3-storage/pail/clock/api";
import type { Operation } from "@web3-storage/pail/crdt/api";

import type { DbMeta, CryptoOpts, StoreOpts } from "./storage-engine";

export type ConfigOpts = {
  readonly public?: boolean;
  readonly meta?: DbMeta;
  readonly persistIndexes?: boolean;
  readonly autoCompact?: number;
  readonly crypto?: CryptoOpts;
  readonly store?: StoreOpts;
  readonly threshold?: number;
};

export type ClockLink = EventLink<Operation>;

export type ClockHead = ClockLink[];

export type DocFragment =
  | Uint8Array
  | string
  | number
  | boolean
  | undefined
  | null
  | AnyLink
  | DocFragment[]
  | { [key: string]: DocFragment };

// type DocRecord<T> = {
//   readonly [K in keyof T]: DocFragment;
// };

export type DocFiles = Record<string, DocFileMeta | File>;

export type DocBase = {
  readonly _id: string;
  readonly _files?: DocFiles;
  readonly _publicFiles?: DocFiles;
};

export type DocWithId<T> = DocBase & T;

export type DocSet<T> = Partial<DocBase> & T;

export type DocFileMeta = {
  readonly type: string;
  readonly size: number;
  readonly cid: AnyLink;
  readonly car?: AnyLink;
  url?: string;
  file?: () => Promise<File>;
};

export type DocUpdate<T> = {
  readonly id: string;
  readonly value?: DocSet<T>;
  readonly del?: boolean;
  readonly clock?: AnyLink; // would be useful to give ClockLinks a type
};

// todo merge into above
export type DocValue<T> = {
  readonly doc: DocWithId<T>;
  readonly del: boolean;
  readonly cid: AnyLink;
};

export type IndexKey<K extends IndexKeyType> = [K, string]
export type IndexKeyType = string | number | boolean | IndexKeyType[]

export type IndexUpdate<K extends IndexKeyType> = {
  readonly key: IndexKey<K>;
  readonly value?: DocFragment;
  readonly del?: boolean;
};

export type IndexRow<K extends IndexKeyType, T> = {
  readonly id: string;
  key: IndexKey<K>;
  row?: DocFragment;
  readonly doc?: DocWithId<T>;
  value?: T;
  readonly del?: boolean;
};

export type CRDTMeta = {
  readonly head: ClockHead;
};

export type IdxMeta = {
  readonly byId: AnyLink;
  readonly byKey: AnyLink;
  readonly map: string;
  readonly name: string;
  readonly head: ClockHead;
};

export type IdxMetaMap = {
  readonly indexes: Map<string, IdxMeta>;
};

export type QueryOpts<K extends IndexKeyType> = {
  readonly descending?: boolean;
  readonly limit?: number;
  includeDocs?: boolean;
  readonly range?: [IndexKeyType, IndexKeyType];
  readonly key?: DocFragment;
  readonly keys?: DocFragment[];
  prefix?: IndexKey<K> | [IndexKey<K>]; // thing about later
};

export type AnyLink = Link<unknown, number, number, 1 | 0>;
export type AnyBlock = {
  readonly cid: AnyLink;
  readonly bytes: Uint8Array;
};
export type AnyDecodedBlock = {
  readonly cid: AnyLink;
  readonly bytes: Uint8Array;
  readonly value: any;
};

type EmitFn = (k: IndexKeyType, v?: IndexKeyType) => void;
export type MapFn<T> = (doc: DocWithId<T>, emit: EmitFn) => DocFragment | void;

export type ChangesOptions = {
  readonly dirty?: boolean;
  readonly limit?: number;
};

export type ChangesResponse<T> = {
  readonly clock: ClockHead;
  readonly rows: {
    readonly key: string;
    readonly value: DocWithId<T>;
  }[];
};

export type DbResponse = {
  readonly id: string;
  readonly clock: ClockHead;
};
