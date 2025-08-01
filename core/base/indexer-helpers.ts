/// <reference types="@fireproof/core-types-base/prolly-trees.d.ts" />
import type { Block } from "multiformats";
import { sha256 as hasher } from "multiformats/hashes/sha2";
import * as codec from "@ipld/dag-cbor";

// @ts-expect-error "charwise" has no types
import charwise from "charwise";
import * as DbIndex from "prolly-trees/db-index";
import { bf, simpleCompare } from "prolly-trees/utils";
import { nocache as cache } from "prolly-trees/cache";

import {
  DocUpdate,
  MapFn,
  DocFragment,
  IndexUpdate,
  QueryOpts,
  IndexRows,
  DocWithId,
  IndexKeyType,
  IndexKey,
  DocTypes,
  DocObject,
  IndexUpdateString,
  CarTransaction,
  CRDT,
  IndexTree,
  FPIndexRow,
} from "@fireproof/core-types-base";
import { BlockFetcher, AnyLink, AnyBlock } from "@fireproof/core-types-blockstore";
import { Logger } from "@adviser/cement";
import { anyBlock2FPBlock } from "@fireproof/core-blockstore";
import { StaticProllyOptions, BaseNode as ProllyNode, IndexRow } from "prolly-trees/base";
import { asyncBlockCreate } from "@fireproof/core-runtime";

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

// declare function bf<T>(factor: number): (entry: T, dist: number) => Promise<boolean>;
// chunker: (entry: T, distance: number) => Promise<boolean>;
export const byKeyOpts: StaticProllyOptions<CompareKey> = { cache, chunker: bf(30), codec, hasher, compare };

export const byIdOpts: StaticProllyOptions<string | number> = { cache, chunker: bf(30), codec, hasher, compare: simpleCompare };

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
    if (!mapCalled && typeof mapReturn !== "undefined") {
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
    return asyncBlockCreate({ cid, bytes, hasher, codec }) as Promise<AnyBlock>;
  };
}

export async function bulkIndex<K extends IndexKeyType, T extends DocFragment, CT>(
  logger: Logger,
  tblocks: CarTransaction,
  inIndex: IndexTree<K, T>,
  indexEntries: (IndexUpdate<K> | IndexUpdateString)[],
  opts: StaticProllyOptions<CT>,
): Promise<IndexTree<K, T>> {
  logger.Debug().Msg("enter bulkIndex");
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
        await tblocks.put(await anyBlock2FPBlock(block));
        returnRootBlock = block;
        returnNode = node;
      }
      if (!returnNode || !returnRootBlock) throw new Error("failed to create index");
      logger.Debug().Msg("exit !root bulkIndex");
      return { root: returnNode, cid: returnRootBlock.cid };
    } else {
      inIndex.root = (await DbIndex.load({ cid: inIndex.cid, get: makeProllyGetBlock(tblocks), ...opts })) as ProllyNode<K, T>;
    }
  }
  logger.Debug().Msg("pre bulk bulkIndex");
  const { root, blocks: newBlocks } = await inIndex.root.bulk(indexEntries);
  if (root) {
    logger.Debug().Msg("pre root put bulkIndex");
    for await (const block of newBlocks) {
      await tblocks.put(await anyBlock2FPBlock(block));
    }
    return { root, cid: (await root.block).cid };
  } else {
    logger.Debug().Msg("pre !root bulkIndex");
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

export async function applyQuery<T extends DocObject, K extends IndexKeyType, R extends DocFragment>(
  crdt: CRDT,
  resp: { result: IndexRow<K, R>[] },
  query: QueryOpts<K>,
): Promise<IndexRows<T, K, R>> {
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
  const rows = resp.result.map(({ key, ...row }) => {
    // First decode the key
    const decodedKey = charwise.decode(key);

    // Use a type-safe approach with Record to check for potentially missing properties
    // This handles the case where some query results use 'row' instead of 'value'
    const dynamicRow = row as Record<string, unknown>;
    if ("row" in dynamicRow && !("value" in dynamicRow)) {
      // We found a result with 'row' property but no 'value' property
      // Create a new normalized object with the 'value' property
      const normalizedRow: Record<string, unknown> = {};
      Object.keys(dynamicRow).forEach((k) => {
        if (k === "row") {
          normalizedRow.value = dynamicRow[k];
        } else {
          normalizedRow[k] = dynamicRow[k];
        }
      });

      return {
        key: decodedKey,
        ...normalizedRow,
      } as IndexRow<K, R>;
    }

    // Standard case - use the properties as they are
    return {
      key: decodedKey,
      ...row,
    } as IndexRow<K, R>;
  });

  // We need to be explicit about the document types here
  const typedRows = rows as FPIndexRow<K, T, R>[];

  // Simply filter out null/undefined docs and cast the result
  const docs = typedRows.filter((r) => !!r.doc) as unknown as DocWithId<T>[];

  return {
    rows: typedRows,
    docs,
  };
}

export function encodeRange(range: [IndexKeyType, IndexKeyType]): [string, string] {
  return [charwise.encode(range[0]), charwise.encode(range[1])];
}

export function encodeKey(key: DocFragment): string {
  return charwise.encode(key) as string;
}

// export interface ProllyIndexRow<K extends IndexKeyType, T extends DocFragment> {
//   readonly id: string;
//   readonly key: IndexKey<K>;
//   readonly value: T;
//   readonly doc?: DocWithId<DocObject>;
// }

// // ProllyNode type based on the ProllyNode from 'prolly-trees/base'
// interface ProllyNode<K extends IndexKeyType, T extends DocFragment> extends BaseNode<K, T> {
//   getAllEntries(): PromiseLike<{ [x: string]: unknown; result: ProllyIndexRow<K, T>[] }>;
//   getMany<KI extends IndexKeyType>(removeIds: KI[]): Promise<{ /* [x: K]: unknown; */ result: IndexKey<K>[] }>;
//   range(a: string, b: string): Promise<{ result: ProllyIndexRow<K, T>[] }>;
//   get(key: string): Promise<{ result: ProllyIndexRow<K, T>[] }>;
//   bulk(bulk: (IndexUpdate<K> | IndexUpdateString)[]): PromiseLike<{
//     readonly root?: ProllyNode<K, T>;
//     readonly blocks: Block[];
//   }>;
//   readonly address: Promise<Link>;
//   readonly distance: number;
//   compare: (a: unknown, b: unknown) => number;
//   readonly cache: unknown;
//   readonly block: Promise<Block>;
// }

// interface StaticProllyOptions<T> {
//   readonly cache: unknown;
//   chunker: (entry: T, distance: number) => boolean;
//   readonly codec: unknown;
//   readonly hasher: unknown;
//   compare: (a: T, b: T) => number;
// }
