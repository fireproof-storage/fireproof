import { BuildURI, Logger, LoggerImpl, URI } from "@adviser/cement";
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
} from "../hono-server.js";
import { SendOptions, WSContextInit, WSMessageReceive, WSReadyState } from "hono/ws";
// import { RequestInfo as CFRequestInfo } from "@cloudflare/workers-types";
// import { defaultMsgParams, jsonEnDe } from "../msger.js";
import { ensureLogger, ensureSuperThis, SuperThis, ps, rt } from "@fireproof/core";
import { Env } from "./env.js";
import { WSRoom } from "../ws-room.js";
import { FPBackendDurableObject, FPRoomDurableObject } from "./server.js";
import { ConnItem } from "../msg-dispatch.js";
// import { portForLocalTest } from "../test-utils.js";

// const startedChs = new KeyedResolvOnce<CFHonoServer>();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getBackendDurableObject(env: Env, _id: string) {
  // console.log("getDurableObject", env);
  const cfBackendKey = env.CF_BACKEND_KEY ?? "FP_BACKEND_DO";
  // console.log("getBackendDurableObject", cfBackendKey, id);
  const rany = env as unknown as Record<string, DurableObjectNamespace<FPBackendDurableObject>>;
  const dObjNs = rany[cfBackendKey];
  const did = dObjNs.idFromName(env.FP_BACKEND_DO_ID ?? cfBackendKey);
  return dObjNs.get(did);
}

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

// const eventsWithConnId = new Map<
//   string,
//   {
//     getWebSockets?: () => WebSocket[];
//     events?: WSEventsConnId<WebSocket>;
//   }
// >();

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
    // console.log("applyGetWebSockets", this.id, id, fn);
    // let val = this.eventsWithConnId.get(id);
    // if (!val) {
    //   val = {};
    //   this.eventsWithConnId.set(id, val);
    // }
    this.isWebsocket = true;
    this.#getWebSockets = fn;
  }

  applyEvents(_id: string, events: WSEventsConnId<WebSocket>): void {
    // let val = this.eventsWithConnId.get(id);
    // if (!val) {
    //   val = {};
    //   this.eventsWithConnId.set(id, val);
    // }
    this.#events = events;
  }

  getConns(): ConnItem<WebSocket>[] {
    if (!this.isWebsocket) {
      return this.notWebSockets as ConnItem<WebSocket>[];
    }
    // if (!this.eventsWithConnId.has(conn.resId)) {
    //   // eslint-disable-next-line no-console
    //   // console.error("getConns:missing", conn);
    //   return [];
    // }
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
      // console.log("getConns", this.id, res);
      // console.log("getConns-leave:", this.id, conns.length, res.length);
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
      // console.log("addConn-local", this.id, conn);
      this.notWebSockets.push({ conn, touched: new Date(), ws });
      return conn;
    }
    const x = ws.raw?.deserializeAttachment();
    ws.raw?.serializeAttachment({ ...x, conn });
    // throw new Error("Method not implemented.");
    // console.log("addConn", this.id, conn);
    return conn;
  }
  isConnected<T extends ps.cloud.MsgBase>(msg: T): msg is ps.cloud.MsgWithConnAuth<T> {
    if (!ps.cloud.MsgIsWithConn(msg)) {
      return false;
    }
    if (!this.isWebsocket) {
      // return !!this.notWebSockets.find((i) => qsidEqual(i.conn, msg.conn))
      return true;
    }
    return !!this.getConns().find((i) => ps.cloud.qsidEqual(i.conn, msg.conn));
    // // eslint-disable-next-line no-console
    // console.log("isConnected", this.id, this.getWebSockets().length);
    // // throw new Error("Method not implemented.");
    // return true;
  }
  // readonly dobj: DurableObjectStub<FPRoomDurableObject>;
  // constructor(dobj: DurableObjectStub<FPRoomDurableObject>) {
  //   this.dobj = dobj;
  // }

  readonly events = {
    onOpen: (id: string, evt: Event, ws: WebSocket) => {
      // if (!this.eventsWithConnId.has(id)) {
      //   throw new Error(`applyEvents:onOpen missing not ${id} => ${Array.from(this.eventsWithConnId.keys())}`);
      // }
      // const o = ws.deserializeAttachment();
      this.#events?.onOpen(evt, new WSContextWithId(id, webSocket2WSContextInit(ws)));
    },
    onMessage: (id: string, evt: MessageEvent<WSMessageReceive>, ws: WebSocket) => {
      // if (!this.eventsWithConnId.has(id)) {
      //   // console.log("onMessaged:Error", this.id);
      //   throw new Error(`applyEvents:onMessagee missing not ${id}`);
      // }
      // const o = ws.deserializeAttachment();
      const wci = new WSContextWithId(id, webSocket2WSContextInit(ws));
      this.#events?.onMessage(evt, wci);
      // console.log("onMessaged", this.id);
    },
    onClose: (id: string, evt: CloseEvent, ws: WebSocket) => {
      // // console.log("onClosing", ws);
      // if (!this.eventsWithConnId.has(id)) {
      //   throw new Error(`applyEvents:onClose missing not ${id}`);
      // }
      // const o = ws.deserializeAttachment();
      this.#events?.onClose(evt, new WSContextWithId(id, webSocket2WSContextInit(ws)));
      // console.log("onClosed", this.id);
    },
    onError: (id: string, evt: Event, ws: WebSocket) => {
      // console.log("onError", ws);
      // if (!this.eventsWithConnId.has(id)) {
      //   throw new Error(`applyEvents:onError missing not ${id}`);
      // }
      // const o = ws.deserializeAttachment();
      this.#events?.onError(evt, new WSContextWithId(id, webSocket2WSContextInit(ws)));
    },
  }; // satisfies CFWSEvents;

  // async acceptConnection(ws: WebSocket, wse: WSEvents, ctx: Env): Promise<void> {
  //   throw new Error("Method not implemented.");
  //   // const dobj = getRoomDurableObject(ctx);
  //   // console.log("acceptConnection", dobj);
  //   // // const ret = dobj.acceptWebSocket(ws, wse);
  //   // const wsCtx = new WSContext(ws as WSContextInit);
  //   // wse.onOpen?.({} as Event, wsCtx);
  //   // // return Promise.resolve();
  //   // // ws.accept();
  //   // return Promise.resolve();
  // }

  // getEvents(): CFWSEvents {
  //   return this.events;
  // }

  // getWebSockets = (): WebSocket[] => {
  //   // console.log("getWebSockets", this.id);
  //   throw new Error("Method not ready");
  // }
  //   applyExposeCtx(ctx: { getWebSockets: () => WebSocket[] }): void {
  //     this.getWebSockets = ctx.getWebSockets;
  //   }
}

export type CFExposeCtxItem = ExposeCtxItem<CFWSRoom>;

export class CFExposeCtx {
  #ctxs = new Map<string, ExposeCtxItem<CFWSRoom>>();

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
    // const ctx = new CFExposeCtx(id, sthis, logger, ende, gs, db, wsRoom);
    env.FP_EXPOSE_CTX = env.FP_EXPOSE_CTX ?? new CFExposeCtx();
    return env.FP_EXPOSE_CTX.attach(id, sthis, logger, port, ende, gs, stsService, dbFactory, wsRoom);
  }

  private constructor() {
    /* noop */
  }

  public get(id: string): CFExposeCtxItem {
    const ctx = this.#ctxs.get(id);
    if (!ctx) {
      throw new Error(`CFExposeCtx: missing ${id}`);
    }
    return ctx;
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
    const item = { id, sthis, logger, ende, gestalt, dbFactory, wsRoom, stsService, port };
    this.#ctxs.set(id, item);
    return item;
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

    const id = sthis.nextId(12).str;

    const logger = ensureLogger(sthis, `CFHono[${id}-${URI.from(c.req.url).pathname}]`);
    const ende = ps.cloud.jsonEnDe(sthis);
    const reqURI = URI.from(c.req.url);
    const protocolCapabilities = reqURI
      .getParam("capabilities", "reqRes,stream")
      .split(",")
      .filter((s) => ps.cloud.isProtocolCapabilities(s));
    // console.log("protocolCapabilities", protocolCapabilities, reqURI.toString());
    const msgP = ps.cloud.defaultMsgParams(sthis, {
      hasPersistent: true,
      protocolCapabilities,
    });
    const gs = ps.cloud.defaultGestalt(msgP, {
      id: "FP-Storage-CF-Backend",
    });
    const cfBackendMode = reqURI.getParam("backendMode", "D1");
    // const port = portForLocalTest(sthis);
    let db: () => DrizzleDatebase;
    // let cfBackendKey: string;
    switch (cfBackendMode) {
      // case "DO":
      //   // const cfBackendKey = c.env.CF_BACKEND_KEY ?? "FP_BACKEND_DO";
      //   // console.log("DO-CF_BACKEND_KEY", cfBackendKey, c.env[cfBackendKey]);
      //   db = () => doDrizzle(getBackendDurableObject(c.env, id));

      //    // new CFDObjSQLDatabase(getBackendDurableObject(c.env, id));
      //   break;

      case "D1":
      default:
        // const cfBackendKey = ;
        // console.log("D1-CF_BACKEND_KEY", cfBackendKey, c.env[cfBackendKey]);
        db = () => d1Drizzle(c.env[c.env.CF_BACKEND_KEY ?? "FP_BACKEND_D1"]);
        break;
      // return startedChs
      //   .get(cfBackendKey)
      //   .once(async () => {
      //     const chs = new CFHonoServer(sthis, logger, ende, gs, db, wsRoom);
      //     await chs.start();
      //     return chs;
      //   })
      //   .then((chs) => fn({ sthis, logger, ende, impl: chs }));
      // break;
    }

    const stsService = await rt.sts.SessionTokenService.createFromEnv();

    const wsRoom = new CFWSRoom(sthis);
    const item = CFExposeCtx.attach(c.env, id, sthis, logger, NaN, ende, gs, stsService, db, wsRoom);
    // wsRoom.applyGetWebSockets(c.env.FP_EXPOSE_CTX.getWebSockets);

    // TODO WE NEED TO START THE DURABLE OBJECT
    // but then on every request we import the schema

    const chs = new CFHonoServer(item);
    return chs.start(item).then((chs) => fn({ ...item, impl: chs }));
    // return startedChs
    //   .get(cfBackendKey)
    //   .once(async () => {
    //     const chs = new CFHonoServer(sthis, logger, ende, gs, db, wsRoom);
    //     await chs.start();
    //     return chs;
    //   })
    //   .then((chs) => fn({ sthis, logger, ende, impl: chs, wsRoom }));

    // return ret; // .then((v) => sthis.logger.Flush().then(() => v))
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async start(_app: Hono): Promise<void> {
    // const { upgradeWebSocket } = await import("hono/cloudflare-workers");
    // this._upgradeWebSocket = upgradeWebSocket;
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
  // _upgradeWebSocket?: UpgradeWebSocket

  // readonly ende: EnDeCoder;
  // readonly env: Env;
  // readonly wsConnections = new Map<string, WSPair>()
  // constructor(
  //   id: string,
  //   // sthis: SuperThis,
  //   // logger: Logger,
  //   // ende: EnDeCoder,
  //   // gs: Gestalt,
  //   // sqlDb: SQLDatabase,
  //   // wsRoom: WSRoom,
  //   // headers?: HttpHeader
  // ) {
  //   super(id);
  //   // this.ende = ende;
  //   // this.env = env;
  // }

  // getDurableObject(conn: Connection) {
  //     const id = env.FP_META_GROUPS.idFromName("fireproof");
  //     const stub = env.FP_META_GROUPS.get(id);
  // }

  readonly ctx: CFExposeCtxItem;
  constructor(ctx: CFExposeCtxItem) {
    super(ctx.id);
    this.ctx = ctx;
  }

  upgradeWebSocket(createEvents: (c: Context) => WSEventsConnId<WebSocket> | Promise<WSEventsConnId<WebSocket>>): ConnMiddleware {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return async (_conn, c, _next) => {
      const upgradeHeader = c.req.header("Upgrade");
      if (!upgradeHeader || upgradeHeader !== "websocket") {
        return new Response(this.ctx.ende.encode(ps.cloud.buildErrorMsg(this.ctx, {}, new Error("expected Upgrade: websocket"))), {
          status: 426,
        });
      }
      const id = this.id;
      c.env.FP_EXPOSE_CTX.get(id).wsRoom.applyEvents(id, await createEvents(c));
      const url = BuildURI.from(c.req.url).setParam("ctxId", id).toString();
      // console.log("upgradeWebSocket", id, url);
      const dobjRoom = getRoomDurableObject(c.env, id);
      const ret = dobjRoom.fetch(url, c.req.raw);
      return ret;
    };
  }
}
