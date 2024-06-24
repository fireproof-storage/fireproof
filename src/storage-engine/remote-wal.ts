import pLimit from "p-limit";
import type { AnyLink, CommitOpts, DbMeta } from "./types.js";
import { type Loadable, carLogIncludesGroup } from "./loader.js";
import { STORAGE_VERSION } from "./store.js";
import { CommitQueue } from "./commit-queue.js";
import { throwFalsy } from "../types.js";

export interface WALState {
  operations: DbMeta[];
  noLoaderOps: DbMeta[];
  fileOperations: {
    readonly cid: AnyLink;
    readonly public: boolean;
  }[];
}

export abstract class RemoteWAL {
  readonly tag: string = "rwal-base";

  readonly STORAGE_VERSION: string = STORAGE_VERSION;
  readonly loader: Loadable;
  readonly ready: Promise<void>;
  readonly url: URL;

  walState: WALState = { operations: [], noLoaderOps: [], fileOperations: [] };
  readonly processing: Promise<void> | undefined = undefined;
  readonly processQueue: CommitQueue<void> = new CommitQueue<void>();

  constructor(loader: Loadable, url: URL) {
    this.loader = loader;
    this.url = url;

    this.ready = Promise.resolve().then(async () => {
      const walState = await this.load().catch((e) => {
        console.error("error loading wal", e);
        return null;
      });
      this.walState.operations = walState?.operations || [];
      this.walState.fileOperations = walState?.fileOperations || [];
    });
  }

  async enqueue(dbMeta: DbMeta, opts: CommitOpts) {
    await this.ready;
    if (opts.noLoader) {
      this.walState.noLoaderOps.push(dbMeta);
    } else {
      this.walState.operations.push(dbMeta);
    }
    await this.save(this.walState);
    void this._process();
  }

  async enqueueFile(fileCid: AnyLink, publicFile = false) {
    await this.ready;
    this.walState.fileOperations.push({ cid: fileCid, public: publicFile });
    // await this.save(this.walState)
  }

  async _process() {
    await this.ready;
    if (!this.loader.remoteCarStore) return;
    await this.processQueue.enqueue(async () => {
      await this._doProcess();
      if (this.walState.operations.length || this.walState.fileOperations.length || this.walState.noLoaderOps.length) {
        setTimeout(() => void this._process(), 0);
      }
    });
  }

  async _doProcess() {
    if (!this.loader.remoteCarStore) return;
    const rmlp = (async () => {
      const operations = [...this.walState.operations];
      const fileOperations = [...this.walState.fileOperations];
      const uploads: Promise<void>[] = [];
      const noLoaderOps = [...this.walState.noLoaderOps];
      const limit = pLimit(5);

      if (operations.length + fileOperations.length + noLoaderOps.length === 0) return;

      for (const dbMeta of noLoaderOps) {
        const uploadP = limit(async () => {
          for (const cid of dbMeta.cars) {
            const car = await (await this.loader.carStore()).load(cid);
            if (!car) {
              if (carLogIncludesGroup(this.loader.carLog, dbMeta.cars)) throw new Error(`missing local car ${cid.toString()}`);
            } else {
              await throwFalsy(this.loader.remoteCarStore).save(car);
            }
            this.walState.noLoaderOps = this.walState.noLoaderOps.filter((op) => op !== dbMeta);
          }
        });
        uploads.push(uploadP);
      }

      for (const dbMeta of operations) {
        const uploadP = limit(async () => {
          for (const cid of dbMeta.cars) {
            const car = await (await this.loader.carStore()).load(cid).catch(() => null);
            if (!car) {
              if (carLogIncludesGroup(this.loader.carLog, dbMeta.cars)) throw new Error(`missing local car ${cid.toString()}`);
            } else {
              await throwFalsy(this.loader.remoteCarStore).save(car);
            }
          }
          this.walState.operations = this.walState.operations.filter((op) => op !== dbMeta);
        });
        uploads.push(uploadP);
      }

      if (fileOperations.length) {
        const dbLoader = this.loader;
        for (const { cid: fileCid, public: publicFile } of fileOperations) {
          const uploadP = limit(async () => {
            const fileBlock = await (await dbLoader.fileStore()).load(fileCid); // .catch(() => false)
            await dbLoader.remoteFileStore?.save(fileBlock, { public: publicFile });
            this.walState.fileOperations = this.walState.fileOperations.filter((op) => op.cid !== fileCid);
          });
          uploads.push(uploadP);
        }
      }

      try {
        const res = await Promise.allSettled(uploads);
        const errors = res.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
        if (errors.length) {
          console.error("error uploading", JSON.stringify(errors.map((e) => e.reason)));
          throw errors[0].reason;
        }
        if (operations.length) {
          const lastOp = operations[operations.length - 1];
          // console.log('saving remote meta', lastOp.car.toString())
          await this.loader.remoteMetaStore?.save(lastOp).catch((e: Error) => {
            console.error("error saving remote meta", e);
            this.walState.operations.push(lastOp);
            throw e;
          });
        }
      } finally {
        await this.save(this.walState);
      }
    })();
    // this.loader.remoteMetaLoading = rmlp;
    await rmlp;
  }

  abstract load(branch?: string): Promise<WALState | null>;
  abstract save(state: WALState, branch?: string): Promise<void>;
}
