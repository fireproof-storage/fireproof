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

export type DocRecord<T> = {
  readonly [K in keyof T]: DocFragment;
};

export type DocFiles = Record<string, DocFileMeta | File>;

export type DocBase = {
  readonly _id?: string;
  readonly _files?: DocFiles;
  readonly _publicFiles?: DocFiles;
};

export type Doc<T extends DocRecord<T> = {}> = DocBase & T;

export type DocFileMeta = {
  readonly type: string;
  readonly size: number;
  readonly cid: AnyLink;
  readonly car?: AnyLink;
  url?: string;
  file?: () => Promise<File>;
};

export type DocUpdate = {
  readonly key: string;
  readonly value?: Record<string, any>;
  readonly del?: boolean;
  readonly clock?: AnyLink; // would be useful to give ClockLinks a type
};

// todo merge into above
export type DocValue = {
  readonly doc?: DocBase;
  readonly del?: boolean;
  cid?: AnyLink;
};

export type IndexKey = [string, string] | string;

export type IndexUpdate = {
  readonly key: IndexKey;
  readonly value?: DocFragment;
  readonly del?: boolean;
};

export type IndexRow<T extends DocRecord<T> = {}> = {
  readonly id: string;
  key: IndexKey;
  row?: DocFragment;
  readonly doc?: Doc<T> | null;
  value?: DocFragment;
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

export type QueryOpts = {
  readonly descending?: boolean;
  readonly limit?: number;
  includeDocs?: boolean;
  readonly range?: [IndexKey, IndexKey];
  readonly key?: DocFragment;
  readonly keys?: DocFragment[];
  prefix?: DocFragment | [DocFragment];
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

type EmitFn = (k: DocFragment, v?: DocFragment) => void;
export type MapFn = <T extends DocRecord<T> = {}>(doc: Doc<T>, emit: EmitFn) => DocFragment | void;

export type ChangesOptions = {
  readonly dirty?: boolean;
  readonly limit?: number;
};

export type ChangesResponse<T extends DocRecord<T> = {}> = {
  readonly clock: ClockHead;
  readonly rows: {
    readonly key: string;
    readonly value: Doc<T>;
  }[];
};

export type DbResponse = {
  readonly id: string;
  readonly clock: ClockHead;
};
