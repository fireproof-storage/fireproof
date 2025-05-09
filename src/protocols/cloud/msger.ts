import { BuildURI, CoerceURI, Logger, Result, runtimeFn, URI } from "@adviser/cement";
import {
  buildReqGestalt,
  defaultGestalt,
  EnDeCoder,
  Gestalt,
  MsgBase,
  MsgerParams,
  MsgIsResGestalt,
  RequestOpts,
  ResGestalt,
  MsgWithError,
  MsgIsError,
  QSId,
  ReqGestalt,
  AuthType,
  FPJWKCloudAuthType,
  MsgWithConn,
  ReqOpen,
  ErrorMsg,
  ReqOpenConn,
  buildReqOpen,
  MsgIsResOpen,
  ResOpen,
  MsgWithOptionalConn,
  MsgIsConnected,
  MsgIsWithConn,
} from "./msg-types.js";
import { ensurePath, HttpConnection } from "./http-connection.js";
import { WSConnection } from "./ws-connection.js";
import { SuperThis } from "../../types.js";
import { ensureLogger, sleep } from "../../utils.js";
import pLimit from "p-limit";

// const headers = {
//     "Content-Type": "application/json",
//     "Accept": "application/json",
// };

export function selectRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function timeout<T>(ms: number, promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`TIMEOUT after ${ms}ms`));
    }, ms);
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timer));
  });
}

export type OnMsgFn<T extends MsgBase = MsgBase> = (msg: MsgWithError<T>) => void;
export type UnReg = () => void;

export interface ExchangedGestalt {
  readonly my: Gestalt;
  readonly remote: Gestalt;
}

export type OnErrorFn = (msg: Partial<MsgBase>, err: Error) => Partial<MsgBase>;

export interface ActiveStream {
  readonly id: string;
  readonly bind: {
    readonly msg: MsgBase;
    readonly opts: RequestOpts;
  };
  timeout?: unknown;
  controller?: ReadableStreamDefaultController<MsgWithError<MsgBase>>;
}

export interface MsgRawConnection<T extends MsgBase = MsgBase> {
  // readonly ws: WebSocket;
  // readonly params: ConnectionKey;
  // qsOpen: ReqRes<ReqOpen, ResOpen>;
  readonly sthis: SuperThis;
  // readonly exchangedGestalt: ExchangedGestalt;
  // readonly activeBinds: Map<string, ActiveStream<T, MsgBase>>;

  // readonly vconn: VirtualConnection;

  isReady: boolean;

  bind<S extends T, Q extends T>(req: Q, opts: RequestOpts): ReadableStream<MsgWithError<S>>;
  request<S extends T, Q extends T>(req: Q, opts: RequestOpts): Promise<MsgWithError<S>>;
  send<S extends T, Q extends T>(msg: Q): Promise<MsgWithError<S>>;
  start(): Promise<Result<void>>;
  close(o: T): Promise<Result<void>>;
}

// interface Thenable<R> {
//   then(fn: () => void): Promise<R>;
// }

// class RequestAction<Q extends MsgBase, S extends MsgBase> implements Thenable<MsgWithError<S>> {
//   readonly type = "request";
//   readonly req: Q;
//   readonly opts: RequestOpts;
//   readonly rc: VirtualConnected;
//   constructor(rc: VirtualConnected, req: Q, opts: RequestOpts) {
//     this.req = req;
//     this.opts = opts;
//     this.rc = rc;
//   }
//   then(): Promise<MsgWithError<S>> {
//     return this.rc.request(this.req, this.opts) as Promise<MsgWithError<S>>;
//   }
// }

// class SendAction<Q extends MsgBase, S extends MsgBase> implements Thenable<MsgWithError<S>> {
//   readonly type = "send";
//   readonly msg: Q;
//   readonly realConn: MsgRawConnection;
//   constructor(realConn: MsgRawConnection, msg: Q) {
//     this.msg = msg;
//     this.realConn = realConn;
//   }
//   then(): Promise<MsgWithError<S>> {
//     return this.realConn.send(this.msg);
//   }
// }

// class StartAction implements Thenable<Result<void>> {
//   readonly type = "start";
//   readonly realConn: MsgRawConnection;
//   constructor(realConn: MsgRawConnection) {
//     this.realConn = realConn;
//   }
//   then(): Promise<Result<void>> {
//     return this.realConn.start();
//   }
// }

// class CloseAction implements Thenable<Result<void>> {
//   readonly type = "close";
//   readonly msg: MsgBase;
//   readonly realConn: MsgRawConnection;
//   constructor(realConn: MsgRawConnection, msg: MsgBase) {
//     this.msg = msg;
//     this.realConn = realConn;
//   }
//   then(): Promise<Result<void>> {
//     return this.realConn.close(this.msg);
//   }
// }

// type Actions = RequestAction<MsgBase, MsgBase> | SendAction<MsgBase, MsgBase> | StartAction | CloseAction;

// interface ActionQueueItem {
//   readonly id: string;
//   readonly action: Actions;
//   readonly start: Future<unknown>;
//   readonly done: Future<unknown>;
// }

// class ActionsQueue {
//   readonly actionQueue: ActionQueueItem[] = [];
//   readonly sthis: SuperThis;

//   constructor(sthis: SuperThis) {
//     this.sthis = sthis;
//   }

//   next() {
//     const action = this.actionQueue.shift();
//     if (!action) {
//       return;
//     }
//     const { id, action: act, start, done } = action;
//     this.sthis.logger.Debug().Msg("process", id, act.type);
//     start.resolve(undefined);
//     done.asPromise().finally(() => {
//       this.next();
//     });
//   }

//   req<T extends Actions>(action: T): T {
//     // if ((action as RequestAction<MsgBase, MsgBase>).req?.type !== "test") {
//     // console.log("req--->", action.type, action as RequestAction<MsgBase, MsgBase>, this.actionQueue.length);
//     // }
//     const id = this.sthis.nextId().str;
//     const start = new Future();
//     const done = new Future();
//     const qAction = {
//       ...action,
//       then: () => {
//         start.asPromise().then(() => {
//           const x = action.then();
//           if (isPromise(x)) {
//             x.finally(() => {
//               this.actionQueue.splice(
//                 this.actionQueue.findIndex((i) => i.id === id),
//                 1,
//               );
//               done.resolve(x);
//             });
//           } else {
//             this.actionQueue.splice(
//               this.actionQueue.findIndex((i) => i.id === id),
//               1,
//             );
//             done.resolve(x);
//           }
//         });
//         this.next();
//         return done.asPromise();
//       },
//     };
//     this.actionQueue.push({
//       id,
//       action: qAction,
//       start,
//       done,
//     });
//     return qAction as T;
//   }
// }

export function jsonEnDe(sthis: SuperThis): EnDeCoder {
  return {
    encode: (node: unknown) => sthis.txt.encode(JSON.stringify(node)),
    decode: (data: Uint8Array) => JSON.parse(sthis.txt.decode(data)),
  };
}

export type MsgerParamsWithEnDe = MsgerParams & { readonly ende: EnDeCoder };

export function defaultMsgParams(sthis: SuperThis, igs: Partial<MsgerParamsWithEnDe>): MsgerParamsWithEnDe {
  return {
    mime: "application/json",
    ende: jsonEnDe(sthis),
    timeout: 3000,
    protocolCapabilities: ["reqRes", "stream"],
    ...igs,
  } satisfies MsgerParamsWithEnDe;
}

export interface OpenParams {
  readonly timeout: number;
}

export async function applyStart(prC: Promise<Result<MsgRawConnection>>): Promise<Result<MsgRawConnection>> {
  const rC = await prC;
  if (rC.isErr()) {
    return rC;
  }
  const c = rC.Ok();
  const r = await c.start();
  if (r.isErr()) {
    return Result.Err(r.Err());
  }
  return rC;
}

export async function authTypeFromUri(logger: Logger, curi: CoerceURI): Promise<Result<FPJWKCloudAuthType>> {
  const uri = URI.from(curi);
  const authJWK = uri.getParam("authJWK");
  if (!authJWK) {
    return logger.Error().Url(uri).Msg("authJWK is required").ResultError();
  }
  // const sts = await SessionTokenService.createFromEnv();
  // const fpc = await sts.validate(authJWK);
  // if (fpc.isErr()) {
  //   return logger.Error().Err(fpc).Msg("Invalid authJWK").ResultError();
  // }
  return Result.Ok({
    type: "fp-cloud-jwk",
    params: {
      // claim: fpc.Ok().payload,
      jwk: authJWK,
    },
  } satisfies FPJWKCloudAuthType);
}

// export class MsgConnected implements MsgRawConnection<MsgWithConn> {
//   static async connect(
//     auth: AuthType,
//     mrc: Result<MsgRawConnection> | MsgRawConnection,
//     conn: Partial<QSId> = {},
//   ): Promise<Result<MsgConnected>> {
//     if (Result.Is(mrc)) {
//       if (mrc.isErr()) {
//         return Result.Err(mrc.Err());
//       }
//       mrc = mrc.Ok();
//     }
//     const res = await mrc.request(buildReqOpen(mrc.sthis, auth, conn), { waitFor: MsgIsResOpen });
//     if (MsgIsError(res) || !MsgIsResOpen(res)) {
//       return mrc.sthis.logger.Error().Err(res).Msg("unexpected response").ResultError();
//     }
//     return Result.Ok(new MsgConnected(mrc, res.conn));
//   }

//   readonly sthis: SuperThis;
//   readonly conn: QSId;
//   private readonly raw: MsgRawConnection;
//   readonly exchangedGestalt: ExchangedGestalt;
//   // private readonly activeBinds: Map<string, ActiveStream<MsgWithConnAuth, MsgBase>>;
//   readonly id: string;

//   private queued!: MsgRawConnectionQueued;

//   private constructor(raw: MsgRawConnection, conn: QSId) {
//     this.sthis = raw.sthis;
//     this.raw = raw;
//     this.exchangedGestalt = raw.exchangedGestalt;
//     this.conn = conn;
//     // this.activeBinds = raw.activeBinds;
//     this.id = this.sthis.nextId().str;
//   }

//   get activeBinds(): Map<string, ActiveStream<MsgWithConn, MsgBase>> {
//     throw new Error("Method not implemented.");
//   }

//   transport(): MsgRawConnection {
//     return this.queued.realConn;
//   }

//   // eslint-disable-next-line @typescript-eslint/no-unused-vars
//   bind<S extends MsgWithConn, Q extends MsgWithOptionalConn>(req: Q, opts: RequestOpts): ReadableStream<MsgWithError<S>> {
//     throw new Error("Method not implemented.");
//   }
//   // eslint-disable-next-line @typescript-eslint/no-unused-vars
//   request<S extends MsgWithConn, Q extends MsgWithOptionalConn>(req: Q, opts: RequestOpts): Promise<MsgWithError<S>> {
//     throw new Error("Method not implemented.");
//   }
//   // eslint-disable-next-line @typescript-eslint/no-unused-vars
//   send<S extends MsgWithConn, Q extends MsgWithOptionalConn>(msg: Q): Promise<MsgWithError<S>> {
//     throw new Error("Method not implemented.");
//   }
//   start(): Promise<Result<void>> {
//     throw new Error("Method not implemented.");
//   }
//   // eslint-disable-next-line @typescript-eslint/no-unused-vars
//   close(o: MsgWithOptionalConn): Promise<Result<void>> {
//     throw new Error("Method not implemented.");
//   }
//   // eslint-disable-next-line @typescript-eslint/no-unused-vars
//   onMsg(msg: OnMsgFn<MsgWithConn>): UnReg {
//     throw new Error("Method not implemented.");
//   }

//   attachAuth(auth: AuthFactory): MsgConnectedAuth {
//     return new MsgConnectedAuth(this, auth);
//   }
// }

// type MsgWithOptionalConn = Omit<MsgWithConnAuth, "conn"> & { readonly conn?: QSId };

// export class MsgConnectedAuth /* implements MsgRawConnection<MsgWithConn> */ {
//   readonly sthis: SuperThis;
//   // readonly raw: MsgRawConnection;
//   readonly connnected: VirtualConnected;
//   readonly exchangedGestalt: ExchangedGestalt;
//   // readonly activeBinds: Map<string, ActiveStream<MsgWithConnAuth, MsgBase>>;
//   readonly id: string;
//   readonly authFactory: AuthFactory;

//   constructor(conn: VirtualConnected, authFactory: AuthFactory) {
//     this.id = conn.id;
//     this.connnected = conn;
//     // this.raw = conn.raw;
//     this.sthis = conn.sthis;
//     this.authFactory = authFactory;
//     this.exchangedGestalt = conn.exchangedGestalt;
//     // this.activeBinds = conn.activeBinds;
//   }

//   get conn(): QSId {
//     return this.connnected.conn;
//   }

//   get activeBinds(): Map<string, ActiveStream<MsgWithConn, MsgBase>> {
//     return this.connnected.activeBinds;
//   }

//   bind<S extends MsgWithConn, Q extends MsgWithOptionalConn>(req: Q, opts: RequestOpts): ReadableStream<MsgWithError<S>> {
//     const stream = this.connnected.bind({ ...req, conn: req.conn || this.connnected.conn }, opts);
//     const ts = new TransformStream<MsgWithError<S>, MsgWithError<S>>({
//       transform: (chunk, controller) => {
//         if (!MsgIsTid(chunk, req.tid)) {
//           return;
//         }
//         if (MsgIsConnected(chunk, this.connnected.conn)) {
//           if (opts.waitFor?.(chunk) || MsgIsError(chunk)) {
//             controller.enqueue(chunk);
//           }
//         }
//       },
//     });

//     // why the hell pipeTo sends an error that is undefined?
//     stream.pipeThrough(ts);
//     // stream.pipeTo(ts.writable).catch((err) => err && err.message && console.error("bind error", err));
//     return ts.readable;
//   }

//   authType(): Promise<Result<AuthType>> {
//     return this.authFactory();
//   }

//   msgConnAuth(): Promise<Result<MsgWithConn>> {
//     return this.authType().then((r) => {
//       if (r.isErr()) {
//         return Result.Err(r);
//       }
//       return Result.Ok({ conn: this.connnected.conn, auth: r.Ok() } as MsgWithConn);
//     });
//   }

//   request<S extends MsgWithConn, Q extends MsgWithOptionalConn | ReqOpen>(req: Q, opts: RequestOpts): Promise<MsgWithError<S>> {
//     return this.connnected.request({ ...req, conn: (req.conn || this.connnected.conn) as QSId }, opts);
//   }

//   send<S extends MsgWithConn, Q extends MsgWithOptionalConn>(msg: Q): Promise<MsgWithError<S>> {
//     return this.connnected.send({ ...msg, conn: msg.conn || this.connnected.conn });
//   }

//   async close(t: MsgWithConn): Promise<Result<void>> {
//     await this.request(buildReqClose(this.sthis, t.auth, this.connnected.conn), { waitFor: MsgIsResClose, noRetry: true });
//     return await this.connnected.close(t);
//     // return Result.Ok(undefined);
//   }
//   onMsg(msgFn: OnMsgFn<MsgWithConn>): UnReg {
//     return this.connnected.onMsg((msg) => {
//       // possibly test of a proper auth from the server
//       if (MsgIsConnected(msg, this.connnected.conn)) {
//         msgFn(msg);
//       }
//     });
//   }
// }

function initialFPUri(curl: CoerceURI): URI {
  let gestaltUrl = URI.from(curl);
  if (["", "/"].includes(gestaltUrl.pathname)) {
    gestaltUrl = gestaltUrl.build().appendRelative("/fp").URI();
  }
  return gestaltUrl;
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Msger {
  static connect(
    sthis: SuperThis,
    curl: CoerceURI,
    imsgP: Partial<MsgerParamsWithEnDe> = {},
    conn?: Partial<ReqOpenConn>,
    mowh?: MsgOpenWSAndHttp,
  ): Promise<Result<VirtualConnected>> {
    const vc = new VirtualConnected(sthis, { curl, imsgP, conn, openWSorHttp: mowh });
    return Promise.resolve(Result.Ok(vc));
    // return vc.connect();
  }
  private constructor() {
    /* */
  }
}

export class MsgOpenWSAndHttp {
  async openHttp(
    vc: SuperThis,
    urls: URI[],
    msgP: MsgerParamsWithEnDe,
    exGestalt: ExchangedGestalt,
  ): Promise<Result<MsgRawConnection>> {
    return Result.Ok(new HttpConnection(vc, urls, msgP, exGestalt));
  }

  async openWS(
    vc: SuperThis,
    // qOpen: ReqOpen,
    url: URI,
    msgP: MsgerParamsWithEnDe,
    exGestalt: ExchangedGestalt,
  ): Promise<Result<MsgRawConnection>> {
    // const { encode } = jsonEnDe(sthis);
    url = url.build().setParam("random", vc.nextId().str).URI();
    // console.log("openWS", url.toString());
    // .setParam("reqOpen", sthis.txt.decode(encode(qOpen)))
    const wsUrl = ensurePath(url, "ws");
    let wsFactory: () => WebSocket;
    if (runtimeFn().isNodeIsh) {
      const { WebSocket } = await import("ws");
      wsFactory = () => new WebSocket(wsUrl) as unknown as WebSocket;
    } else {
      wsFactory = () => new WebSocket(wsUrl);
    }
    return Result.Ok(new WSConnection(vc, wsFactory(), msgP, exGestalt));
  }
}

// export class VirtualConnection {
//   readonly sthis: SuperThis;
//   readonly auth: AuthType;
//   readonly curl: CoerceURI;
//   readonly imsgP: Partial<MsgerParamsWithEnDe> = {};
//   readonly conn: Partial<QSId> = {};
//   connFactory?: () => Promise<Result<MsgRawConnection>>;

//   constructor(sthis: SuperThis, auth: AuthType, curl: CoerceURI, imsgP: Partial<MsgerParamsWithEnDe>, conn: Partial<QSId>, mowh?: MsgOpenWSAndHttp) {
//     this.sthis = sthis;
//     this.auth = auth;
//     this.curl = curl;
//     this.imsgP = imsgP;
//     this.conn = conn;
//   }

//   setConnFactory(fn: () => Promise<Result<MsgRawConnection>>) {
//     this.connFactory = fn;
//   }

//   async reconnect(retryCount = 0): Promise<Result<MsgRawConnection>> {
//     if (retryCount > 3) {
//       return Result.Err(new Error("retry count exceeded"));
//     }
//     // MISSING close the existing connection to have a proper livecycle
//     this.sthis.logger.Warn().Any({ retryCount, url: this.curl }).Msg("restart");
//     await sleep(retryCount * 500);
//     const r =  await this.connect();
//     if (r.isErr()) {
//       return Result.Err(r);
//     }
//     // const rRc = await this.start();
//     // if (rRc.isErr()) {
//     //   return Result.Err(rRc);
//     // }
//     return Result.Ok(r.Ok());
//   }

//   connect() {
//     return this.open(this.sthis, this.auth, this.curl, this.imsgP).then((srv) => MsgConnected.connect(this.auth, srv, this.conn));
//   }

//   async start(): Promise<Result<MsgRawConnection>> {
//     if (!this.connFactory) {
//       return Result.Err(new Error("connFactory is not set"));
//     }
//     const rRawConn = await this.connFactory();
//     if (rRawConn.isErr()) {
//       return rRawConn;
//     }
//     const rc = rRawConn.Ok();
//     const c = new MsgRawConnectionQueued(rc)
//     return c.start().then((r) => {
//       if (r.isErr()) {
//         return Result.Err(r.Err());
//       }
//       return Result.Ok(c);
//     });
//   }
// }

interface RetryItem {
  readonly retryCount: number;
}

export interface VirtualConnectedOptionals {
  readonly retryCount: number; // default 3
  readonly retryDelay: number; // default 500ms
  readonly openWSorHttp: MsgOpenWSAndHttp;
  readonly conn: Partial<ReqOpenConn>;
}
export interface VirtualConnectedRequired {
  // readonly auth: AuthType;
  readonly curl: CoerceURI;
  readonly imsgP: Partial<MsgerParamsWithEnDe>;
}

export type VirtualConnectedOpts = Partial<VirtualConnectedOptionals> & Required<VirtualConnectedRequired>;

export class VirtualConnected {
  readonly sthis: SuperThis;
  // readonly actionQueue: ActionsQueue;
  readonly opts: VirtualConnectedOptionals & VirtualConnectedRequired;
  readonly mowh: MsgOpenWSAndHttp;
  readonly logger: Logger;
  readonly id: string;
  exchangedGestalt?: ExchangedGestalt;
  // readonly actionQueue: ActionsQueue;

  realConn?: MsgRawConnection;
  retries: RetryItem[] = [];
  virtualConn?: QSId;

  constructor(sthis: SuperThis, opts: VirtualConnectedOpts) {
    this.sthis = sthis;
    this.id = sthis.nextId().str;
    this.logger = ensureLogger(sthis, "VirtualConnected");
    this.opts = {
      ...opts,
      openWSorHttp: opts.openWSorHttp || new MsgOpenWSAndHttp(),
      retryCount: opts.retryCount || 3,
      retryDelay: opts.retryDelay || 500,
      conn: { reqId: sthis.nextId().str, ...opts.conn }, // ensure conn has reqId
    } satisfies VirtualConnectedOpts;
    this.mowh = this.opts.openWSorHttp; // simplify the code
  }

  get conn(): QSId {
    if (!this.virtualConn) {
      throw new Error("conn is not set");
    }
    return this.virtualConn;
  }

  readonly activeBinds = new Map<string, ActiveStream>();

  private async handleBindRealConn(realConn: MsgRawConnection, req: MsgWithOptionalConn, as: ActiveStream): Promise<void> {
    const stream = realConn.bind<MsgBase, MsgWithConn>(
      { ...as.bind.msg, auth: req.auth, conn: { ...this.conn, ...req.conn } },
      as.bind.opts,
    );
    for await (const msg of stream) {
      // if (!MsgIsTid(msg, req.tid)) {
      //   break
      // }
      try {
        if (MsgIsConnected(msg, this.conn)) {
          as.controller?.enqueue(msg);
        }
      } catch (err) {
        this.sthis.logger.Error().Err(err).Any({ msg }).Msg("Error in handleBindRealConn callback[ignored]");
      }
    }
  }

  bind<S extends MsgWithConn, Q extends MsgWithOptionalConn>(req: Q, opts: RequestOpts): ReadableStream<MsgWithError<S>> {
    const id = this.sthis.nextId().str;
    return new ReadableStream<MsgWithError<S>>({
      cancel: (err) => {
        this.sthis.logger.Debug().Msg("vc-bind-cancel", id, err);
        this.activeBinds.delete(id);
      },
      start: (ctl) => {
        this.getRealConn(req, opts, async (realConn: MsgRawConnection) => {
          const as = {
            id,
            bind: {
              msg: req,
              opts,
            },
            controller: ctl,
          };
          this.activeBinds.set(id, as);
          this.handleBindRealConn(realConn, req, as);
          return Result.Ok(undefined);
        }).catch((err: Error) => {
          ctl.error({
            type: "error",
            src: "VirtualConnection:bind",
            message: err.message,
            tid: req.tid,
            version: req.version,
            auth: req.auth,
            stack: [],
          } satisfies ErrorMsg);
        });
      },
    });
  }

  request<S extends MsgWithConn, Q extends MsgWithOptionalConn>(req: Q, opts: RequestOpts): Promise<MsgWithError<S>> {
    return this.getRealConn(req, opts, (realConn: MsgRawConnection) =>
      realConn.request<S, Q>(
        {
          ...req,
          conn: { ...this.virtualConn, ...req.conn },
        },
        opts,
      ),
    );
  }

  send<S extends MsgWithConn, Q extends MsgWithOptionalConn>(msg: Q): Promise<MsgWithError<S>> {
    return this.getRealConn(
      msg,
      {
        waitFor: () => true,
      },
      async (realConn: MsgRawConnection) => {
        const ret = await realConn.send<S, Q>({
          ...msg,
          conn: { ...this.conn, ...msg.conn },
        });
        return ret;
      },
    );
  }

  close(t: MsgWithOptionalConn): Promise<Result<void>> {
    return this.getRealConn(
      t,
      {
        waitFor: () => true,
        noRetry: true,
      },
      (realConn: MsgRawConnection) => realConn.close(t),
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onMsg(msgFn: OnMsgFn<MsgWithConn>): UnReg {
    throw new Error("Method not implemented.");
  }

  private async connect(
    auth: AuthType,
    curl: CoerceURI,
    imsgP: Partial<MsgerParamsWithEnDe> = {},
  ): Promise<Result<MsgRawConnection>> {
    // initial exchange with JSON encoding
    const jsMsgP = defaultMsgParams(this.sthis, { ...imsgP, mime: "application/json", ende: jsonEnDe(this.sthis) });
    const gestaltUrl = initialFPUri(curl);
    const gs = defaultGestalt(defaultMsgParams(this.sthis, imsgP), { id: "FP-Universal-Client" });
    /*
     * request Gestalt with Http
     */
    const rHC = await this.mowh.openHttp(this.sthis, [gestaltUrl], jsMsgP, { my: gs, remote: gs });
    if (rHC.isErr()) {
      return rHC;
    }
    const hc = rHC.Ok();
    // const rAuth = await authTypeFromUri(sthis.logger, url);
    // if (rAuth.isErr()) {
    //   return Result.Err(rAuth)
    // }
    const resGestalt = await hc.request<ResGestalt, ReqGestalt>(buildReqGestalt(this.sthis, auth, gs), {
      waitFor: MsgIsResGestalt,
      noConn: true,
    });
    if (!MsgIsResGestalt(resGestalt)) {
      return this.logger.Error().Any({ resGestalt }).Msg("should be ResGestalt").ResultError();
    }
    await hc.close(resGestalt /* as MsgWithConnAuth */);
    const exGt = { my: gs, remote: resGestalt.gestalt } satisfies ExchangedGestalt;
    const msgP = defaultMsgParams(this.sthis, imsgP);

    this.exchangedGestalt = exGt;

    let rRealConn: Result<MsgRawConnection>;
    if (exGt.remote.protocolCapabilities.includes("reqRes") && !exGt.remote.protocolCapabilities.includes("stream")) {
      // console.log("openHttp---", exGt.remote.httpEndpoints, curl?.toString(), exGt.remote.httpEndpoints.map((i) => BuildURI.from(curl).resolve(i).URI().toString()));
      rRealConn = await this.mowh.openHttp(
        this.sthis,
        exGt.remote.httpEndpoints.map((i) => BuildURI.from(curl).resolve(i).URI()),
        msgP,
        exGt,
      );
    } else {
      const wsUrl = BuildURI.from(gestaltUrl).resolve(selectRandom(exGt.remote.wsEndpoints)).URI();
      // console.log("openWS---", wsUrl.toString(), "=====", exGt.remote.wsEndpoints);
      rRealConn = await this.mowh.openWS(this.sthis, wsUrl, msgP, exGt);
    }
    if (rRealConn.isErr()) {
      return rRealConn;
    }
    const realConn = rRealConn.Ok();
    const rStart = await realConn.start();
    if (rStart.isErr()) {
      return Result.Err(rStart);
    }
    return rRealConn;
  }

  private async getQSIdWithSideEffect(msg: MsgBase, conn: ReqOpenConn): Promise<MsgWithError<ResOpen>> {
    const mOpen = await this.request<ResOpen, ReqOpen>(buildReqOpen(this.sthis, msg.auth, conn), {
      waitFor: MsgIsResOpen,
      noConn: true,
    });
    if (MsgIsError(mOpen)) {
      return mOpen;
    }
    this.virtualConn = mOpen.conn;
    return mOpen;
  }

  private mutex = pLimit(1);

  private async getRealConn<S extends MsgBase, Q extends MsgBase, X extends MsgWithError<S> | Result<void>>(
    msg: Q,
    opts: RequestOpts,
    action: (realConn: MsgRawConnection) => Promise<X>,
  ): Promise<X> {
    // const id = this.sthis.nextId().str;
    if (!this.realConn) {
      await this.mutex(async () => {
        if (this.retries.length >= this.opts.retryCount) {
          return Promise.resolve({
            type: "error",
            src: "VirtualConnection:getRealConn",
            message: "retry count exceeded",
            tid: msg.tid,
            version: msg.version,
            auth: msg.auth,
            stack: [],
          } satisfies ErrorMsg as unknown as X);
        }
        // needs to connected
        const rConn = await this.connect(msg.auth, this.opts.curl, this.opts.imsgP);
        if (rConn.isErr()) {
          this.retries.push({ retryCount: this.retries.length + 1 });
          await sleep(this.opts.retryDelay * this.retries.length);
          return this.getRealConn(msg, opts, action);
        }
        this.realConn = rConn.Ok();
        const mQSid = await this.getQSIdWithSideEffect(msg, {
          reqId: this.sthis.nextId().str,
          ...this.virtualConn,
          ...this.opts.conn,
        });
        if (MsgIsError(mQSid)) {
          return {
            ...mQSid,
            tid: msg.tid,
            // type: msg.type,
          } as unknown as X;
        }
        for (const as of this.activeBinds.values()) {
          // async
          void this.handleBindRealConn(this.realConn, msg, as);
        }
      });
      const ret = await this.getRealConn(msg, opts, action);
      return ret;
    } else {
      if (!this.realConn.isReady) {
        await this.realConn.close(msg);
        this.realConn = undefined; // trigger reconnect
        this.retries = [];
        return this.getRealConn(msg, opts, action);
      }
      if (!opts.noConn && !this.virtualConn) {
        const conn = MsgIsWithConn(msg) ? { conn: msg.conn } : {};
        return {
          type: "error",
          src: msg,
          message: "virtualConn is not set",
          tid: msg.tid,
          ...conn,
          version: msg.version,
          auth: msg.auth,
          stack: [],
        } satisfies ErrorMsg as unknown as X;
      }
      const ret = await action(this.realConn);
      return ret;
    }
  }
}
