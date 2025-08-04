import { UpgradeWebSocket, WSContext, WSEvents, WSMessageReceive } from "hono/ws";
import {
  ConnItem,
  ConnMiddleware,
  ExposeCtxItem,
  ExposeCtxItemWithImpl,
  HonoServerBase,
  HonoServerFactory,
  HonoServerImpl,
  WSContextWithId,
  WSEventsConnId,
  WSRoom,
  mm,
} from "@fireproof/cloud-backend-base";
import { HttpHeader, ResolveOnce, URI } from "@adviser/cement";
import { Context, Hono } from "hono";
import { SuperThis } from "@fireproof/core-types-base";
// import { SQLDatabase } from "./meta-merger/abstract-sql.js";
import { LibSQLDatabase } from "drizzle-orm/libsql";
import { jsonEnDe, defaultMsgParams } from "@fireproof/core-protocols-cloud";
import { ensureLogger, sts } from "@fireproof/core-runtime";
import {
  MsgerParams,
  Gestalt,
  QSId,
  qsidKey,
  MsgBase,
  MsgIsWithConn,
  isProtocolCapabilities,
  defaultGestalt,
  MsgWithConn,
} from "@fireproof/core-types-protocols-cloud";

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
    const res = Array.from(this._conns.values());
    return res;
  }
  removeConn(...conns: QSId[]): void {
    for (const conn of conns.flat()) {
      this._conns.delete(qsidKey(conn));
    }
  }
  addConn<T extends WSRoom, WS>(ctx: ExposeCtxItem<T>, ws: WSContextWithId<WS>, conn: QSId): QSId {
    // console.log("addConn", this.id, qsidKey(conn));
    const key = qsidKey(conn);
    let ci = this._conns.get(key);
    if (!ci) {
      ci = { ws, conns: [], touched: new Date(), id: this.sthis.nextId(12).str };
      this._conns.set(key, ci);
    }
    ci?.conns.push(conn);
    return conn;
  }

  isConnected(msg: MsgBase): msg is MsgWithConn<MsgBase> {
    if (!MsgIsWithConn(msg)) {
      return false;
    }
    return this._conns.has(qsidKey(msg.conn));
  }

  createEvents(outer: WSEventsConnId<unknown>): (c: Context) => WSEvents<unknown> {
    const id = this.sthis.nextId(12).str;

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
    throw new Error("Method not implemented.");
  }
}

const createDB = new ResolveOnce();

export class NodeHonoFactory implements HonoServerFactory {
  _upgradeWebSocket!: UpgradeWebSocket;
  _injectWebSocket!: (t: ServerType) => void;
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

    const stsService = await sts.SessionTokenService.create({
      token: sthis.env.get(sts.envKeyDefaults.PUBLIC) ?? "",
    });
    const ctx: ExposeCtxItem<NodeWSRoom> = {
      id,
      sthis,
      logger,
      wsRoom: this._wsRoom,
      port: +(this.sthis.env.get("ENDPOINT_PORT") ?? "0"),
      sts: stsService,
      gestalt,
      ende,
      req: {
        url: c.req.url,
        method: c.req.method,
        headers: HttpHeader.from(c.req.header()),
      },
      dbFactory: () => this.params.sql,
    };

    const nhs = new NodeHonoServer(id, this);
    // return nhs.start(ctx).then((nhs) => fn({ ...ctx, impl: nhs }));
    return fn({ ...ctx, impl: nhs });
  }

  async start(app: Hono): Promise<void> {
    try {
      await createDB.once(() => {
        return new mm.MetaMerger("test", this.sthis.logger, this.params.sql); // .createSchema();
      });

      const { createNodeWebSocket } = await import("@hono/node-ws");
      const { serve } = await import("@hono/node-server");
      this._serve = serve as serveFn;
      const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });
      this._upgradeWebSocket = upgradeWebSocket;
      this._injectWebSocket = injectWebSocket as (t: ServerType) => void;
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
