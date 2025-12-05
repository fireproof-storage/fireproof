// export interface Database extends ReadyCloseDestroy, HasLogger, HasSuperThis {
//   // readonly name: string;
//   readonly ledger: Ledger;
//   readonly logger: Logger;
//   readonly sthis: SuperThis;
//   // readonly id: string;
//   readonly name: string;

import { AppContext, Future, KeyedResolvOnce, Lazy, Logger, OnFunc, OnFuncReturn, Result, timeouted } from "@adviser/cement";
import {
  AllDocsQueryOpts,
  AllDocsResponse,
  Attachable,
  Attached,
  BulkResponse,
  ChangesOptions,
  ChangesResponse,
  ClockHead,
  Database,
  DatabaseConfig,
  DatabaseConfigWithName,
  DatabaseConfigWithNameSchema,
  DocFragment,
  DocResponse,
  DocSet,
  DocTypes,
  DocWithId,
  IndexKeyType,
  Ledger,
  ListenerFn,
  MapFn,
  QueryOpts,
  QueryResult,
  SuperThis,
} from "@fireproof/core-types-base";
import { ensureLogger, ensureSuperThis, hashObjectSync, makePartial } from "@fireproof/core-runtime";
import {
  FPApiPostMessageTransport,
  FPApiTransportCtx,
  FPTransport,
  FPTransportOriginCTX,
  FPTransportTargetCTX,
  isResApplyDatabaseConfig,
  MsgBase,
  MsgTypeSchema,
  ReqApplyDatabaseConfig,
  ResApplyDatabaseConfig,
  ResDBGet,
  ReqDBGet,
  isResDBGet,
  ResDBGetSchema,
  MsgType,
  DBSend,
} from "@fireproof/core-svc-protocol";

const console = {
  log: (..._args: unknown[]) => {
    /* noop */
  },
  warn: globalThis.console.warn.bind(globalThis.console),
  error: globalThis.console.error.bind(globalThis.console),
};
//   onClosed(fn: () => void): void;

//   attach(a: Attachable): Promise<Attached>;

//   get<T extends DocTypes>(id: string): Promise<DocWithId<T>>;
//   put<T extends DocTypes>(doc: DocSet<T>): Promise<DocResponse>;
//   bulk<T extends DocTypes>(docs: DocSet<T>[]): Promise<BulkResponse>;
//   del(id: string): Promise<DocResponse>;
//   remove(id: string): Promise<DocResponse>;
//   changes<T extends DocTypes>(since?: ClockHead, opts?: ChangesOptions): Promise<ChangesResponse<T>>;

//   allDocs<T extends DocTypes>(opts?: Partial<AllDocsQueryOpts>): Promise<AllDocsResponse<T>>;

//   allDocuments<T extends DocTypes>(opts?: Partial<AllDocsQueryOpts>): Promise<AllDocsResponse<T>>;

//   subscribe<T extends DocTypes>(listener: ListenerFn<T>, updates?: boolean): () => void;

//   // query<T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T>(field: string | MapFn<T>, opts: Partial<QueryOptsWithoutDocs<K>>): Promise<IndexRowsWithoutDocs<T, K, R>>;
//   // query<T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T>(field: string | MapFn<T>, opts: Partial<QueryOptsWithDocs<K>>): Promise<IndexRowsWithDocs<T, K, R>>;
//   // query<T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T>(field: string | MapFn<T>, opts?: Partial<QueryOptsWithUndefDocs<K>>): Promise<IndexRowsWithDocs<T, K, R>>;

//   query<
//     T extends DocTypes,
//     K extends IndexKeyType = string,
//     R extends DocFragment = T,
//     O extends Partial<QueryOpts<K>> = Partial<QueryOpts<K>>,
//   >(
//     field: string | MapFn<T>,
//     opts?: O,
//   ): Promise<QueryResult<T, K, R, O>>;

//   // query<T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T>(field: string | MapFn<T>, opts?: undefined): Promise<IndexRowsWithDocs<T, K, R>>;
//   // query<T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T>(field: string | MapFn<T>, opts?: Partial<QueryOpts<K>>): Promise<IndexRows<T, K, R>>;
//   compact(): Promise<void>;
// }

class DatabaseProxy implements Database {
  readonly ledger: Ledger;
  readonly logger: Logger;
  readonly sthis: SuperThis;
  readonly name: string;
  readonly proxyCfg: DatabaseInternalProxyConfig;
  readonly id: string;
  readonly transport: FPTransport;
  readonly roundTripTimeoutMs: number;
  constructor(
    cfg: DatabaseInternalProxyConfig & FPApiTransportCtx & FPApiTransportParams & { readonly refId: string; readonly name: string },
  ) {
    this.ledger = {
      ctx: new AppContext(),
    } as Ledger;
    this.sthis = ensureSuperThis();
    this.logger = ensureLogger(this.sthis, "DatabaseProxy", {
      dbName: cfg.name,
    });
    this.proxyCfg = cfg;
    this.name = cfg.name;
    this.id = cfg.refId;
    this.transport = cfg.transport;
    this.ledger.ctx.set("transport", this.transport);
    this.roundTripTimeoutMs = cfg.roundTripTimeoutMs;
    console.log("DatabaseProxy created for", this.name, "with id", this.id);
  }

  onClosed(_fn: () => void): void {
    throw new Error("Method not implemented.");
  }
  attach(_a: Attachable): Promise<Attached> {
    throw new Error("Method not implemented.");
  }

  transaction<Q extends MsgType, S extends MsgType>(
    req: DBSend<Q>,
    onRes: (fn: (res: S) => void) => void,
    skipReady = false,
  ): Promise<Result<S>> {
    // console.log("DatabaseProxy.transaction called with", req);
    return (skipReady ? Promise.resolve() : this.myReady())
      .then(() => {
        // console.log("DatabaseProxy.transaction sending request", req);
        const wait = new Future<S>();
        onRes((res) => {
          // console.log("DatabaseProxy.transaction received response", res, "waiting for", wait.id());
          if (res.tid === wait.id()) {
            wait.resolve(res);
            return OnFuncReturn.UNREGISTER;
          }
        });
        // console.log("DatabaseProxy.transaction waiting for response to", req, this.transport.send.toString());
        this.transport.send(
          {
            ...req,
            tid: req.tid || wait.id(),
            src: req.src || this.proxyCfg.origin,
          } as Q,
          { ...this.proxyCfg },
        ); //.then((sendResult) => {
        // console.log("DatabaseProxy.transaction request sent", sendResult, this.proxyCfg);
        // });
        return timeouted(wait.asPromise(), {
          timeout: this.roundTripTimeoutMs,
        });
      })
      .then((r) => {
        console.log("DatabaseProxy.transaction completed with", r);
        if (r.state !== "success") {
          return this.logger
            .Error()
            .Any({ ...r })
            .Msg("Transaction failed")
            .ResultError();
        }
        return Result.Ok(r.value);
      });
  }

  readonly onResDBGet = OnFunc<(res: ResDBGet, ctx: FPTransportOriginCTX) => void>();
  get<T extends DocTypes>(_id: string): Promise<DocWithId<T>> {
    return this.transaction<ReqDBGet, ResDBGet>(
      {
        tid: "",
        src: this.proxyCfg.origin,
        dst: this.proxyCfg.target,
        type: "reqDBGet",
        dbName: this.name,
        dbId: this.id,
        docIds: [_id],
      },
      this.onResDBGet,
    ).then((res) => {
      if (res.isErr()) {
        return Promise.reject(res.Err());
      }
      const resParse = ResDBGetSchema.safeParse(res.Ok());
      if (!resParse.success) {
        return Promise.reject(
          this.logger.Error().Any({ res: res.Ok() }).Msg("Failed to parse ResDBGet in DatabaseProxy.get").AsError(),
        );
      }
      return Promise.resolve(res.Ok().results[0] as unknown as DocWithId<T>);
    });
  }
  put<T extends DocTypes>(_doc: DocSet<T>): Promise<DocResponse> {
    return this.ready().then(() => {
      throw new Error("Method not implemented.");
    });
  }
  bulk<T extends DocTypes>(_docs: DocSet<T>[]): Promise<BulkResponse> {
    return this.ready().then(() => {
      throw new Error("Method not implemented.");
    });
  }
  del(_id: string): Promise<DocResponse> {
    return this.ready().then(() => {
      throw new Error("Method not implemented.");
    });
  }
  remove(_id: string): Promise<DocResponse> {
    return this.ready().then(() => {
      throw new Error("Method not implemented.");
    });
  }
  changes<T extends DocTypes>(_since?: ClockHead, _opts?: ChangesOptions): Promise<ChangesResponse<T>> {
    return this.ready().then(() => {
      throw new Error("Method not implemented.");
    });
  }
  allDocs<T extends DocTypes>(_opts?: Partial<AllDocsQueryOpts>): Promise<AllDocsResponse<T>> {
    return this.ready().then(() => {
      throw new Error("Method not implemented.");
    });
  }
  allDocuments<T extends DocTypes>(_opts?: Partial<AllDocsQueryOpts>): Promise<AllDocsResponse<T>> {
    return this.ready().then(() => {
      throw new Error("Method not implemented.");
    });
  }
  subscribe<T extends DocTypes>(_listener: ListenerFn<T>, _updates?: boolean): () => void {
    return this.ready().then(() => {
      throw new Error("Method not implemented.");
    }) as unknown as () => void;
  }
  query<
    T extends DocTypes,
    K extends IndexKeyType = string,
    R extends DocFragment = T,
    O extends Partial<QueryOpts<K>> = Partial<QueryOpts<K>>,
  >(_field: string | MapFn<T>, _opts?: O): Promise<QueryResult<T, K, R, O>> {
    return this.ready().then(() => {
      throw new Error("Method not implemented.");
    });
  }
  compact(): Promise<void> {
    return this.ready().then(() => {
      throw new Error("Method not implemented.");
    });
  }
  close(): Promise<void> {
    return this.ready().then(() => {
      throw new Error("Method not implemented.");
    });
  }
  destroy(): Promise<void> {
    return this.ready().then(() => {
      throw new Error("Method not implemented.");
    });
  }

  readonly onResApplyDatabaseConfig = OnFunc<(res: ResApplyDatabaseConfig, ctx: FPTransportOriginCTX) => void>();
  readonly appliedDatabaseConfig = Lazy(() => {
    return this.transaction<ReqApplyDatabaseConfig, ResApplyDatabaseConfig>(
      {
        dst: this.proxyCfg.target,
        type: "reqApplyDatabaseConfig",
        config: makePartial(DatabaseConfigWithNameSchema).parse(this.proxyCfg),
      },
      this.onResApplyDatabaseConfig,
      true,
    );
  });
  //   const waitResApplyDatabaseConfig = new Future<ResApplyDatabaseConfig>();
  //   this.onResApplyDatabaseConfig((res, _ctx) => {
  //     if (res.tid === waitResApplyDatabaseConfig.id()) {
  //       waitResApplyDatabaseConfig.resolve(res);
  //       return OnFuncReturn.UNREGISTER;
  //     }
  //   });
  //   this.transport.send(
  //     {
  //       tid: waitResApplyDatabaseConfig.id(),
  //       src: this.proxyCfg.origin,
  //       dst: this.proxyCfg.target,
  //       type: "reqApplyDatabaseConfig",
  //       config: makePartial(DatabaseConfigWithNameSchema).parse(this.proxyCfg),
  //     },
  //     { ...this.proxyCfg },
  //   );
  //   return timeouted(waitResApplyDatabaseConfig.asPromise(), {
  //     timeout: this.roundTripTimeoutMs,
  //   });
  // });

  readonly myReady = Lazy(
    (): Promise<ResApplyDatabaseConfig> =>
      this.transport.start().then((r) => {
        if (r.isErr()) {
          return Promise.reject(
            this.logger
              .Error()
              .Err(r)
              .Any({ ...this.proxyCfg })
              .Msg("Failed to start transport for DatabaseProxy")
              .AsError(),
          );
        }
        console.log("DatabaseProxy.transport started", this.name);
        this.transport.recv(async (msg: MsgBase, ctx: FPTransportOriginCTX) => {
          const parsed = MsgTypeSchema.safeParse(msg);
          console.log("DatabaseProxy received message", this.id, this.name, msg, parsed.success);
          if (!parsed.success) {
            this.logger.Error().Any({ msg, origin: ctx.origin }).Msg("Received invalid message in DatabaseProxy");
            return;
          }
          switch (true) {
            case isResApplyDatabaseConfig(parsed.data):
              this.onResApplyDatabaseConfig.invoke(parsed.data, ctx);
              break;
            case isResDBGet(parsed.data):
              this.onResDBGet.invoke(parsed.data, ctx);
              break;
            default:
              this.logger.Warn().Any({ msg, origin: ctx.origin }).Msg("Received unhandled message type in DatabaseProxy");
              break;
          }
        });
        return this.appliedDatabaseConfig().then((res) => {
          if (res.isErr()) {
            return Promise.reject(res.Err());
          }
          this.logger.Info().Any(res.Ok()).Msg("DatabaseProxy ready");
          return Promise.resolve(res.Ok());
        });
      }),
  );
  ready(): Promise<void> {
    return this.myReady().then(() => Promise.resolve());
  }
}

type KeyedDatabaseConfig = DatabaseProxyConfig & { readonly name: string };
const fireproofProxies = new KeyedResolvOnce<Database, KeyedDatabaseConfig>({
  key2string: (cfg: KeyedDatabaseConfig) => {
    //export function makePartial<T extends z.ZodObject<Record<string, z.ZodTypeAny>>>(schema: T): T {
    const parsed = makePartial(DatabaseConfigWithNameSchema).safeParse(cfg);
    if (!parsed.success) {
      throw new Error(`Invalid DatabaseConfigWithName for fireproofProxy key: ${JSON.stringify(cfg)}`);
    }
    return hashObjectSync(parsed.data);
  },
});

export interface FPApiTransportParams {
  readonly roundTripTimeoutMs: number;
}

export type DatabaseInternalProxyConfig = Partial<DatabaseConfigWithName> &
  Partial<FPApiTransportCtx> &
  FPTransportTargetCTX &
  Partial<FPApiTransportParams>;

export type DatabaseProxyConfig = Partial<DatabaseConfig> &
  Partial<FPApiTransportCtx> &
  FPTransportTargetCTX &
  Partial<FPApiTransportParams>;

export function fireproofProxy(name: string, cfg: DatabaseProxyConfig): Database {
  return fireproofProxies
    .get({
      ...cfg,
      name,
    })
    .once((x) => {
      const sthis = ensureSuperThis();
      console.log("Creating DatabaseProxy for", name, "with config", cfg, x.ctx.refKey);
      return new DatabaseProxy({
        ...x.ctx.givenKey,
        name,
        refId: x.ctx.refKey,
        transport: cfg.transport ?? new FPApiPostMessageTransport(sthis, cfg.webWindow ?? window),
        webWindow: cfg.webWindow ?? window,
        target: cfg.target,
        origin: cfg.origin,
        roundTripTimeoutMs: cfg.roundTripTimeoutMs ?? 10000,
      });
    });
}
