import type { Block, Link } from "multiformats";
import { create } from "./runtime/wait-pr-multiformats/block.js";
import { sha256 as hasher } from "multiformats/hashes/sha2";
import * as codec from "@ipld/dag-cbor";

// @ts-expect-error "charwise" has no types
import charwise from "charwise";
// @ts-expect-error "prolly-trees" has no types
import * as DbIndex from "prolly-trees/db-index";
// @ts-expect-error "prolly-trees" has no types
import { bf, simpleCompare } from "prolly-trees/utils";
// @ts-expect-error "prolly-trees" has no types
import { nocache as cache } from "prolly-trees/cache";
// @ts-expect-error "prolly-trees" has no types
import { ProllyNode as BaseNode } from "prolly-trees/db-index";

import {
  DocUpdate,
  MapFn,
  DocFragment,
  IndexUpdate,
  QueryOpts,
  IndexRow,
  DocWithId,
  IndexKeyType,
  IndexKey,
  DocTypes,
  DocObject,
  IndexUpdateString,
} from "./types.js";
import { CarTransaction, BlockFetcher, AnyLink, AnyBlock } from "./blockstore/index.js";
import { CRDT } from "./crdt.js";

export class IndexTree<K extends IndexKeyType, R extends DocFragment> {
  cid?: AnyLink;
  root?: ProllyNode<K, R>;
}

type CompareRef = string | number;
export type CompareKey = [string | number, CompareRef];

function refCompare(aRef: CompareRef, bRef: CompareRef) {
  if (Number.isNaN(aRef)) return -1;
  if (Number.isNaN(bRef)) throw new Error("ref may not be Infinity or NaN");
  if (aRef === Infinity) return 1;
  // if (!Number.isFinite(bRef)) throw new Error('ref may not be Infinity or NaN')

  return simpleCompare(aRef, bRef) as number;
}

function compare(a: CompareKey, b: CompareKey) {
  const [aKey, aRef] = a;
  const [bKey, bRef] = b;

  const comp: number = simpleCompare(aKey, bKey);
  if (comp !== 0) return comp;
  return refCompare(aRef, bRef);
}

export const byKeyOpts: StaticProllyOptions<CompareKey> = { cache, chunker: bf(30), codec, hasher, compare };

export const byIdOpts: StaticProllyOptions<unknown> = { cache, chunker: bf(30), codec, hasher, compare: simpleCompare };

export interface IndexDoc<K extends IndexKeyType> {
  readonly key: IndexKey<K>;
  readonly value: DocFragment;
}

export interface IndexDocString {
  readonly key: string;
  readonly value: DocFragment;
}

export function indexEntriesForChanges<T extends DocTypes, K extends IndexKeyType>(
  changes: DocUpdate<T>[],
  mapFn: MapFn<T>,
): IndexDoc<K>[] {
  const indexEntries: IndexDoc<K>[] = [];
  changes.forEach(({ id: key, value, del }) => {
    if (del || !value) return;
    let mapCalled = false;
    const mapReturn = mapFn({ ...(value as DocWithId<T>), _id: key }, (k: IndexKeyType, v?: DocFragment) => {
      mapCalled = true;
      if (typeof k === "undefined") return;
      indexEntries.push({
        key: [charwise.encode(k) as K, key],
        value: v || null,
      });
    });
    if (!mapCalled && mapReturn) {
      indexEntries.push({
        key: [charwise.encode(mapReturn) as K, key],
        value: null,
      });
    }
  });
  return indexEntries;
}

function makeProllyGetBlock(blocks: BlockFetcher): (address: AnyLink) => Promise<AnyBlock> {
  return async (address: AnyLink) => {
    const block = await blocks.get(address);
    if (!block) throw new Error(`Missing block ${address.toString()}`);
    const { cid, bytes } = block;
    return create({ cid, bytes, hasher, codec }) as Promise<AnyBlock>;
  };
}

export async function bulkIndex<K extends IndexKeyType, T extends DocFragment, CT>(
  tblocks: CarTransaction,
  inIndex: IndexTree<K, T>,
  indexEntries: (IndexUpdate<K> | IndexUpdateString)[],
  opts: StaticProllyOptions<CT>,
): Promise<IndexTree<K, T>> {
  if (!indexEntries.length) return inIndex;
  if (!inIndex.root) {
    if (!inIndex.cid) {
      let returnRootBlock: Block | undefined = undefined;
      let returnNode: ProllyNode<K, T> | undefined = undefined;

      for await (const node of (await DbIndex.create({
        get: makeProllyGetBlock(tblocks),
        list: indexEntries,
        ...opts,
      })) as ProllyNode<K, T>[]) {
        const block = await node.block;
        await tblocks.put(block.cid, block.bytes);
        returnRootBlock = block;
        returnNode = node;
      }
      if (!returnNode || !returnRootBlock) throw new Error("failed to create index");
      return { root: returnNode, cid: returnRootBlock.cid };
    } else {
      inIndex.root = (await DbIndex.load({ cid: inIndex.cid, get: makeProllyGetBlock(tblocks), ...opts })) as ProllyNode<K, T>;
    }
  }
  const { root, blocks: newBlocks } = await inIndex.root.bulk(indexEntries);
  if (root) {
    for await (const block of newBlocks) {
      await tblocks.put(block.cid, block.bytes);
    }
    return { root, cid: (await root.block).cid };
  } else {
    return { root: undefined, cid: undefined };
  }
}

export async function loadIndex<K extends IndexKeyType, T extends DocFragment, CT>(
  tblocks: BlockFetcher,
  cid: AnyLink,
  opts: StaticProllyOptions<CT>,
): Promise<ProllyNode<K, T>> {
  return (await DbIndex.load({ cid, get: makeProllyGetBlock(tblocks), ...opts })) as ProllyNode<K, T>;
}

export async function applyQuery<K extends IndexKeyType, T extends DocObject, R extends DocFragment>(
  crdt: CRDT<T>,
  resp: { result: ProllyIndexRow<K, R>[] },
  query: QueryOpts<K>,
): Promise<{
  rows: IndexRow<K, T, R>[];
}> {
  if (query.descending) {
    resp.result = resp.result.reverse();
  }
  if (query.limit) {
    resp.result = resp.result.slice(0, query.limit);
  }
  if (query.includeDocs) {
    resp.result = await Promise.all(
      resp.result.map(async (row) => {
        const val = await crdt.get(row.id);
        const doc = val ? ({ ...val.doc, _id: row.id } as DocWithId<T>) : undefined;
        return { ...row, doc };
      }),
    );
  }
  return {
    rows: resp.result.map(({ key, ...row }) => {
      return {
        key: charwise.decode(key),
        ...row,
      };
    }),
  };
}

export function encodeRange(range: [IndexKeyType, IndexKeyType]): [string, string] {
  return [charwise.encode(range[0]), charwise.encode(range[1])];
}

export function encodeKey(key: DocFragment): string {
  return charwise.encode(key) as string;
}

export interface ProllyIndexRow<K extends IndexKeyType, T extends DocFragment> {
  readonly id: string;
  readonly key: IndexKey<K>;
  readonly value: T;
}

// ProllyNode type based on the ProllyNode from 'prolly-trees/base'
interface ProllyNode<K extends IndexKeyType, T extends DocFragment> extends BaseNode {
  getAllEntries(): PromiseLike<{ [x: string]: unknown; result: ProllyIndexRow<K, T>[] }>;
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

interface StaticProllyOptions<T> {
  readonly cache: unknown;
  chunker: (entry: T, distance: number) => boolean;
  readonly codec: unknown;
  readonly hasher: unknown;
  compare: (a: T, b: T) => number;
}
