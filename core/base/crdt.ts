import type { Block } from "multiformats";
import { Logger, ResolveOnce } from "@adviser/cement";
import { EncryptedBlockstore, toStoreRuntime } from "@fireproof/core-blockstore";
import {
  clockChangesSince,
  applyBulkUpdateToCrdt,
  getValueFromCrdt,
  readFiles,
  getAllEntries,
  clockVis,
  getBlock,
  sanitizeDocumentFields,
} from "./crdt-helpers.js";
import {
  type DocUpdate,
  type CRDTMeta,
  type ClockHead,
  type ChangesOptions,
  type DocValue,
  type IndexKeyType,
  type DocWithId,
  type Falsy,
  type SuperThis,
  type IndexTransactionMeta,
  type LedgerOpts,
  type BaseBlockstore,
  type CRDT,
  type CRDTClock,
  type CarTransaction,
  type DocTypes,
  PARAM,
  Ledger,
  TraceEvent,
} from "@fireproof/core-types-base";
import { index, type Index } from "./indexer.js";
// import { blockstoreFactory } from "./blockstore/transaction.js";
import { ensureLogger, getCompactStrategy } from "@fireproof/core-runtime";
import { CRDTClockImpl } from "./crdt-clock.js";
import { TransactionMeta, BlockstoreOpts } from "@fireproof/core-types-blockstore";

export type CRDTOpts = Omit<LedgerOpts, "storeUrls"> & {
  readonly storeUrls: {
    readonly data: LedgerOpts["storeUrls"]["data"];
    readonly idx?: LedgerOpts["storeUrls"]["idx"];
  };
};

function tracerAction(opts: CRDTOpts, parent?: Ledger) {
  return (event: TraceEvent) => {
    switch (event.event) {
      case "idleFromCommitQueue":
        opts.tracer({
          event: "idleFromBlockstore",
          blockstore: "data",
          ledger: parent,
        });
        break;
      case "busyFromCommitQueue":
        opts.tracer({
          event: "busyFromBlockstore",
          blockstore: "data",
          ledger: parent,
          queueLen: event.queueLen,
        });
        break;
      default:
        return opts.tracer(event);
    }
  };
}

export class CRDTImpl implements CRDT {
  readonly opts: CRDTOpts;

  readonly blockstore: BaseBlockstore;
  // we can run without an index instance
  readonly indexBlockstore?: BaseBlockstore;
  readonly indexers = new Map<string, Index<DocTypes, IndexKeyType>>();
  readonly clock: CRDTClock;

  readonly logger: Logger;
  readonly sthis: SuperThis;
  // self reference to fullfill HasCRDT
  readonly crdt: CRDT;

  readonly ledgerParent?: Ledger;

  constructor(sthis: SuperThis, opts: CRDTOpts, parent?: Ledger) {
    this.sthis = sthis;
    this.ledgerParent = parent;
    this.crdt = this;
    this.logger = ensureLogger(sthis, "CRDTImpl");
    this.opts = opts;
    const rCompactStrategy = getCompactStrategy(this.opts.compactStrategy);
    if (rCompactStrategy.isErr()) {
      throw this.logger
        .Error()
        .Err(rCompactStrategy.Err())
        .Str("compactorName", this.opts.compactStrategy)
        .Msg("compactor not found")
        .AsError();
    }
    const blockstoreOpts = {
      tracer: tracerAction(opts, parent),
      applyMeta: async (meta: TransactionMeta) => {
        const crdtMeta = meta as CRDTMeta;
        if (!crdtMeta.head) throw this.logger.Error().Msg("missing head").AsError();
        // console.log("applyMeta-pre", crdtMeta.head, this.clock.head);
        await this.clock.applyHead(crdtMeta.head, []);
        // console.log("applyMeta-post", crdtMeta.head, this.clock.head);
      },
      compactStrategy: rCompactStrategy.Ok(),
      gatewayInterceptor: opts.gatewayInterceptor,
      // autoCompact: this.opts.autoCompact || 100,
      storeRuntime: toStoreRuntime(this.sthis, this.opts.storeEnDe),
      storeUrls: this.opts.storeUrls.data,
      keyBag: this.opts.keyBag,
      // public: this.opts.public,
      meta: this.opts.meta,
      // threshold: this.opts.threshold,
    } satisfies BlockstoreOpts;

    this.blockstore = new EncryptedBlockstore(sthis, blockstoreOpts, this);
    if (this.opts.storeUrls.idx) {
      this.indexBlockstore = new EncryptedBlockstore(
        sthis,
        {
          tracer: opts.tracer,
          // name: opts.name,
          applyMeta: async (meta: TransactionMeta) => {
            const idxCarMeta = meta as IndexTransactionMeta;
            if (!idxCarMeta.indexes) throw this.logger.Error().Msg("missing indexes").AsError();
            for (const [name, idx] of Object.entries(idxCarMeta.indexes)) {
              index(this, name, undefined, idx);
            }
          },
          gatewayInterceptor: opts.gatewayInterceptor,
          storeRuntime: toStoreRuntime(this.sthis, this.opts.storeEnDe),
          storeUrls: this.opts.storeUrls.idx,
          keyBag: this.opts.keyBag,
          // public: this.opts.public,
        },
        this,
      );
    }
    this.clock = new CRDTClockImpl(this.blockstore);
    this.clock.onZoom(() => {
      for (const idx of this.indexers.values()) {
        idx._resetIndex();
      }
    });
  }

  async bulk<T extends DocTypes>(updates: DocUpdate<T>[]): Promise<CRDTMeta> {
    await this.ready();
    updates = updates.map((dupdate: DocUpdate<T>) => ({
      ...dupdate,
      value: sanitizeDocumentFields(dupdate.value),
    }));

    if (this.clock.head.length === 0) {
      // INJECT GENESIS Block
      const value = { id: PARAM.GENESIS_CID, value: { _id: PARAM.GENESIS_CID } }; // satisfies DocUpdate<DocSet<DocTypes>>;
      // const block = await encode({ value, hasher: sha256, codec: dagCodec });
      await this._bulk([value]);
    }
    return await this._bulk(updates);
  }

  async _bulk<T extends DocTypes>(updates: DocUpdate<T>[]): Promise<CRDTMeta> {
    const prevHead = [...this.clock.head];
    const done = await this.blockstore.transaction<CRDTMeta>(async (blocks: CarTransaction): Promise<CRDTMeta> => {
      const { head } = await applyBulkUpdateToCrdt<DocTypes>(
        this.blockstore.ebOpts.storeRuntime,
        blocks,
        this.clock.head,
        updates,
        this.logger,
      );
      updates = updates.map((dupdate: DocUpdate<T>) => {
        // if (!dupdate.value) throw new Error("missing value");
        readFiles(this.blockstore, { doc: dupdate.value as DocWithId<DocTypes> });
        return dupdate;
      });
      return { head };
    });
    await this.clock.applyHead(done.meta.head, prevHead, updates);
    return done.meta;
  }

  readonly onceReady: ResolveOnce<void> = new ResolveOnce<void>();
  async ready(): Promise<void> {
    return this.onceReady.once(async () => {
      try {
        // console.log("bs-ready-pre")
        // await this.blockstore.ready();
        // console.log("bs-ready-post-1")
        // await this.indexBlockstore?.ready();
        // console.log("bs-ready-post-2")
        // await this.clock.ready();
        // console.log("bs-ready-post-3")
        await Promise.all([
          this.blockstore.ready(),
          this.indexBlockstore ? this.indexBlockstore.ready() : Promise.resolve(),
          this.clock.ready(),
        ]);
      } catch (e) {
        throw this.logger.Error().Err(e).Msg(`CRDT is not ready`).AsError();
      }
    });
  }

  async close(): Promise<void> {
    // await this.blockstore.close();
    // await this.indexBlockstore.close();
    // await this.clock.close();
    await Promise.all([
      this.blockstore.close(),
      this.indexBlockstore ? this.indexBlockstore.close() : Promise.resolve(),
      this.clock.close(),
    ]);
  }

  async destroy(): Promise<void> {
    await Promise.all([this.blockstore.destroy(), this.indexBlockstore ? this.indexBlockstore.destroy() : Promise.resolve()]);
  }

  // if (snap) await this.clock.applyHead(crdtMeta.head, this.clock.head)

  async allDocs<T extends DocTypes>(): Promise<{ result: DocUpdate<T>[]; head: ClockHead }> {
    await this.ready();
    const result: DocUpdate<T>[] = [];
    for await (const entry of getAllEntries<DocTypes>(this.blockstore, this.clock.head, this.logger)) {
      result.push(entry as DocUpdate<T>);
    }
    return { result, head: this.clock.head };
  }

  async vis(): Promise<string> {
    await this.ready();
    const txt: string[] = [];
    for await (const line of clockVis(this.blockstore, this.clock.head)) {
      txt.push(line);
    }
    return txt.join("\n");
  }

  async getBlock(cidString: string): Promise<Block> {
    await this.ready();
    return await getBlock(this.blockstore, cidString);
  }

  async get(key: string): Promise<DocValue<DocTypes> | Falsy> {
    await this.ready();
    const result = await getValueFromCrdt<DocTypes>(this.blockstore, this.clock.head, key, this.logger);
    if (result.del) return undefined;
    return result;
  }

  async changes<T extends DocTypes>(
    since: ClockHead = [],
    opts: ChangesOptions = {},
  ): Promise<{
    result: DocUpdate<T>[];
    head: ClockHead;
  }> {
    await this.ready();
    return await clockChangesSince<T>(this.blockstore, this.clock.head, since, opts, this.logger);
  }

  async compact(): Promise<void> {
    const blocks = this.blockstore as EncryptedBlockstore;
    return await blocks.compact();
  }
}
