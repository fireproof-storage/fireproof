import { BuildURI, MockLogger, runtimeFn, toCryptoRuntime, URI, utils, LogCollector, Logger, AppContext } from "@adviser/cement";
import { SuperThis, SuperThisOpts, PARAM, Attachable, Attached, CarTransaction, Falsy, DbMeta } from "@fireproof/core";
import { CID } from "multiformats";
import { sha256 } from "multiformats/hashes/sha2";
import * as json from "multiformats/codecs/json";
import { CommitQueue, encodeFile, ensureSuperThis, TaskManager } from "@fireproof/core-runtime";
import { defaultKeyBagOpts, getKeyBag, KeyBag } from "@fireproof/core-keybag";
import { AttachedRemotesImpl, toStoreRuntime } from "@fireproof/core-blockstore";
import {
  Loadable,
  BlockstoreRuntime,
  CarLog,
  AttachedStores,
  ActiveStore,
  CarGroup,
  CommitOpts,
  FPBlock,
  CarBlockItem,
  TransactionMeta,
  AnyLink,
} from "@fireproof/core-types-blockstore";

/* eslint-disable @typescript-eslint/no-empty-function */
export function tracer() {}

async function toFileWithCid(buffer: Uint8Array, name: string, opts: FilePropertyBag): Promise<FileWithCid> {
  return {
    file: new File([new Blob([buffer])], name, opts),
    cid: (await encodeFile(new File([new Blob([buffer])], name, opts))).cid.toString(),
  };
}

export interface FileWithCid {
  file: File;
  cid: string;
}
export async function buildBlobFiles(): Promise<FileWithCid[]> {
  const cp = toCryptoRuntime();
  return [
    await toFileWithCid(cp.randomBytes(Math.random() * 51283), `image.jpg`, { type: "image/jpeg" }),
    await toFileWithCid(cp.randomBytes(Math.random() * 51283), `fireproof.png`, { type: "image/png" }),
  ];
}

export function storageURL(sthis: SuperThis): URI {
  const old = sthis.env.get("FP_STORAGE_URL");
  let merged: URI;
  if (runtimeFn().isBrowser) {
    merged = URI.merge(`indexeddb://fp`, old, "indexeddb:");
  } else {
    merged = URI.merge(`./dist/env`, old);
  }
  return merged;
}

export type MockSuperThis = SuperThis & { ctx: { readonly logCollector: LogCollector } };
export function mockSuperThis(sthis?: Partial<SuperThisOpts>): MockSuperThis {
  const mockLog = MockLogger({
    pass: new utils.ConsoleWriterStreamDefaultWriter(new utils.ConsoleWriterStream()),
  });
  return ensureSuperThis({
    ...sthis,
    logger: mockLog.logger,
    ctx: AppContext.merge({
      logCollector: mockLog.logCollector,
    }),
  }) as MockSuperThis;
}

export function noopUrl(name?: string): URI {
  const burl = BuildURI.from("memory://noop");
  burl.setParam(PARAM.NAME, name || "test");
  return burl.URI();
}

export function simpleBlockOpts(sthis: SuperThis, name?: string) {
  const url = noopUrl(name);
  return {
    keyBag: defaultKeyBagOpts(sthis),
    storeRuntime: toStoreRuntime(sthis),
    storeUrls: {
      file: url,
      wal: url,
      meta: url,
      car: url,
    },
    tracer,
  };
}

export async function simpleCID(sthis: SuperThis) {
  const bytes = json.encode({ hello: sthis.nextId().str });
  const hash = await sha256.digest(bytes);
  return CID.create(1, json.code, hash);
}
class MockLoader implements Loadable {
  readonly sthis: SuperThis;
  readonly logger: Logger;
  readonly ebOpts: BlockstoreRuntime;
  readonly carLog: CarLog;
  readonly attachedStores: AttachedStores;
  readonly taskManager: TaskManager;
  readonly commitQueue: CommitQueue<unknown>;

  constructor(sthis: SuperThis) {
    this.sthis = sthis;
    this.logger = sthis.logger;
    this.ebOpts = {
      // keyBag: sthis.keyBag,
      // storeRuntime: sthis.storeRuntime,
      storeUrls: {
        file: noopUrl("test"),
        wal: noopUrl("test"),
        meta: noopUrl("test"),
        car: noopUrl("test"),
      },
    } as BlockstoreRuntime;
    this.carLog = new CarLog();
    this.taskManager = new TaskManager(sthis, () => Promise.resolve(), {
      removeAfter: 3,
      retryTimeout: 50,
    });
    this.attachedStores = new AttachedRemotesImpl(this);
    this.commitQueue = new CommitQueue({
      tracer,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  attach(attached: Attachable): Promise<Attached> {
    throw new Error("Method not implemented.");
  }
  ready(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  close(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  keyBag(): Promise<KeyBag> {
    return getKeyBag(this.sthis, {});
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  handleDbMetasFromStore(metas: DbMeta[], store: ActiveStore): Promise<CarGroup> {
    // throw new Error("Method not implemented.");
    return Promise.resolve([]);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  commit<T = unknown>(t: CarTransaction, done: T, opts: CommitOpts): Promise<CarGroup> {
    throw new Error("Method not implemented.");
  }
  destroy(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getBlock(cid: AnyLink, store: ActiveStore): Promise<FPBlock | Falsy> {
    throw new Error("Method not implemented.");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  loadFileCar(cid: AnyLink, store: ActiveStore): Promise<FPBlock<CarBlockItem>> {
    throw new Error("Method not implemented.");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  loadCar(cid: AnyLink, store: ActiveStore): Promise<FPBlock<CarBlockItem>> {
    throw new Error("Method not implemented.");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  commitFiles(t: CarTransaction, done: TransactionMeta): Promise<CarGroup> {
    throw new Error("Method not implemented.");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  entries(cache?: boolean): AsyncIterableIterator<FPBlock> {
    throw new Error("Method not implemented.");
  }
}
export function mockLoader(sthis: SuperThis): Loadable {
  return new MockLoader(sthis);
}
