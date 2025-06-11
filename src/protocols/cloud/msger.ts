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
  MsgRawConnection,
} from "./msg-types.js";
import { ensurePath, HttpConnection } from "./http-connection.js";
import { WSConnection } from "./ws-connection.js";
import type { SuperThis } from "../../types.js";
import { ensureLogger, sleep } from "../../utils.js";
import pLimit from "@fireproof/vendor/p-limit";

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

function initialFPUri(curl: CoerceURI): URI {
  let gestaltUrl = URI.from(curl);
  if (["", "/"].includes(gestaltUrl.pathname)) {
    gestaltUrl = gestaltUrl.build().appendRelative("/fp").URI();
  }
  return gestaltUrl;
}

export interface MsgerConnectParams {
  readonly msgerParam: Partial<MsgerParamsWithEnDe>;
  readonly conn: Partial<ReqOpenConn>;
  readonly mowh: MsgOpenWSAndHttp;
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Msger {
  static connect(sthis: SuperThis, curl: CoerceURI, mParam: Partial<MsgerConnectParams>): Promise<Result<VirtualConnected>> {
    const vc = new VirtualConnected(sthis, {
      curl,
      conn: mParam.conn,
      openWSorHttp: mParam.mowh,
      msgerParams: mParam.msgerParam ?? {},
    });

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
    url = url.build().defParam("random", vc.nextId().str).URI();
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
    const wsc = new WSConnection(vc, wsFactory(), msgP, exGestalt);
    return Result.Ok(wsc);
  }
}

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
  readonly msgerParams: Partial<MsgerParamsWithEnDe>;
}

export type VirtualConnectedOpts = Partial<VirtualConnectedOptionals> & Required<VirtualConnectedRequired>;

interface ActionWhatToDo<S extends MsgBase, X extends MsgWithError<S> | Result<void>> {
  readonly whatToDo: "recurse" | "return" | "action";
  readonly value?: X;
}

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
      const err = new Error("conn is not set");
      throw err;
    }
    return this.virtualConn;
  }

  readonly activeBinds = new Map<string, ActiveStream>();

  private async handleBindRealConn(realConn: MsgRawConnection, req: MsgWithOptionalConn, as: ActiveStream): Promise<void> {
    const conn = { ...this.conn, ...req.conn } satisfies QSId;
    const stream = realConn.bind<MsgBase, MsgWithConn>({ ...as.bind.msg, auth: req.auth, conn }, as.bind.opts);
    for await (const msg of stream) {
      // if (!MsgIsTid(msg, req.tid)) {
      //   break
      // }
      try {
        if (MsgIsConnected(msg, this.conn) || MsgIsConnected(msg, conn)) {
          as.controller?.enqueue(msg);
        }
      } catch (err) {
        this.sthis.logger.Error().Err(err).Any({ msg }).Msg("Error in handleBindRealConn callback[ignored]");
      }
    }
  }

  private ensureOpts(opts: RequestOpts): RequestOpts {
    return {
      ...opts,
      timeout: opts.timeout ?? this.opts.msgerParams.timeout ?? 3000,
    };
  }

  bind<S extends MsgWithConn, Q extends MsgWithOptionalConn>(req: Q, iopts: RequestOpts): ReadableStream<MsgWithError<S>> {
    const opts = this.ensureOpts(iopts);
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

  request<S extends MsgWithConn, Q extends MsgWithOptionalConn>(req: Q, iopts: RequestOpts): Promise<MsgWithError<S>> {
    const opts = this.ensureOpts(iopts);
    const realFn = (realConn: MsgRawConnection) =>
      realConn.request<S, Q>(
        {
          ...req,
          conn: { ...this.virtualConn, ...req.conn },
        },
        opts,
      );
    if (opts.rawConn) {
      // if rawConn is provided, use it directly
      return realFn(opts.rawConn);
    }
    return this.getRealConn(req, opts, realFn);
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

  private async getQSIdWithSideEffect(rawConn: MsgRawConnection, msg: MsgBase, conn: ReqOpenConn): Promise<MsgWithError<ResOpen>> {
    // console.log("getQSIdWithSideEffect", this.id, msg, conn);
    const mOpen = await this.request<ResOpen, ReqOpen>(buildReqOpen(this.sthis, msg.auth, conn), {
      waitFor: MsgIsResOpen,
      noConn: true,
      rawConn,
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
    iopts: RequestOpts,
    action: (realConn: MsgRawConnection) => Promise<X>,
  ): Promise<X> {
    const opts = this.ensureOpts(iopts);
    // const id = this.sthis.nextId().str;
    const whatToDo = await this.mutex(async (): Promise<ActionWhatToDo<S, X>> => {
      if (!this.realConn) {
        if (this.retries.length >= this.opts.retryCount) {
          return {
            whatToDo: "return",
            value: {
              type: "error",
              src: "VirtualConnection:getRealConn",
              message: "retry count exceeded",
              tid: msg.tid,
              version: msg.version,
              auth: msg.auth,
              stack: [],
            } satisfies ErrorMsg as unknown as X,
          };
        }
        // needs to connected
        const rConn = await this.connect(msg.auth, this.opts.curl, this.opts.msgerParams);
        if (rConn.isErr()) {
          this.retries.push({ retryCount: this.retries.length + 1 });
          await sleep(this.opts.retryDelay * this.retries.length);
          return {
            whatToDo: "recurse",
            // this.getRealConn(msg, opts, action);
          };
        }
        this.realConn = rConn.Ok();
        const mQSid = await this.getQSIdWithSideEffect(this.realConn, msg, {
          reqId: this.sthis.nextId().str,
          ...this.virtualConn,
          ...this.opts.conn,
        });
        if (MsgIsError(mQSid)) {
          return {
            whatToDo: "return",
            value: {
              ...mQSid,
              tid: msg.tid,
              // type: msg.type,
            } as unknown as X,
          };
        }
        for (const as of this.activeBinds.values()) {
          // async
          void this.handleBindRealConn(this.realConn, msg, as);
        }
        return {
          whatToDo: "recurse",
        };
        // const ret = await this.getRealConn(msg, opts, action);
        // return ret;
      } else {
        if (!this.realConn.isReady) {
          await this.realConn.close(msg);
          this.realConn = undefined; // trigger reconnect
          this.retries = [];
          return { whatToDo: "recurse" };
          // return this.getRealConn(msg, opts, action);
        }
        if (!opts.noConn && !this.virtualConn) {
          const conn = MsgIsWithConn(msg) ? { conn: msg.conn } : {};
          return {
            whatToDo: "return",
            value: {
              type: "error",
              src: msg,
              message: "virtualConn is not set",
              tid: msg.tid,
              ...conn,
              version: msg.version,
              auth: msg.auth,
              stack: [],
            } satisfies ErrorMsg as unknown as X,
          };
        }
        return {
          whatToDo: "action",
        };
        //const ret = await action(this.realConn);
        //return ret;
      }
    });
    // need to not stuck in the mutex
    switch (whatToDo.whatToDo) {
      case "recurse":
        return this.getRealConn(msg, opts, action);
      case "return":
        return whatToDo.value as X;
      case "action":
        if (!this.realConn) {
          throw new Error("realConn is not set, this should not happen");
        }
        return action(this.realConn);
      default:
        throw new Error(`Unknown action: ${whatToDo.whatToDo} for msg: ${msg.type} with id: ${this.id}`);
    }
  }
}
