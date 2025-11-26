import { Database, DatabaseConfigWithName, SuperThis } from "@fireproof/core-types-base";
import { Result, Logger, KeyedResolvOnce } from "@adviser/cement";
import { hashObjectSync } from "@fireproof/core-runtime";
import { fireproof } from "@fireproof/core-base";
import {
  FPApiPostMessageTransport,
  FPTransport,
  FPTransportOriginCTX,
  FPWebWindow,
  MsgType,
  MsgTypeSchema,
  ReqApplyDatabaseConfig,
  ResApplyDatabaseConfig,
} from "@fireproof/core-svc-protocol";

export interface FPDBContext {
  send<T extends MsgType>(msg: T): Promise<Result<T>>;
}

export interface FPDBActions {
  applyDatabaseConfig(
    msg: ReqApplyDatabaseConfig,
    trans: FPTransport,
    ctx: FPTransportOriginCTX,
  ): Promise<Result<ResApplyDatabaseConfig>>;
}

export class FPActionService implements FPDBActions {
  readonly sthis: SuperThis;
  readonly id: string;
  readonly fpInstances = new KeyedResolvOnce<Database, DatabaseConfigWithName>({
    key2string: (config: DatabaseConfigWithName) => {
      return hashObjectSync(config);
    },
  });

  constructor(sthis: SuperThis) {
    this.sthis = sthis;
    this.id = `FPActionService[${sthis.nextId().str}]`;
  }
  applyDatabaseConfig(
    msg: ReqApplyDatabaseConfig,
    transport: FPTransport,
    ctx: FPTransportOriginCTX,
  ): Promise<Result<ResApplyDatabaseConfig>> {
    // console.log("FPActionService.applyDatabaseConfig called with", msg);
    const db = this.fpInstances.get(msg.config).once(() =>
      fireproof(msg.config.name, {
        storeUrls: msg.config.storeUrls,
        env: msg.config.env,
        writeQueue: msg.config.writeQueue,
        autoCompact: msg.config.autoCompact,
        compactStrategy: msg.config.compactStrategy,
        threshold: msg.config.threshold,
      }),
    );
    // console.log("FPActionService.applyDatabaseConfig created database instance", db);
    return transport.send(
      {
        type: "resApplyDatabaseConfig",
        tid: msg.tid,
        src: this.id,
        dst: msg.src,
        dbId: db.ledger.refId(),
        dbName: msg.config.name,
      } satisfies ResApplyDatabaseConfig,
      {
        origin: this.id,
        target: ctx.origin,
      },
    );
  }
}

// function isMsgWithData(msg: unknown): msg is {data: unknown} {
//   return (msg as {data?: unknown}).data !== undefined;
// }

export async function databaseMsgHandler(
  sthis: SuperThis,
  logger: Logger,
  actions: FPDBActions,
  msg: unknown,
  transport: FPTransport,
  ctx: FPTransportOriginCTX,
): Promise<Result<void>> {
  // console.log("databaseMsgHandler called with msg:", msg);
  // if (!isMsgWithData(msg)) {
  //   return logger.Error().Msg("Invalid message format no data").ResultError();
  // }
  // console.log("databaseMsgHandler received message", msg, ctx);
  const base = MsgTypeSchema.safeParse(msg);
  if (!base.success) {
    return logger.Error().Err(base.error).Any({ data: msg }).Msg("Invalid message format").ResultError();
  }
  // console.log("databaseMsgHandler", base.data);
  switch (base.data.type) {
    case "reqApplyDatabaseConfig":
      return actions.applyDatabaseConfig(base.data, transport, ctx);
    default:
      return logger.Error().Any(base.data).Msg("Unhandled message").ResultError();
  }
}

export interface FPDatabaseSvcParams {
  readonly sthis: SuperThis;
  readonly logger: Logger;
  readonly action?: FPActionService;
  readonly transport?: FPTransport;
  readonly webWindow?: FPWebWindow;
}

export class FPDatabaseSvc {
  private readonly sthis: SuperThis;
  private readonly logger: Logger;
  private readonly transport: FPTransport;
  private readonly action: FPActionService;
  private stopRecv?: () => void;
  private readonly webWindow: FPWebWindow;

  constructor(params: FPDatabaseSvcParams) {
    this.webWindow = params.webWindow ?? window;
    this.transport = params.transport ?? new FPApiPostMessageTransport(params.sthis, this.webWindow);
    this.sthis = params.sthis;
    this.logger = params.logger;
    this.action = params.action ?? new FPActionService(this.sthis);
  }

  start(): Promise<Result<void>> {
    const action = new FPActionService(this.sthis);
    console.log("FPDatabaseSvc started");
    this.stopRecv = this.transport.recv((msg: unknown, ctx: FPTransportOriginCTX) => {
      return databaseMsgHandler(this.sthis, this.logger, action, msg, this.transport, ctx);
    });
    return Promise.resolve(Result.Ok());
  }

  stop() {
    if (this.stopRecv) {
      this.stopRecv();
      this.stopRecv = undefined;
    }
  }
}

// import {

// export interface Database extends ReadyCloseDestroy, HasLogger, HasSuperThis {
//   // readonly name: string;
//   readonly ledger: Ledger;
//   readonly logger: Logger;
//   readonly sthis: SuperThis;
//   // readonly id: string;
//   readonly name: string;

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
