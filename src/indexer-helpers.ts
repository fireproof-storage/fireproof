import type { Block, Link } from "multiformats";
import { create } from "multiformats/block";
import { sha256 as hasher } from "multiformats/hashes/sha2";
import * as codec from "@ipld/dag-cbor";

// @ts-ignore
import charwise from "charwise";
// @ts-ignore
import * as DbIndex from "prolly-trees/db-index";
// @ts-ignore
import { bf, simpleCompare } from "prolly-trees/utils";
// @ts-ignore
import { nocache as cache } from "prolly-trees/cache";
// @ts-ignore
import { ProllyNode as BaseNode } from "prolly-trees/db-index";

import {
  AnyLink,
  DocUpdate,
  MapFn,
  DocFragment,
  IndexKey,
  IndexUpdate,
  QueryOpts,
  IndexRow,
  AnyBlock,
  Doc,
  DocRecord,
} from "./types";
import { CarTransaction, BlockFetcher } from "./storage-engine";
import { CRDT } from "./crdt";

export class IndexTree {
  cid?: AnyLink;
  root?: ProllyNode;
}

type CompareRef = string | number;
type CompareKey = [string | number, CompareRef];

const refCompare = (aRef: CompareRef, bRef: CompareRef) => {
  if (Number.isNaN(aRef)) return -1;
  if (Number.isNaN(bRef)) throw new Error("ref may not be Infinity or NaN");
  if (aRef === Infinity) return 1;
  // if (!Number.isFinite(bRef)) throw new Error('ref may not be Infinity or NaN')
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  return simpleCompare(aRef, bRef) as number;
};

const compare = (a: CompareKey, b: CompareKey) => {
  const [aKey, aRef] = a;
  const [bKey, bRef] = b;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const comp: number = simpleCompare(aKey, bKey);
  if (comp !== 0) return comp;
  return refCompare(aRef, bRef);
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
export const byKeyOpts: StaticProllyOptions = { cache, chunker: bf(30), codec, hasher, compare };
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
export const byIdOpts: StaticProllyOptions = { cache, chunker: bf(30), codec, hasher, compare: simpleCompare };

export function indexEntriesForChanges(changes: DocUpdate[], mapFn: MapFn): { key: [string, string]; value: DocFragment }[] {
  const indexEntries: { key: [string, string]; value: DocFragment }[] = [];
  changes.forEach(({ key: _id, value, del }) => {
    if (del || !value) return;
    let mapCalled = false;
    const mapReturn = mapFn({ _id, ...value }, (k: DocFragment, v?: DocFragment) => {
      mapCalled = true;
      if (typeof k === "undefined") return;
      indexEntries.push({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        key: [charwise.encode(k) as string, _id],
        value: v || null,
      });
    });
    if (!mapCalled && mapReturn) {
      indexEntries.push({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        key: [charwise.encode(mapReturn) as string, _id],
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

export async function bulkIndex(
  tblocks: CarTransaction,
  inIndex: IndexTree,
  indexEntries: IndexUpdate[],
  opts: StaticProllyOptions,
): Promise<IndexTree> {
  if (!indexEntries.length) return inIndex;
  if (!inIndex.root) {
    if (!inIndex.cid) {
      let returnRootBlock: Block | null = null;
      let returnNode: ProllyNode | null = null;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      for await (const node of (await DbIndex.create({
        get: makeProllyGetBlock(tblocks),
        list: indexEntries,
        ...opts,
      })) as ProllyNode[]) {
        const block = await node.block;
        await tblocks.put(block.cid, block.bytes);
        returnRootBlock = block;
        returnNode = node;
      }
      if (!returnNode || !returnRootBlock) throw new Error("failed to create index");
      return { root: returnNode, cid: returnRootBlock.cid };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      inIndex.root = (await DbIndex.load({ cid: inIndex.cid, get: makeProllyGetBlock(tblocks), ...opts })) as ProllyNode;
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

export async function loadIndex(tblocks: BlockFetcher, cid: AnyLink, opts: StaticProllyOptions): Promise<ProllyNode> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  return (await DbIndex.load({ cid, get: makeProllyGetBlock(tblocks), ...opts })) as ProllyNode;
}

export async function applyQuery<T extends DocRecord<T> = {}>(
  crdt: CRDT,
  resp: { result: IndexRow<T>[] },
  query: QueryOpts,
): Promise<{
  rows: IndexRow<T>[];
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
        const doc = val ? ({ _id: row.id, ...val.doc } as Doc<T>) : null;
        return { ...row, doc };
      }),
    );
  }
  return {
    rows: resp.result.map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      row.key = charwise.decode(row.key) as IndexKey;
      if (row.row && !row.value) {
        row.value = row.row;
        delete row.row;
      }
      return row;
    }),
  };
}

export function encodeRange(range: [DocFragment, DocFragment]): [IndexKey, IndexKey] {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  return range.map((key) => charwise.encode(key) as IndexKey) as [IndexKey, IndexKey];
}

export function encodeKey(key: DocFragment): string {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  return charwise.encode(key) as string;
}

// ProllyNode type based on the ProllyNode from 'prolly-trees/base'
interface ProllyNode extends BaseNode {
  getAllEntries<T extends DocRecord<T> = {}>(): PromiseLike<{ [x: string]: any; result: IndexRow<T>[] }>;
  getMany(removeIds: string[]): Promise<{ [x: string]: any; result: IndexKey[] }>;
  range<T extends DocRecord<T> = {}>(a: IndexKey, b: IndexKey): Promise<{ result: IndexRow<T>[] }>;
  get<T extends DocRecord<T> = {}>(key: string): Promise<{ result: IndexRow<T>[] }>;
  bulk(bulk: IndexUpdate[]): PromiseLike<{ root: ProllyNode | null; blocks: Block[] }>;
  readonly address: Promise<Link>;
  readonly distance: number;
  compare: (a: any, b: any) => number;
  readonly cache: any;
  readonly block: Promise<Block>;
}

interface StaticProllyOptions {
  readonly cache: any;
  chunker: (entry: any, distance: number) => boolean;
  readonly codec: any;
  readonly hasher: any;
  compare: (a: any, b: any) => number;
}
