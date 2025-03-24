import { Logger, LoggerImpl, URI } from "@adviser/cement";
import { drizzle as d1Drizzle } from "drizzle-orm/d1";
// import { drizzle as doDrizzle } from 'drizzle-orm/durable-sqlite';
import { Context, Hono } from "hono";
import {
  ConnMiddleware,
  HonoServerFactory,
  HonoServerBase,
  WSEventsConnId,
  WSContextWithId,
  ExposeCtxItem,
  ExposeCtxItemWithImpl,
  DrizzleDatebase,
  CORS,
} from "../hono-server.js";
import { SendOptions, WSContextInit, WSMessageReceive, WSReadyState } from "hono/ws";
// import { RequestInfo as CFRequestInfo } from "@cloudflare/workers-types";
// import { defaultMsgParams, jsonEnDe } from "../msger.js";
import { ensureLogger, ensureSuperThis, SuperThis, ps, rt } from "@fireproof/core";
import { Env } from "./env.js";
import { WSRoom } from "../ws-room.js";
import { FPRoomDurableObject } from "./server.js";
import { ConnItem } from "../msg-dispatch.js";
import { envKeyDefaults } from "../../../src/runtime/sts-service/index.js";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getRoomDurableObject(env: Env, _id: string) {
  const cfBackendKey = env.CF_BACKEND_KEY ?? "FP_WS_ROOM";
  // console.log("getRoomDurableObject", cfBackendKey, id);
  const rany = env as unknown as Record<string, DurableObjectNamespace<FPRoomDurableObject>>;
  // console.log("getRoomDurableObject", cfBackendKey);
  const dObjNs = rany[cfBackendKey];
  const did = dObjNs.idFromName(cfBackendKey);
  return dObjNs.get(did);
}

function webSocket2WSContextInit(ws: WebSocket): WSContextInit<WebSocket> {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    send: (data: string | ArrayBuffer, _options: SendOptions): void => {
      ws.send(data);
    },
    close: (code?: number, reason?: string): void => ws.close(code, reason),
    raw: ws,
    readyState: ws.readyState as WSReadyState,
    url: ws.url,
    protocol: ws.protocol,
  };
}

class CFWSRoom implements WSRoom {
  readonly sthis: SuperThis;
  readonly id: string;

  // readonly eventsWithConnId = eventsWithConnId;

  isWebsocket = false;
  readonly notWebSockets: ConnItem<WebSocket>[] = [];

  #events?: WSEventsConnId<WebSocket>;

  constructor(sthis: SuperThis) {
    this.sthis = sthis;
    this.id = sthis.nextId(12).str;
    // console.log("CFWSRoom", this.id);
  }

  #getWebSockets?: () => WebSocket[];
  applyGetWebSockets(_id: string, fn: () => WebSocket[]): void {
    this.isWebsocket = true;
    this.#getWebSockets = fn;
  }

  applyEvents(_id: string, events: WSEventsConnId<WebSocket>): void {
    this.#events = events;
  }

  getConns(): ConnItem<WebSocket>[] {
    if (!this.isWebsocket) {
      return this.notWebSockets as ConnItem<WebSocket>[];
    }
    const getWebSockets = this.#getWebSockets;
    if (!getWebSockets) {
      return [];
    }
    // console.log("getConns-enter:", this.id);
    try {
      const conns = getWebSockets();
      const res = conns
        .map((i) => {
          const o = i.deserializeAttachment();
          if (!o.conn) {
            return;
          }

          // console.log("getConns", o);
          return {
            conn: o.conn,
            touched: new Date(),
            ws: new WSContextWithId(o.id, webSocket2WSContextInit(i)),
          } satisfies ConnItem;
        })
        .filter((i) => !!i);
      return res;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("getConns", e);
      return [];
    }
    // throw new Error("Method not implemented.");
  }
  removeConn(conn: ps.cloud.QSId): void {
    if (!this.isWebsocket) {
      const idx = this.notWebSockets.findIndex((i) => ps.cloud.qsidEqual(i.conn, conn));
      if (idx >= 0) {
        this.notWebSockets.splice(idx, 1);
      }
      return;
    }
    const found = this.getConns().find((i) => ps.cloud.qsidEqual(i.conn, conn));
    if (!found) {
      return;
    }
    // console.log("removeConn", this.id, conn);
    const s = found.ws.raw?.deserializeAttachment();
    delete s.conn;
    found.ws.raw?.serializeAttachment(s);

    // throw new Error("Method not implemented.");
  }
  addConn(ws: WSContextWithId<WebSocket>, conn: ps.cloud.QSId): ps.cloud.QSId {
    if (!this.isWebsocket) {
      this.notWebSockets.push({ conn, touched: new Date(), ws });
      return conn;
    }
    const x = ws.raw?.deserializeAttachment();
    ws.raw?.serializeAttachment({ ...x, conn });
    return conn;
  }
  isConnected<T extends ps.cloud.MsgBase>(msg: T): msg is ps.cloud.MsgWithConnAuth<T> {
    if (!ps.cloud.MsgIsWithConn(msg)) {
      return false;
    }
    if (!this.isWebsocket) {
      return true;
    }
    return !!this.getConns().find((i) => ps.cloud.qsidEqual(i.conn, msg.conn));
  }

  readonly events = {
    onOpen: (id: string, evt: Event, ws: WebSocket) => {
      this.#events?.onOpen(evt, new WSContextWithId(id, webSocket2WSContextInit(ws)));
    },
    onMessage: (id: string, evt: MessageEvent<WSMessageReceive>, ws: WebSocket) => {
      const wci = new WSContextWithId(id, webSocket2WSContextInit(ws));
      this.#events?.onMessage(evt, wci);
    },
    onClose: (id: string, evt: CloseEvent, ws: WebSocket) => {
      this.#events?.onClose(evt, new WSContextWithId(id, webSocket2WSContextInit(ws)));
    },
    onError: (id: string, evt: Event, ws: WebSocket) => {
      this.#events?.onError(evt, new WSContextWithId(id, webSocket2WSContextInit(ws)));
    },
  };
}

interface CFExposeCtxItem {
  readonly id: string;
  readonly sthis: SuperThis;
  readonly cfObj: { env: Env; ctx: DurableObjectState };
  readonly ctx: ExposeCtxItem<CFWSRoom>;
}

type InternalCFExposeCtxItem = Omit<CFExposeCtxItem, "ctx"> & { ctx?: ExposeCtxItem<CFWSRoom> };

export class CFExposeCtx {
  #ctxs = new Map<string, InternalCFExposeCtxItem>();

  public static create(cfObj: CFExposeCtxItem["cfObj"], sthis: SuperThis, id: string): CFExposeCtx {
    const env = cfObj.env;
    env.FP_EXPOSE_CTX = env.FP_EXPOSE_CTX ?? new CFExposeCtx();
    env.FP_EXPOSE_CTX.#ctxs.set(id, {
      id,
      cfObj,
      sthis,
    });
    return env.FP_EXPOSE_CTX;
  }

  public static attach(
    env: Env,
    id: string,
    sthis: SuperThis,
    logger: Logger,
    port: number,
    ende: ps.cloud.EnDeCoder,
    gs: ps.cloud.Gestalt,
    stsService: rt.sts.SessionTokenService,
    dbFactory: () => DrizzleDatebase,
    wsRoom: CFWSRoom,
  ): CFExposeCtxItem {
    if (!env.FP_EXPOSE_CTX) {
      throw new Error(`CFExposeCtx: missing FP_EXPOSE_CTX`);
    }
    return env.FP_EXPOSE_CTX.attach(id, sthis, logger, port, ende, gs, stsService, dbFactory, wsRoom);
  }

  private constructor() {
    /* noop */
  }

  public get(id: string): CFExposeCtxItem {
    const ctx = this.#ctxs.get(id);
    if (!ctx || !ctx.ctx) {
      throw new Error(`CFExposeCtx: missing ${id}`);
    }
    return ctx as CFExposeCtxItem;
  }

  public attach(
    id: string,
    sthis: SuperThis,
    logger: Logger,
    port: number,
    ende: ps.cloud.EnDeCoder,
    gestalt: ps.cloud.Gestalt,
    stsService: rt.sts.SessionTokenService,
    dbFactory: () => DrizzleDatebase,
    wsRoom: CFWSRoom,
  ) {
    const item = this.#ctxs.get(id);
    if (!item) {
      throw new Error(`CFExposeCtx: missing ${id}`);
    }
    item.ctx = { id, sthis, logger, ende, gestalt, dbFactory, wsRoom, stsService, port };
    //this.#ctxs.set(id, item);
    return item as CFExposeCtxItem;
  }
}

export class CFHonoFactory implements HonoServerFactory {
  readonly _onClose: () => void;
  constructor(
    onClose: () => void = () => {
      /* */
    },
  ) {
    this._onClose = onClose;
  }
  async inject(
    c: Context,
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    fn: (rt: ExposeCtxItemWithImpl<CFWSRoom>) => Promise<Response | void>,
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  ): Promise<Response | void> {
    // this._env = c.env
    const sthis = ensureSuperThis({
      logger: new LoggerImpl(),
    });
    sthis.env.sets(c.env);

    const id = URI.from(c.req.url).getParam("ctxId");
    if (!id) {
      return new Response("missing ctxId", { status: 400 });
    }

    const logger = ensureLogger(sthis, `CFHono[${id}-${URI.from(c.req.url).pathname}]`);
    const ende = ps.cloud.jsonEnDe(sthis);
    const reqURI = URI.from(c.req.url);
    const protocolCapabilities = reqURI
      .getParam("capabilities", "reqRes,stream")
      .split(",")
      .filter((s) => ps.cloud.isProtocolCapabilities(s));
    const msgP = ps.cloud.defaultMsgParams(sthis, {
      hasPersistent: true,
      protocolCapabilities,
    });
    const gs = ps.cloud.defaultGestalt(msgP, {
      id: "FP-Storage-CF-Backend",
    });
    const cfBackendMode = reqURI.getParam("backendMode", "D1");
    let db: () => DrizzleDatebase;
    switch (cfBackendMode) {
      case "D1":
      default:
        db = () => d1Drizzle(c.env[c.env.CF_BACKEND_KEY ?? "FP_BACKEND_D1"]);
        break;
    }

    const stsService = await rt.sts.SessionTokenService.create({
      token: sthis.env.get(envKeyDefaults.PUBLIC) ?? "",
    });
    const wsRoom = new CFWSRoom(sthis);
    const item = CFExposeCtx.attach(c.env, id, sthis, logger, NaN, ende, gs, stsService, db, wsRoom);
    const chs = new CFHonoServer(item);

    return chs.start(item.ctx).then((chs) => fn({ ...item.ctx, impl: chs }));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async start(_app: Hono): Promise<void> {
    /* noop */
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async serve<T>(_app: Hono, _port?: number): Promise<T> {
    return {} as T;
  }
  async close(): Promise<void> {
    this._onClose();
    return;
  }
}

export class CFHonoServer extends HonoServerBase {
  readonly cfCtx: CFExposeCtxItem;
  constructor(ctx: CFExposeCtxItem) {
    super(ctx.id);
    this.cfCtx = ctx;
  }

  upgradeWebSocket(createEvents: (c: Context) => WSEventsConnId<WebSocket> | Promise<WSEventsConnId<WebSocket>>): ConnMiddleware {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return async (_conn, c, _next) => {
      const upgradeHeader = c.req.header("Upgrade");
      if (!upgradeHeader || upgradeHeader !== "websocket") {
        return new Response(
          this.cfCtx.ctx.ende.encode(ps.cloud.buildErrorMsg(this.cfCtx.ctx, {}, new Error("expected Upgrade: websocket"))),
          {
            status: 426,
          },
        );
      }
      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);
      const cfEnv = c.env as Env;
      const cfCtx = cfEnv.FP_EXPOSE_CTX.get(this.id);
      cfCtx.cfObj.ctx.acceptWebSocket(server, [cfCtx.id]);
      cfCtx.ctx.wsRoom.applyGetWebSockets(this.id, () => cfCtx.cfObj.ctx.getWebSockets());
      cfCtx.ctx.wsRoom.applyEvents(this.id, await createEvents(c));
      server.serializeAttachment({ id: cfCtx.id });
      cfCtx.ctx.wsRoom.events.onOpen(this.id, {} as Event, server);
      return new Response(null, {
        status: 101,
        headers: CORS.AsHeaderInit(),
        webSocket: client,
      });
    };
  }
}
