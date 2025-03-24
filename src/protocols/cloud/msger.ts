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
  MsgWithConnAuth,
  buildReqOpen,
  MsgIsConnected,
  MsgIsError,
  MsgIsResOpen,
  QSId,
  MsgIsTid,
  ReqGestalt,
  buildReqClose,
  MsgIsResClose,
  AuthFactory,
  AuthType,
  FPJWKCloudAuthType,
} from "./msg-types.js";
import { ensurePath, HttpConnection } from "./http-connection.js";
import { WSConnection } from "./ws-connection.js";
import { SuperThis } from "../../types.js";

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

export interface ActiveStream<S extends MsgBase, Q extends MsgBase> {
  readonly id: string;
  readonly bind: {
    readonly msg: Q;
    readonly opts: RequestOpts;
  };
  timeout?: unknown;
  controller?: ReadableStreamDefaultController<MsgWithError<S>>;
}

export interface MsgRawConnection<T extends MsgBase = MsgBase> {
  // readonly ws: WebSocket;
  // readonly params: ConnectionKey;
  // qsOpen: ReqRes<ReqOpen, ResOpen>;
  readonly sthis: SuperThis;
  readonly exchangedGestalt: ExchangedGestalt;
  readonly activeBinds: Map<string, ActiveStream<T, MsgBase>>;
  bind<S extends T, Q extends T>(req: Q, opts: RequestOpts): ReadableStream<MsgWithError<S>>;
  request<S extends T, Q extends T>(req: Q, opts: RequestOpts): Promise<MsgWithError<S>>;
  send<S extends T, Q extends T>(msg: Q): Promise<MsgWithError<S>>;
  start(): Promise<Result<void>>;
  close(o: T): Promise<Result<void>>;
  onMsg(msg: OnMsgFn<T>): UnReg;
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

export class MsgConnected {
  static async connect(
    auth: AuthType,
    mrc: Result<MsgRawConnection> | MsgRawConnection,
    conn: Partial<QSId> = {},
  ): Promise<Result<MsgConnected>> {
    if (Result.Is(mrc)) {
      if (mrc.isErr()) {
        return Result.Err(mrc.Err());
      }
      mrc = mrc.Ok();
    }
    const res = await mrc.request(buildReqOpen(mrc.sthis, auth, conn), { waitFor: MsgIsResOpen });
    if (MsgIsError(res) || !MsgIsResOpen(res)) {
      return mrc.sthis.logger.Error().Err(res).Msg("unexpected response").ResultError();
    }
    return Result.Ok(new MsgConnected(mrc, res.conn));
  }

  readonly sthis: SuperThis;
  readonly conn: QSId;
  readonly raw: MsgRawConnection;
  readonly exchangedGestalt: ExchangedGestalt;
  readonly activeBinds: Map<string, ActiveStream<MsgWithConnAuth, MsgBase>>;
  readonly id: string;
  private constructor(raw: MsgRawConnection, conn: QSId) {
    this.sthis = raw.sthis;
    this.raw = raw;
    this.exchangedGestalt = raw.exchangedGestalt;
    this.conn = conn;
    this.activeBinds = raw.activeBinds;
    this.id = this.sthis.nextId().str;
  }

  attachAuth(auth: AuthFactory): MsgConnectedAuth {
    return new MsgConnectedAuth(this, auth);
  }
}

export class MsgConnectedAuth implements MsgRawConnection<MsgWithConnAuth> {
  readonly sthis: SuperThis;
  readonly conn: QSId;
  readonly raw: MsgRawConnection;
  readonly exchangedGestalt: ExchangedGestalt;
  readonly activeBinds: Map<string, ActiveStream<MsgWithConnAuth, MsgBase>>;
  readonly id: string;
  readonly authFactory: AuthFactory;

  constructor(conn: MsgConnected, authFactory: AuthFactory) {
    this.id = conn.id;
    this.raw = conn.raw;
    this.conn = conn.conn;
    this.sthis = conn.sthis;
    this.authFactory = authFactory;
    this.exchangedGestalt = conn.exchangedGestalt;
    this.activeBinds = conn.activeBinds;
  }

  bind<S extends MsgWithConnAuth, Q extends MsgWithConnAuth>(req: Q, opts: RequestOpts): ReadableStream<MsgWithError<S>> {
    const stream = this.raw.bind({ ...req, conn: req.conn || this.conn }, opts);
    const ts = new TransformStream<MsgWithError<S>, MsgWithError<S>>({
      transform: (chunk, controller) => {
        if (!MsgIsTid(chunk, req.tid)) {
          return;
        }
        if (MsgIsConnected(chunk, this.conn)) {
          if (opts.waitFor?.(chunk) || MsgIsError(chunk)) {
            controller.enqueue(chunk);
          }
        }
      },
    });

    // why the hell pipeTo sends an error that is undefined?
    stream.pipeThrough(ts);
    // stream.pipeTo(ts.writable).catch((err) => err && err.message && console.error("bind error", err));
    return ts.readable;
  }

  authType(): Promise<Result<AuthType>> {
    return this.authFactory();
  }

  msgConnAuth(): Promise<Result<MsgWithConnAuth>> {
    return this.authType().then((r) => {
      if (r.isErr()) {
        return Result.Err(r);
      }
      return Result.Ok({ conn: this.conn, auth: r.Ok() } as MsgWithConnAuth);
    });
  }

  request<S extends MsgWithConnAuth, Q extends MsgWithConnAuth>(req: Q, opts: RequestOpts): Promise<MsgWithError<S>> {
    return this.raw.request({ ...req, conn: req.conn || this.conn }, opts);
  }

  send<S extends MsgWithConnAuth, Q extends MsgWithConnAuth>(msg: Q): Promise<MsgWithError<S>> {
    return this.raw.send({ ...msg, conn: msg.conn || this.conn });
  }

  start(): Promise<Result<void>> {
    return this.raw.start();
  }
  async close(t: MsgWithConnAuth): Promise<Result<void>> {
    await this.request(buildReqClose(this.sthis, t.auth, this.conn), { waitFor: MsgIsResClose });
    return await this.raw.close(t);
    // return Result.Ok(undefined);
  }
  onMsg(msgFn: OnMsgFn<MsgWithConnAuth>): UnReg {
    return this.raw.onMsg((msg) => {
      if (MsgIsConnected(msg, this.conn)) {
        msgFn(msg);
      }
    });
  }
}

function initialFPUri(curl: CoerceURI): URI {
  let gestaltUrl = URI.from(curl);
  if (["", "/"].includes(gestaltUrl.pathname)) {
    gestaltUrl = gestaltUrl.build().appendRelative("/fp").URI();
  }
  return gestaltUrl;
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Msger {
  static async openHttp(
    sthis: SuperThis,
    // reqOpen: ReqOpen | undefined,
    urls: URI[],
    msgP: MsgerParamsWithEnDe,
    exGestalt: ExchangedGestalt,
  ): Promise<Result<MsgRawConnection>> {
    return Result.Ok(new HttpConnection(sthis, urls, msgP, exGestalt));
  }
  static async openWS(
    sthis: SuperThis,
    // qOpen: ReqOpen,
    url: URI,
    msgP: MsgerParamsWithEnDe,
    exGestalt: ExchangedGestalt,
  ): Promise<Result<MsgRawConnection>> {
    let ws: WebSocket;
    // const { encode } = jsonEnDe(sthis);
    url = url.build().setParam("random", sthis.nextId().str).URI();
    // console.log("openWS", url.toString());
    // .setParam("reqOpen", sthis.txt.decode(encode(qOpen)))
    const wsUrl = ensurePath(url, "ws");
    if (runtimeFn().isNodeIsh) {
      const { WebSocket } = await import("ws");
      ws = new WebSocket(wsUrl) as unknown as WebSocket;
    } else {
      ws = new WebSocket(wsUrl);
    }
    return Result.Ok(new WSConnection(sthis, ws, msgP, exGestalt));
  }
  static async open(
    sthis: SuperThis,
    auth: AuthType,
    curl: CoerceURI,
    imsgP: Partial<MsgerParamsWithEnDe> = {},
  ): Promise<Result<MsgRawConnection>> {
    // initial exchange with JSON encoding
    const jsMsgP = defaultMsgParams(sthis, { ...imsgP, mime: "application/json", ende: jsonEnDe(sthis) });
    const gestaltUrl = initialFPUri(curl);
    const gs = defaultGestalt(defaultMsgParams(sthis, imsgP), { id: "FP-Universal-Client" });
    /*
     * request Gestalt with Http
     */
    const rHC = await Msger.openHttp(sthis, [gestaltUrl], jsMsgP, { my: gs, remote: gs });
    if (rHC.isErr()) {
      return rHC;
    }
    const hc = rHC.Ok();
    // const rAuth = await authTypeFromUri(sthis.logger, url);
    // if (rAuth.isErr()) {
    //   return Result.Err(rAuth)
    // }
    const resGestalt = await hc.request<ResGestalt, ReqGestalt>(buildReqGestalt(sthis, auth, gs), {
      waitFor: MsgIsResGestalt,
    });
    if (!MsgIsResGestalt(resGestalt)) {
      return sthis.logger.Error().Any({ resGestalt }).Msg("should be ResGestalt").ResultError();
    }
    await hc.close(resGestalt /* as MsgWithConnAuth */);
    const exGt = { my: gs, remote: resGestalt.gestalt } satisfies ExchangedGestalt;
    const msgP = defaultMsgParams(sthis, imsgP);
    if (exGt.remote.protocolCapabilities.includes("reqRes") && !exGt.remote.protocolCapabilities.includes("stream")) {
      // console.log("openHttp---", exGt.remote.httpEndpoints, curl?.toString(), exGt.remote.httpEndpoints.map((i) => BuildURI.from(curl).resolve(i).URI().toString()));
      return applyStart(
        Msger.openHttp(
          sthis,
          exGt.remote.httpEndpoints.map((i) => BuildURI.from(curl).resolve(i).URI()),
          msgP,
          exGt,
        ),
      );
    }
    const wsUrl = BuildURI.from(gestaltUrl).resolve(selectRandom(exGt.remote.wsEndpoints)).URI();
    // console.log("openWS---", wsUrl.toString(), "=====", exGt.remote.wsEndpoints);
    return applyStart(Msger.openWS(sthis, wsUrl, msgP, exGt));
  }

  static connect(
    sthis: SuperThis,
    auth: AuthType,
    curl: CoerceURI,
    imsgP: Partial<MsgerParamsWithEnDe> = {},
    conn: Partial<QSId> = {},
  ): Promise<Result<MsgConnected>> {
    return Msger.open(sthis, auth, curl, imsgP).then((srv) => MsgConnected.connect(auth, srv, conn));
  }

  private constructor() {
    /* */
  }
}
