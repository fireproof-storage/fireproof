/// <reference types="./prolly-trees.d.ts" />

import { Logger } from "@adviser/cement";
import {
  BaseBlockstore,
  ClockHead,
  CRDT,
  DocFragment,
  DocTypes,
  IdxMeta,
  IndexKeyType,
  IndexRows,
  MapFn,
  QueryOpts,
} from "./types.js";
import { AnyLink } from "@fireproof/core-types-blockstore";

import { BaseNode } from "prolly-trees/base";

export interface IndexTree<K extends IndexKeyType, R extends DocFragment> {
  cid?: AnyLink;
  root?: BaseNode<K, R>;
  // root?: ProllyNode<K, R>;
}

export interface IndexIf<T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T> {
  readonly blockstore: BaseBlockstore;
  readonly crdt: CRDT;
  readonly name: string;
  mapFn?: MapFn<T>;
  readonly mapFnString: string;
  indexHead?: ClockHead;

  initError?: Error;

  byKey: IndexTree<K, R>;
  byId: IndexTree<K, R>;

  ready(): Promise<void>;

  readonly logger: Logger;

  applyMapFn(name: string, mapFn?: MapFn<T>, meta?: IdxMeta): void;

  query(opts: QueryOpts<K>): Promise<IndexRows<T, K, R>>;
}
