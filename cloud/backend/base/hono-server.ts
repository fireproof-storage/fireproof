import { exception2Result, HttpHeader, Logger, param, Result, top_uint8, URI } from "@adviser/cement";
import { SuperThis } from "@fireproof/core-types-base";
import { Context, Hono } from "hono";
// import { CFExposeCtxItem } from "./cf-hono-server.js";
// import { SQLDatabase } from "./meta-merger/abstract-sql.js";
import { WSRoom } from "./ws-room.js";
import { MsgDispatcher, MsgDispatcherCtx, Promisable, WSConnectionPair } from "./msg-dispatch.js";
import { calculatePreSignedUrl, PreSignedMsg } from "./pre-signed-url.js";
import { buildMsgDispatcher } from "./msg-dispatcher-impl.js";
// import type { LibSQLDatabase } from "drizzle-orm/libsql";
// import type { drizzle as d1Drizzle } from 'drizzle-orm/d1';
import {
  EnDeCoder,
  MsgTypesCtx,
  BindGetMeta,
  MsgWithError,
  EventGetMeta,
  ReqPutMeta,
  ResPutMeta,
  ReqDelMeta,
  ResDelMeta,
  AuthType,
  FPCloudAuthType,
  isAuthTypeFPCloudJWK,
  MsgWithConn,
  buildRes,
  MsgIsError,
  buildResPutMeta,
  buildResDelMeta,
  GwCtx,
  buildEventGetMeta,
  MsgBase,
  buildErrorMsg,
  Gestalt,
  ErrorMsg,
} from "@fireproof/core-types-protocols-cloud";
import { sts } from "@fireproof/core-runtime";
import {
  ConnMiddleware,
  DrizzleDatebase,
  ExposeCtxItem,
  ExposeCtxItemWithImpl,
  HonoServerImpl,
  WSContextWithId,
  WSEventsConnId,
} from "./types.js";
import { metaMerger } from "./meta-merger/meta-merger.js";

// export interface Connected {
//   readonly connId: QSId
//   readonly ws: WSContextWithId<T>;
//   // readonly send: (msg: MsgBase) => Promisable<Response>;
// }

export abstract class HonoServerBase implements HonoServerImpl {
  readonly id: string;
  constructor(id: string) {
    this.id = id;
  }

  abstract upgradeWebSocket(
    createEvents: (c: Context) => WSEventsConnId<unknown> | Promise<WSEventsConnId<unknown>>,
  ): ConnMiddleware;

  async validateAuth(ctx: MsgDispatcherCtx, auth: AuthType): Promise<Result<FPCloudAuthType>> {
    if (!isAuthTypeFPCloudJWK(auth)) {
      return Promise.resolve(Result.Err("Only fp-cloud-jwt is supported"));
    }
    // console.log("validateAuth-0", auth.params.jwk, ctx.stsService);
    const rAuth = await ctx.sts.validate(auth.params.jwk);
    if (rAuth.isErr()) {
      return Result.Err(rAuth);
    }
    return Result.Ok({
      type: "fp-cloud",
      params: {
        claim: rAuth.Ok().payload,
        jwk: auth.params.jwk,
      },
    });
  }
  // abstract getConnected(): Connected[];

  start(ctx: ExposeCtxItem<WSRoom>): Promise<HonoServerImpl> {
    metaMerger(ctx);
    return Promise.resolve(this);
  }

  async handleReqPutMeta(ctx: MsgDispatcherCtx, msg: MsgWithConn<ReqPutMeta>): Promise<MsgWithError<ResPutMeta>> {
    const rUrl = await buildRes({ method: "PUT", store: "meta" }, "resPutMeta", ctx, msg, this);
    if (MsgIsError(rUrl)) {
      return rUrl;
    }
    await metaMerger(ctx).addMeta({
      connection: msg,
      meta: msg.meta,
    });
    const res = await metaMerger(ctx).metaToSend(msg);
    return buildResPutMeta(ctx, msg, res, rUrl.signedUrl);
  }

  async handleReqDelMeta(ctx: MsgDispatcherCtx, msg: MsgWithConn<ReqDelMeta>): Promise<MsgWithError<ResDelMeta>> {
    const rUrl = await buildRes({ method: "DELETE", store: "meta" }, "resDelMeta", ctx, msg, this);
    if (MsgIsError(rUrl)) {
      return rUrl;
    }
    await metaMerger(ctx).delMeta({
      connection: msg,
      meta: msg.meta ?? { metas: [], keys: [] },
    });
    return buildResDelMeta(msg, rUrl.urlParam, rUrl.signedUrl);
  }

  async handleBindGetMeta(
    ctx: MsgDispatcherCtx,
    msg: MsgWithConn<BindGetMeta>,
    gwCtx: GwCtx = msg,
  ): Promise<MsgWithError<EventGetMeta>> {
    const rMsg = await buildRes({ method: "GET", store: "meta" }, "eventGetMeta", ctx, msg, this);
    if (MsgIsError(rMsg)) {
      return rMsg;
    }
    // console.log("handleBindGetMeta-in", msg, this.id);
    const meta = await metaMerger(ctx).metaToSend(msg);
    // console.log("handleBindGetMeta-meta", meta);
    const res = buildEventGetMeta(ctx, msg, meta, gwCtx, rMsg.signedUrl);
    // console.log("handleBindGetMeta-out", res);
    return res;
  }

  calculatePreSignedUrl(ctx: MsgTypesCtx, p: PreSignedMsg): Promise<Result<URI>> {
    const rRes = ctx.sthis.env.gets({
      STORAGE_URL: param.REQUIRED,
      ACCESS_KEY_ID: param.REQUIRED,
      SECRET_ACCESS_KEY: param.REQUIRED,
      REGION: "us-east-1",
    });
    if (rRes.isErr()) {
      return Promise.resolve(Result.Err(rRes.Err()));
    }
    const res = rRes.Ok();
    return calculatePreSignedUrl(p, {
      storageUrl: URI.from(res.STORAGE_URL),
      aws: {
        accessKeyId: res.ACCESS_KEY_ID,
        secretAccessKey: res.SECRET_ACCESS_KEY,
        region: res.REGION,
      },
    });
  }
}

export interface HonoServerFactory<T extends WSRoom = WSRoom> {
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  inject(c: Context, fn: (rt: ExposeCtxItemWithImpl<T>) => Promise<Response | void>): Promise<Response | void>;

  start(app: Hono): Promise<void>;
  serve(app: Hono, port: number): Promise<void>;
  close(): Promise<void>;
}

export const CORS = HttpHeader.from({
  // "Accept": "application/json",
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS,PUT,DELETE",
  "Access-Control-Allow-Headers": "Origin, Content-Type, Accept",
  "Access-Control-Max-Age": "86400", // Cache pre-flight response for 24 hours
});

// export function toHeadersInit(val: HttpHeader): HeadersInit {
//   return val.Items().reduce((headers, [k, v]) => {
//     headers[k] = v.join(", ");
//     return headers;
//   }, {} as Record<string, string>);
// }

class NoBackChannel implements MsgDispatcherCtx {
  readonly ctx: ExposeCtxItemWithImpl<WSRoom>;
  constructor(ctx: ExposeCtxItemWithImpl<WSRoom>) {
    this.ctx = ctx;
    this.impl = ctx.impl;
    this.id = ctx.id;
    this.port = ctx.port;
    this.sthis = ctx.sthis;
    this.logger = ctx.logger;
    this.ende = ctx.ende;
    this.gestalt = ctx.gestalt;
    this.req = this.ctx.req;
    this.dbFactory = ctx.dbFactory;
    this.sts = ctx.sts;
  }
  readonly req: MsgDispatcherCtx["req"];
  readonly impl: HonoServerImpl;
  readonly port: number;
  readonly sthis: SuperThis;
  readonly logger: Logger;
  readonly ende: EnDeCoder;
  readonly gestalt: Gestalt;
  readonly dbFactory: () => DrizzleDatebase;
  readonly id: string;
  readonly sts: sts.SessionTokenService;

  get ws(): WSContextWithId<unknown> {
    return {
      id: "no-id",
      send: (msg: string | ArrayBuffer | Uint8Array<ArrayBufferLike>): Promisable<Response> => {
        return new Response(msg);
      },
    } as unknown as WSContextWithId<unknown>;
  }
  get wsRoom(): WSRoom {
    return this.ctx.wsRoom;
    // throw new Error("NoBackChannel:wsRoom Method not implemented.");
  }
}

// function addCorsHeaders(c: Context): Context {
//   for (const [k, v] of Object.entries(CORS)) {
//     c.header(k, v);
//   }
//   return c;
// }

export class HonoServer {
  // readonly sthis: SuperThis;
  // readonly msgP: MsgerParams;
  // readonly gestalt: Gestalt;
  // readonly logger: Logger;
  readonly factory: HonoServerFactory;
  constructor(/* sthis: SuperThis, msgP: MsgerParams, gestalt: Gestalt, */ factory: HonoServerFactory) {
    // this.sthis = sthis;
    // this.logger = ensureLogger(sthis, "HonoServer");
    // this.msgP = msgP;
    // this.gestalt = gestalt;
    this.factory = factory;
  }

  start(): Promise<HonoServer> {
    return this.factory.start(new Hono()).then(() => this);
  }

  /* only for testing */
  async once(app: Hono, port: number): Promise<HonoServer> {
    this.register(app);
    await this.factory.start(app);
    await this.factory.serve(app, port);
    return this;
  }

  async serve(app: Hono, port: number): Promise<HonoServer> {
    await this.factory.serve(app, port);
    return this;
  }
  // readonly _register = new ResolveOnce<HonoServer>();
  register(app: Hono): HonoServer {
    app.options("*", () => {
      return new Response(null, {
        status: 200,
        headers: CORS.AsHeaderInit(),
      });
    });
    // return this._register.once(async () => {
    // console.log("register-1");
    //   await this.factory.start(app);
    // console.log("register-2");
    // app.put('/gestalt', async (c) => c.json(buildResGestalt(await c.req.json(), defaultGestaltItem({ id: "server", hasPersistent: true }).gestalt)))
    // app.put('/error', async (c) => c.json(buildErrorMsg(sthis, sthis.logger, await c.req.json(), new Error("test error"))))
    app.put("/fp", (c) =>
      this.factory.inject(c, async (ctx) => {
        Object.entries(c.req.header()).forEach(([k, v]) => c.res.headers.set(k, v[0]));
        const rMsg = await exception2Result(() => c.req.json() as Promise<MsgBase>);
        if (rMsg.isErr()) {
          return c.json(buildErrorMsg(ctx, { tid: "internal" }, rMsg.Err()), 400, CORS.AsRecordStringString());
        }
        const dispatcher = buildMsgDispatcher(ctx.sthis);
        return dispatcher.dispatch(new NoBackChannel(ctx), rMsg.Ok());
      }),
    );
    // console.log("register-2.1");
    app.get("/ws", (c, next) =>
      this.factory.inject(c, async (ctx) => {
        return ctx.impl.upgradeWebSocket((_c) => {
          let dp: MsgDispatcher;
          // const id = ctx.sthis.nextId().str;
          // console.log("upgradeWebSocket:inject:", id);
          return {
            onOpen: (_e, _ws) => {
              dp = buildMsgDispatcher(ctx.sthis);
              // console.log("onOpen:inject:", id);
            },
            onError: (error) => {
              ctx.logger.Error().Err(error).Msg("WebSocket error");
            },
            onMessage: async (event, ws) => {
              // console.log("onMessage:inject:", ctx.id, event.data);
              const rMsg = await exception2Result(async () => ctx.ende.decode(await top_uint8(event.data)) as MsgBase);
              if (rMsg.isErr()) {
                ws.send(
                  ctx.ende.encode(
                    buildErrorMsg(
                      ctx,
                      {
                        message: event.data,
                      } as ErrorMsg,
                      rMsg.Err(),
                    ),
                  ),
                );
              } else {
                // console.log("dp-dispatch", rMsg.Ok(), dp);
                await dp.dispatch(
                  {
                    ...ctx,
                    ws,
                    req: {
                      method: c.req.method,
                      url: c.req.url,
                      headers: HttpHeader.from(c.req.header()),
                    },
                  },
                  rMsg.Ok(),
                );
              }
            },

            onClose: (_evt, _ws) => {
              // impl.delConn(ws);
              // console.log("onClose:inject:", id);
              dp = undefined as unknown as MsgDispatcher;
              // console.log('Connection closed')
            },
          };
        })(new WSConnectionPair(), c, next);
      }),
    );
    return this;
    // console.log("register-3");
    // await this.factory.serve(app, port);
    // console.log("register-4");
    // return this;
    // });
  }
  async close() {
    const ret = await this.factory.close();
    return ret;
  }
}
