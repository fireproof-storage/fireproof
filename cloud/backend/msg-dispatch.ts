import { SuperThis, UnReg, ps, rt } from "@fireproof/core";

import { CORS, ExposeCtxItemWithImpl, HonoServerImpl, WSContextWithId } from "./hono-server.js";
import { WSRoom } from "./ws-room.js";

type MsgBase = ps.cloud.MsgBase;
type MsgWithError<T extends MsgBase> = ps.cloud.MsgWithError<T>;
type QSId = ps.cloud.QSId;
type MsgWithConnAuth<T extends MsgBase> = ps.cloud.MsgWithConnAuth<T>;
type FPJWKCloudAuthType = ps.cloud.FPJWKCloudAuthType;
type AuthType = ps.cloud.AuthType;
type PreSignedMsg = ps.cloud.PreSignedMsg;
const { buildErrorMsg, isAuthTypeFPCloud, MsgIsError, isAuthTypeFPCloudJWK } = ps.cloud;

export interface MsgContext {
  calculatePreSignedUrl(p: PreSignedMsg): Promise<string>;
}

export interface WSPair {
  readonly client: WebSocket;
  readonly server: WebSocket;
}

export class WSConnectionPair {
  wspair?: WSPair;

  attachWSPair(wsp: WSPair) {
    if (!this.wspair) {
      this.wspair = wsp;
    } else {
      throw new Error("wspair already set");
    }
  }
}

export type Promisable<T> = T | Promise<T>;

// function WithValidConn<T extends MsgBase>(msg: T, rri?: ResOpen): msg is MsgWithConn<T> {
//   return MsgIsWithConn(msg) && !!rri && rri.conn.resId === msg.conn.resId && rri.conn.reqId === msg.conn.reqId;
// }

export interface ConnItem<T = unknown> {
  readonly conn: QSId;
  touched: Date;
  readonly ws: WSContextWithId<T>;
}

// const connManager = new ConnectionManager();

export interface ConnectionInfo {
  readonly conn: WSConnectionPair;
  readonly reqId: string;
  readonly resId: string;
}

export interface MsgDispatcherCtx extends ExposeCtxItemWithImpl<WSRoom> {
  readonly id: string;
  readonly impl: HonoServerImpl;
  readonly stsService: rt.sts.SessionTokenService;
  // readonly auth: AuthFactory;
  readonly ws: WSContextWithId<unknown>;
}

export interface MsgDispatchItem<S extends MsgBase, Q extends MsgBase> {
  readonly match: (msg: MsgBase) => boolean;
  readonly isNotConn?: boolean;
  fn(ctx: MsgDispatcherCtx, msg: Q): Promisable<MsgWithError<S>>;
}

export class MsgDispatcher {
  readonly sthis: SuperThis;
  // readonly logger: Logger;
  // // wsConn?: WSConnection;
  // readonly gestalt: Gestalt;
  readonly id: string;
  // readonly ende: EnDeCoder;

  // // readonly connManager = connManager;

  // readonly wsRoom: WSRoom;

  static new(sthis: SuperThis /*, gestalt: Gestalt, ende: EnDeCoder, wsRoom: WSRoom*/): MsgDispatcher {
    return new MsgDispatcher(sthis /*, gestalt, ende, wsRoom*/);
  }

  private constructor(sthis: SuperThis /*, gestalt: Gestalt, ende: EnDeCoder, wsRoom: WSRoom*/) {
    this.sthis = sthis;
    // this.logger = ensureLogger(sthis, "Dispatcher");
    // this.gestalt = gestalt;
    this.id = sthis.nextId().str;
    // this.ende = ende;
    // this.wsRoom = wsRoom;
  }

  // addConn(msg: MsgBase): Result<QSId> {
  //   if (!MsgIsReqOpenWithConn(msg)) {
  //     return this.logger.Error().Msg("msg missing reqId").ResultError();
  //   }
  //   return Result.Ok(connManager.addConn(msg.conn));
  // }

  readonly items = new Map<string, MsgDispatchItem<MsgBase, MsgBase>>();
  registerMsg(...iItems: MsgDispatchItem<MsgBase, MsgBase>[]): UnReg {
    const items = iItems.flat();
    const ids: string[] = items.map((item) => {
      const id = this.sthis.nextId(12).str;
      this.items.set(id, item);
      return id;
    });
    return () => ids.forEach((id) => this.items.delete(id));
  }

  send(ctx: MsgDispatcherCtx, msg: MsgBase) {
    const isError = MsgIsError(msg);
    const str = ctx.ende.encode(msg);
    ctx.ws.send(str);
    return new Response(str, {
      status: isError ? 500 : 200,
      headers: CORS.AsHeaderInit(),
      statusText: isError ? "error" : "ok",
    });
  }

  async validateConn<T extends MsgBase>(
    ctx: MsgDispatcherCtx,
    msg: T,
    fn: (msg: MsgWithConnAuth<T>) => Promisable<MsgWithError<MsgBase>>,
  ): Promise<Response> {
    if (!ctx.wsRoom.isConnected(msg)) {
      return this.send(ctx, buildErrorMsg(ctx, { ...msg }, new Error("dispatch missing connection")));
      // return send(buildErrorMsg(this.sthis, this.logger, msg, new Error("non open connection")));
    }
    // console.log("validateConn-1");
    const r = await this.validateAuth(ctx, msg, (msg) => fn(msg));
    return Promise.resolve(this.send(ctx, r));
  }

  async validateAuth<T extends MsgBase>(
    ctx: MsgDispatcherCtx,
    msg: T,
    fn: (msg: T) => Promisable<MsgWithError<MsgBase>>,
  ): Promise<MsgWithError<MsgBase>> {
    if (msg.auth) {
      const rAuth = await ctx.impl.validateAuth(ctx, msg.auth);
      if (rAuth.isErr()) {
        return buildErrorMsg(ctx, msg, rAuth.Err());
      }
      const sMsg = await fn({
        ...msg,
        auth: rAuth.Ok(),
      });
      switch (true) {
        case isAuthTypeFPCloudJWK(sMsg.auth):
          return sMsg;
        case isAuthTypeFPCloud(sMsg.auth):
          return {
            ...sMsg,
            auth: {
              type: "fp-cloud-jwk",
              params: {
                jwk: sMsg.auth.params.jwk,
              },
            } satisfies FPJWKCloudAuthType as AuthType, // send me to hell ts
          };
        default:
          return buildErrorMsg(ctx, msg, new Error("unexpected auth"));
      }
    }
    return buildErrorMsg(ctx, msg, new Error("missing auth"));
  }

  async dispatch(ctx: MsgDispatcherCtx, msg: MsgBase): Promise<Response> {
    // const id = this.sthis.nextId(12).str;
    try {
      // console.log("dispatch-1", id);
      const found = Array.from(this.items.values()).find((item) => item.match(msg));
      if (!found) {
        // console.log("dispatch-2", msg);
        return this.send(ctx, buildErrorMsg(ctx, msg, new Error(`unexpected message`)));
      }
      if (!found.isNotConn) {
        // console.log("dispatch-3");
        return this.validateConn(ctx, msg, (msg) => found.fn(ctx, msg));
      }
      return this.send(ctx, await this.validateAuth(ctx, msg, (msg) => found.fn(ctx, msg)));
    } catch (e) {
      // console.log("dispatch-4", id);
      return this.send(ctx, buildErrorMsg(ctx, msg, e as Error));
      // } finally {
      //   console.log("dispatch-5", id);
    }
  }
}
