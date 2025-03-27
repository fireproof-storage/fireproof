import { UpgradeWebSocket, WSContext, WSEvents, WSMessageReceive } from "hono/ws";
import {
  ConnMiddleware,
  ExposeCtxItem,
  ExposeCtxItemWithImpl,
  HonoServerBase,
  HonoServerFactory,
  HonoServerImpl,
  WSContextWithId,
  WSEventsConnId,
} from "../hono-server.js";
import { ResolveOnce, URI } from "@adviser/cement";
import { Context, Hono } from "hono";
import { ensureLogger, SuperThis, ps, rt } from "@fireproof/core";
// import { SQLDatabase } from "./meta-merger/abstract-sql.js";
import { WSRoom } from "../ws-room.js";
import { ConnItem } from "../msg-dispatch.js";
import { MetaMerger } from "../meta-merger/meta-merger.js";
import { LibSQLDatabase } from "drizzle-orm/libsql";
import { envKeyDefaults } from "../../../src/runtime/sts-service/index.js";

const { defaultGestalt, isProtocolCapabilities, MsgIsWithConn, qsidKey, jsonEnDe, defaultMsgParams } = ps.cloud;
type Gestalt = ps.cloud.Gestalt;
type MsgBase = ps.cloud.MsgBase;
type MsgerParams = ps.cloud.MsgerParams;
type MsgWithConnAuth<T extends MsgBase> = ps.cloud.MsgWithConnAuth<T>;
type QSId = ps.cloud.QSId;

interface ServerType {
  close(fn: () => void): void;
}

type serveFn = (options: unknown, listeningListener?: ((info: unknown) => void) | undefined) => ServerType;

export interface NodeHonoFactoryParams {
  readonly msgP?: MsgerParams;
  readonly gs?: Gestalt;
  readonly sql: LibSQLDatabase;
}

// const wsConnections = new Map<string, WSContextWithId<WSContext>>();
class NodeWSRoom implements WSRoom {
  readonly sthis: SuperThis;
  readonly id: string;

  readonly _conns = new Map<string, ConnItem>();
  constructor(sthis: SuperThis) {
    this.sthis = sthis;
    this.id = sthis.nextId(12).str;
  }

  getConns(): ConnItem[] {
    return Array.from(this._conns.values());
  }
  removeConn(conn: QSId): void {
    // console.log("removeConn", this.id, qsidKey(conn));
    this._conns.delete(qsidKey(conn));
  }
  addConn(ws: WSContextWithId<unknown>, conn: QSId): QSId {
    // console.log("addConn", this.id, qsidKey(conn));
    const key = qsidKey(conn);
    let ci = this._conns.get(key);
    if (!ci) {
      ci = { ws, conn, touched: new Date() };
      this._conns.set(key, ci);
    }
    return ci.conn;
  }

  isConnected(msg: MsgBase): msg is MsgWithConnAuth<MsgBase> {
    if (!MsgIsWithConn(msg)) {
      return false;
    }
    return this._conns.has(qsidKey(msg.conn));
  }

  // addConn(ws: WSContextWithId): void {
  //   wsConnections.add(ws);
  // }

  // delConn(ws: WSContextWithId): void {
  //   wsConnections.delete(ws);
  // }

  // #ensureWSContextWithId(id: string, ws: WSContext) {
  //   let wsId = wsConnections.get(id);
  //   if (wsId) {
  //     return wsId;
  //   }
  //   wsId = new WSContextWithId(this.sthis.nextId(12).str, ws);
  //   wsConnections.set(id, wsId);
  //   return wsId;
  // }

  createEvents(outer: WSEventsConnId<unknown>): (c: Context) => WSEvents<unknown> {
    const id = this.sthis.nextId(12).str;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return (_c: Context) => ({
      onOpen: (evt: Event, ws: WSContext) => {
        // console.log("onOpen", id);
        outer.onOpen(evt, new WSContextWithId(id, ws));
      },
      onMessage: (evt: MessageEvent<WSMessageReceive>, ws: WSContext) => {
        outer.onMessage(evt, new WSContextWithId(id, ws));
      },
      onClose: (evt: CloseEvent, ws: WSContext) => {
        // console.log("onClose", id);
        outer.onClose(evt, new WSContextWithId(id, ws));
        // wsConnections.delete(id);
      },
      onError: (evt: Event, ws: WSContext) => {
        outer.onError(evt, new WSContextWithId(id, ws));
      },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  acceptConnection(ws: WebSocket, wse: WSEvents): Promise<void> {
    // const id = this.sthis.nextId(12).str;
    // wsConnections.set(id, ws);
    // this.

    throw new Error("Method not implemented.");
    // const wsCtx = new WSContextWithId(this.sthis.nextId(12).str, ws as WSContextInit);

    // console.log("acceptConnection", wsCtx);
    // ws.onopen = function(this, ev) {
    //   console.log("onopen", ev);
    //   wsConnections.set(wsCtx.id, wsCtx);
    //   wse.onOpen?.(ev, wsCtx);
    // }
    // ws.onerror = (err) => {
    //   console.log("onerror", err);
    //   wse.onError?.(err, wsCtx);
    // };
    // ws.onclose = function(this, ev) {
    //   console.log("onclose", ev);
    //   wse.onClose?.(ev, wsCtx);
    //   wsConnections.delete(wsCtx.id);
    // };
    // ws.onmessage = (evt) => {
    //   console.log("onmessage", evt);
    //   // wsCtx.send("Hellox from server");
    //   wse.onMessage?.(evt, wsCtx);
    // };

    // ws.accept();
    // return Promise.resolve();
  }
}

const createDB = new ResolveOnce();

export class NodeHonoFactory implements HonoServerFactory {
  _upgradeWebSocket!: UpgradeWebSocket;
  _injectWebSocket!: (t: unknown) => void;
  _serve!: serveFn;
  _server!: ServerType;

  readonly _wsRoom: NodeWSRoom;
  // _env!: Env;

  readonly sthis: SuperThis;
  readonly params: NodeHonoFactoryParams;
  constructor(sthis: SuperThis, params: NodeHonoFactoryParams) {
    this.sthis = sthis;
    this.params = params;
    this._wsRoom = new NodeWSRoom(sthis);
  }

  async inject(
    c: Context,
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    fn: (rt: ExposeCtxItemWithImpl<NodeWSRoom>) => Promise<Response | void>,
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  ): Promise<Response | void> {
    // this._env = c.env;
    // const sthis = ensureSuperThis();
    const sthis = this.sthis;
    const logger = ensureLogger(sthis, `NodeHono[${URI.from(c.req.url).pathname}]`);
    const ende = jsonEnDe(sthis);

    const id = sthis.nextId(12).str;

    const protocolCapabilities = URI.from(c.req.url)
      .getParam("capabilities", "reqRes,stream")
      .split(",")
      .filter((s) => isProtocolCapabilities(s));
    const msgP =
      this.params.msgP ??
      defaultMsgParams(sthis, {
        hasPersistent: true,
        protocolCapabilities,
      });
    const gestalt =
      this.params.gs ??
      defaultGestalt(msgP, {
        id: "FP-Storage-Backend", // fpProtocol ? (fpProtocol === "http" ? "HTTP-server" : "WS-server") : "FP-CF-Server",
      });

    const stsService = await rt.sts.SessionTokenService.create({
      token: sthis.env.get(envKeyDefaults.PUBLIC) ?? "",
    });
    const ctx: ExposeCtxItem<NodeWSRoom> = {
      id,
      sthis,
      logger,
      wsRoom: this._wsRoom,
      port: +(this.sthis.env.get("ENDPOINT_PORT") ?? "0"),
      stsService,
      gestalt,
      ende,
      dbFactory: () => this.params.sql,
    };

    const nhs = new NodeHonoServer(id, this);
    // return nhs.start(ctx).then((nhs) => fn({ ...ctx, impl: nhs }));
    return fn({ ...ctx, impl: nhs });
  }

  async start(app: Hono): Promise<void> {
    try {
      await createDB.once(() => {
        return new MetaMerger("test", this.sthis.logger, this.params.sql); // .createSchema();
      });

      const { createNodeWebSocket } = await import("@hono/node-ws");
      const { serve } = await import("@hono/node-server");
      this._serve = serve as serveFn;
      const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });
      this._upgradeWebSocket = upgradeWebSocket;
      this._injectWebSocket = injectWebSocket as (t: unknown) => void;
    } catch (e) {
      throw this.sthis.logger.Error().Err(e).Msg("Failed to start NodeHonoFactory").AsError();
    }
  }

  async serve(app: Hono, port: number): Promise<void> {
    await new Promise<void>((resolve) => {
      this._server = this._serve({ fetch: app.fetch, port }, () => {
        this._injectWebSocket(this._server);
        resolve();
      });
    });
  }
  async close(): Promise<void> {
    this._server.close(() => {
      /* */
    });
    // return new Promise((res) => this._server.close(() => res()));
  }
}

export class NodeHonoServer extends HonoServerBase implements HonoServerImpl {
  readonly _upgradeWebSocket: UpgradeWebSocket;
  // readonly wsRoom: NodeWSRoom;
  readonly wsRoom: WSRoom;
  constructor(
    id: string,
    // sthis: SuperThis,
    factory: NodeHonoFactory,
    // gs: Gestalt,
    // sqldb: SQLDatabase,
    // wsRoom: WSRoom,
    // headers?: HttpHeader
  ) {
    super(id);
    this.wsRoom = factory._wsRoom;
    this._upgradeWebSocket = factory._upgradeWebSocket;
  }

  // upgradeWebSocket<WebSocket>(createEvents: (c: Context) => WSEventsConnId<WebSocket> | Promise<WSEventsConnId<WebSocket>>): ConnMiddleware {
  upgradeWebSocket(createEvents: (c: Context) => WSEventsConnId<unknown> | Promise<WSEventsConnId<unknown>>): ConnMiddleware {
    return async (_conn, c, next) => {
      const wse = await createEvents(c);
      return this._upgradeWebSocket((this.wsRoom as NodeWSRoom).createEvents(wse))(c, next);
    };
  }

  // override getConnected(): Connected[] {
  //   // console.log("getConnected", wsConnections.size);
  //   return Array.from(wsConnections.values()).map(m => ({
  //     connId: m.id,
  //     ws: m,
  //   }))
  // }
}
