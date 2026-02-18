import { asyncBlockDecode } from "@fireproof/core-runtime";
import { parse } from "multiformats/link";
import { Block } from "multiformats/block";
import { sha256 as hasher } from "multiformats/hashes/sha2";
import * as codec from "@ipld/dag-cbor";
import { put, get, entries } from "@web3-storage/pail/crdt";
import {
  EventBlockView,
  EventLink,
  Operation,
  PutOperation,
  Result,
  BlockFetcher as PailBlockFetcher,
} from "@web3-storage/pail/crdt/api";
import { EventFetcher, vis } from "@web3-storage/pail/clock";
import * as Batch from "@web3-storage/pail/crdt/batch";
import { BlockFetcher, TransactionMeta, AnyLink, StoreRuntime } from "@fireproof/core-types-blockstore";
import {
  type EncryptedBlockstore,
  CarTransactionImpl,
  anyBlock2FPBlock,
  doc2FPBlock,
  fileBlock2FPBlock,
} from "@fireproof/core-blockstore";
import {
  type IndexKeyType,
  type DocUpdate,
  type ClockHead,
  type DocValue,
  type CRDTMeta,
  type ChangesOptions,
  type DocFileMeta,
  type DocFiles,
  type DocSet,
  type DocWithId,
  type DocTypes,
  throwFalsy,
  CarTransaction,
  BaseBlockstore,
  PARAM,
  NotFoundError,
} from "@fireproof/core-types-base";
import { Logger } from "@adviser/cement";
import { Link, Version } from "multiformats";

function toString<K extends IndexKeyType>(key: K, logger: Logger): string {
  switch (typeof key) {
    case "string":
    case "number":
      return key.toString();
    default:
      throw logger.Error().Msg("Invalid key type").AsError();
  }
}

export function toPailFetcher(tblocks: BlockFetcher): PailBlockFetcher {
  return {
    get: async <T = unknown, C extends number = number, A extends number = number, V extends Version = 1>(
      link: Link<T, C, A, V>,
    ) => {
      const block = await tblocks.get(link);
      return block
        ? ({
            cid: block.cid,
            bytes: block.bytes,
          } as Block<T, C, A, V>)
        : undefined;
    },
  };
}

export function sanitizeDocumentFields<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map((item: unknown) => {
      if (typeof item === "object" && item !== null) {
        return sanitizeDocumentFields(item);
      }
      return item;
    }) as T;
  } else if (typeof obj === "object" && obj !== null) {
    // Special case for Date objects - convert to ISO string
    if (obj instanceof Date) {
      return obj.toISOString() as unknown as T;
    }

    const typedObj = obj as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key in typedObj) {
      if (Object.hasOwnProperty.call(typedObj, key)) {
        const value = typedObj[key];
        if (value === null || (!Number.isNaN(value) && value !== undefined)) {
          if (typeof value === "object" && !key.startsWith("_")) {
            // Handle Date objects in properties
            if (value instanceof Date) {
              result[key] = (value as Date).toISOString();
            } else {
              const sanitized = sanitizeDocumentFields(value);
              result[key] = sanitized;
            }
          } else {
            result[key] = value;
          }
        }
      }
    }
    return result as T;
  }
  return obj;
}

export async function applyBulkUpdateToCrdt<T extends DocTypes>(
  store: StoreRuntime,
  tblocks: CarTransaction,
  head: ClockHead,
  updates: DocUpdate<T>[],
  logger: Logger,
): Promise<CRDTMeta> {
  let result: Result | null = null;
  if (updates.length > 1) {
    const batch = await Batch.create(toPailFetcher(tblocks), head);
    for (const update of updates) {
      const link = await writeDocContent(store, tblocks, update, logger);
      await batch.put(toString(update.id, logger), link);
    }
    result = await batch.commit();
  } else if (updates.length === 1) {
    const link = await writeDocContent(store, tblocks, updates[0], logger);
    result = await put(toPailFetcher(tblocks), head, toString(updates[0].id, logger), link);
  }
  if (!result) throw logger.Error().Uint64("updates.len", updates.length).Msg("Missing result").AsError();

  if (result.event) {
    for (const block of [
      ...result.additions,
      // ...result.removals,
      result.event,
    ]) {
      tblocks.putSync(await anyBlock2FPBlock(block));
    }
  }
  return { head: result.head }; // satisfies CRDTMeta;
}

// this whole thing can get pulled outside of the write queue
async function writeDocContent<T extends DocTypes>(
  store: StoreRuntime,
  blocks: CarTransaction,
  update: DocUpdate<T>,
  logger: Logger,
): Promise<AnyLink> {
  let value: Partial<DocValue<T>>;
  if (update.del) {
    value = { del: true };
  } else {
    if (!update.value) throw logger.Error().Msg("Missing value").AsError();
    await processFiles(store, blocks, update.value, logger);
    value = { doc: update.value as DocWithId<T> };
  }
  // const ref = await encode({ value, hasher, codec });
  const block = await doc2FPBlock(value);
  // if (ref.cid.toString() !== block.cid.toString()) {
  //   debugger
  // }
  blocks.putSync(block);
  return block.cid;
}

async function processFiles<T extends DocTypes>(store: StoreRuntime, blocks: CarTransaction, doc: DocSet<T>, logger: Logger) {
  if (doc._files) {
    await processFileset(logger, store, blocks, doc._files);
  }
  if (doc._publicFiles) {
    await processFileset(logger, store, blocks, doc._publicFiles /*, true*/);
  }
}

async function processFileset(
  logger: Logger,
  store: StoreRuntime,
  blocks: CarTransaction,
  files: DocFiles /*, publicFiles = false */,
) {
  const dbBlockstore = blocks.parent as unknown as EncryptedBlockstore;
  if (!dbBlockstore.loader) throw logger.Error().Msg("Missing loader, ledger name is required").AsError();
  const t = new CarTransactionImpl(dbBlockstore); // maybe this should move to encrypted-blockstore
  const didPut = [];
  // let totalSize = 0
  for (const filename in files) {
    if (File === files[filename].constructor) {
      const file = files[filename] as File;

      // totalSize += file.size
      const { cid, blocks: fileBlocks } = await store.encodeFile(file);
      didPut.push(filename);
      for (const block of fileBlocks) {
        // console.log("processFileset", block.cid.toString())
        t.putSync(await fileBlock2FPBlock(block));
      }
      files[filename] = { cid, type: file.type, size: file.size, lastModified: file.lastModified } as DocFileMeta;
    } else {
      const { cid, type, size, car, lastModified } = files[filename] as DocFileMeta;
      if (cid && type && size && car) {
        files[filename] = { cid, type, size, car, lastModified };
      }
    }
  }

  if (didPut.length) {
    const car = await dbBlockstore.loader.commitFiles(
      t,
      { files } as unknown as TransactionMeta /* {
      public: publicFiles,
    } */,
    );
    if (car) {
      for (const name of didPut) {
        files[name] = { car, ...files[name] } as DocFileMeta;
      }
    }
  }
}

export async function getValueFromCrdt<T extends DocTypes>(
  blocks: BaseBlockstore,
  head: ClockHead,
  key: string,
  logger: Logger,
): Promise<DocValue<T>> {
  if (!head.length) throw logger.Debug().Msg("Getting from an empty ledger").AsError();
  // console.log("getValueFromCrdt-1", head, key)
  const link = await get(toPailFetcher(blocks), head, key);
  // console.log("getValueFromCrdt-2", key)
  if (!link) {
    // Use NotFoundError instead of logging an error
    throw new NotFoundError(`Not found: ${key}`);
  }
  const ret = await getValueFromLink<T>(blocks, link, logger);
  // console.log("getValueFromCrdt-3", key)
  return ret;
}

export function readFiles<T extends DocTypes>(blocks: BaseBlockstore, { doc }: Partial<DocValue<T>>) {
  if (!doc) return;
  if (doc._files) {
    readFileset(blocks as EncryptedBlockstore, doc._files);
  }
  if (doc._publicFiles) {
    readFileset(blocks as EncryptedBlockstore, doc._publicFiles, true);
  }
}

function readFileset(blocks: EncryptedBlockstore, files: DocFiles, isPublic = false) {
  for (const filename in files) {
    const fileMeta = files[filename] as DocFileMeta;
    if (fileMeta.cid) {
      if (isPublic) {
        fileMeta.url = `https://${fileMeta.cid.toString()}.ipfs.w3s.link/`;
      }
      if (fileMeta.car) {
        fileMeta.file = async () => {
          const result = await blocks.ebOpts.storeRuntime.decodeFile(
            {
              get: async (cid: AnyLink) => {
                return await blocks.getFile(throwFalsy(fileMeta.car), cid);
              },
            },
            fileMeta.cid,
            fileMeta,
          );
          if (result.isErr()) {
            throw blocks.logger.Error().Err(result).Any("cid", fileMeta.cid).Msg("Error decoding file").AsError();
          }

          return result.unwrap();
        };
      }
    }
    files[filename] = fileMeta;
  }
}

async function getValueFromLink<T extends DocTypes>(blocks: BlockFetcher, link: AnyLink, logger: Logger): Promise<DocValue<T>> {
  const block = await blocks.get(link);
  if (!block) throw logger.Error().Str("link", link.toString()).Msg(`Missing linked block`).AsError();
  const { value } = (await asyncBlockDecode({ bytes: block.bytes, hasher, codec })) as { value: DocValue<T> };
  const cvalue = {
    ...value,
    cid: link,
  };
  readFiles(blocks as EncryptedBlockstore, cvalue);
  return cvalue;
}

class DirtyEventFetcher<T> extends EventFetcher<T> {
  readonly logger: Logger;
  constructor(logger: Logger, blocks: BlockFetcher) {
    super(toPailFetcher(blocks));
    this.logger = logger;
  }
  async get(link: EventLink<T>): Promise<EventBlockView<T>> {
    try {
      return await super.get(link);
    } catch (e) {
      this.logger.Error().Ref("link", link.toString()).Err(e).Msg("Missing event");
      return { value: undefined } as unknown as EventBlockView<T>;
    }
  }
}

export async function clockChangesSince<T extends DocTypes>(
  blocks: BlockFetcher,
  head: ClockHead,
  since: ClockHead,
  opts: ChangesOptions,
  logger: Logger,
): Promise<{ result: DocUpdate<T>[]; head: ClockHead }> {
  const eventsFetcher = (
    opts.dirty ? new DirtyEventFetcher<Operation>(logger, blocks) : new EventFetcher<Operation>(toPailFetcher(blocks))
  ) as EventFetcher<Operation>;
  const keys = new Set<string>();
  const updates = await gatherUpdates<T>(
    blocks,
    eventsFetcher,
    head,
    since,
    [],
    keys,
    new Set<string>(),
    opts.limit || Infinity,
    logger,
  );
  return { result: updates.reverse(), head };
}

async function gatherUpdates<T extends DocTypes>(
  blocks: BlockFetcher,
  eventsFetcher: EventFetcher<Operation>,
  head: ClockHead,
  since: ClockHead,
  updates: DocUpdate<T>[] = [],
  keys: Set<string>,
  didLinks: Set<string>,
  limit: number,
  logger: Logger,
): Promise<DocUpdate<T>[]> {
  if (limit <= 0) return updates;
  // if (Math.random() < 0.001) console.log('gatherUpdates', head.length, since.length, updates.length)
  const sHead = head.map((l) => l.toString());
  for (const link of since) {
    if (sHead.includes(link.toString())) {
      return updates;
    }
  }
  for (const link of head) {
    if (didLinks.has(link.toString())) continue;
    didLinks.add(link.toString());
    const { value: event } = await eventsFetcher.get(link);
    if (!event) continue;
    const { type } = event.data;
    let ops = [] as PutOperation[];
    if (type === "batch") {
      ops = event.data.ops as PutOperation[];
    } else if (type === "put") {
      ops = [event.data] as PutOperation[];
    }
    for (let i = ops.length - 1; i >= 0; i--) {
      const { key, value } = ops[i];
      if (!keys.has(key)) {
        // todo option to see all updates
        const docValue = await getValueFromLink<T>(blocks, value, logger);
        if (key === PARAM.GENESIS_CID) {
          continue;
        }
        updates.push({ id: key, value: docValue.doc, del: docValue.del, clock: link });
        limit--;
        keys.add(key);
      }
    }
    if (event.parents) {
      updates = await gatherUpdates(blocks, eventsFetcher, event.parents, since, updates, keys, didLinks, limit, logger);
    }
  }
  return updates;
}

export async function* getAllEntries<T extends DocTypes>(blocks: BlockFetcher, head: ClockHead, logger: Logger) {
  // return entries(blocks, head)
  for await (const [key, link] of entries(toPailFetcher(blocks), head)) {
    // console.log("getAllEntries", key, link);
    if (key !== PARAM.GENESIS_CID) {
      const docValue = await getValueFromLink(blocks, link, logger);
      yield { id: key, value: docValue.doc, del: docValue.del } as DocUpdate<T>;
    }
  }
}

export async function* clockVis(blocks: BlockFetcher, head: ClockHead) {
  for await (const line of vis(toPailFetcher(blocks), head)) {
    yield line;
  }
}

export async function getBlock(blocks: BlockFetcher, cidString: string) {
  const block = await blocks.get(parse(cidString));
  if (!block) throw new Error(`Missing block ${cidString}`);
  const { cid, value } = await asyncBlockDecode({ bytes: block.bytes, codec, hasher });
  return new Block({ cid, value, bytes: block.bytes });
}
