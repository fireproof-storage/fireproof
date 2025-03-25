// / <reference types="@cloudflare/workers-types" />
// import { Logger } from "@adviser/cement";
// import { Hono } from "hono";
import { DurableObject } from "cloudflare:workers";
import { HonoServer } from "../hono-server.js";
import { Hono } from "hono";
import { Env } from "./env.js";
import { CFHonoFactory } from "./cf-hono-server.js";
import { WSMessageReceive } from "hono/ws";
import { URI } from "@adviser/cement";
// import { ExportedHandler, WebSocket } from "@cloudflare/workers-types";

const app = new Hono();
const honoServer = new HonoServer(new CFHonoFactory()).register(app);

export default {
  fetch: async (req, env, ctx): Promise<Response> => {
    // console.log("fetch-1", req.url);
    await honoServer.start();
    // await honoServer.register(app);
    // console.log("fetch-2", req.url);
    return app.fetch(req, env, ctx);
  },
} satisfies ExportedHandler<Env>;
/*
  async fetch(req, env, _ctx): Promise<Response> {
    const id = env.FP_META_GROUPS.idFromName("fireproof");
    const stub = env.FP_META_GROUPS.get(id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return stub.fetch(req as any) as unknown as Promise<Response>;
  },
} satisfies ExportedHandler<Env>;
*/

export interface ExecSQLResult {
  readonly rowsRead: number;
  readonly rowsWritten: number;
  readonly rawResults: unknown[];
}

export class FPBackendDurableObject extends DurableObject<Env> {
  doneSchema = false;
  async execSql(sql: string, params: unknown[], schema?: boolean): Promise<ExecSQLResult> {
    if (schema && this.doneSchema) {
      return { rowsRead: 0, rowsWritten: 0, rawResults: [] };
    }
    const cursor = await this.ctx.storage.sql.exec(sql, ...params);
    const rawResults = cursor.toArray();
    const res = {
      rowsRead: cursor.rowsRead,
      rowsWritten: cursor.rowsWritten,
      rawResults,
    };
    // console.log("execSql", sql, params, res);
    return res;
  }
}

export interface CFWSEvents {
  readonly onOpen: (evt: Event, ws: WebSocket) => void;
  readonly onMessage: (evt: MessageEvent<WSMessageReceive>, ws: WebSocket) => void;
  readonly onClose: (evt: CloseEvent, ws: WebSocket) => void;
  readonly onError: (evt: Event, ws: WebSocket) => void;
}

export class FPRoomDurableObject extends DurableObject<Env> {
  // wsEvents?: CFWSEvents;

  readonly id = Math.random().toString(36).slice(2);

  // _id!: string;

  async fetch(request: Request): Promise<Response> {
    // console.log("DO-fetch", request.url, request.method, request.headers);
    // Creates two ends of a WebSocket connection.
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    this.ctx.acceptWebSocket(server);

    const id = URI.from(request.url).getParam("ctxId", "none");

    // console.log("DO-ids:", id, this.id);

    this.env.FP_EXPOSE_CTX.get(id).wsRoom.applyGetWebSockets(id, () => this.ctx.getWebSockets());
    server.serializeAttachment({ id });

    this.env.FP_EXPOSE_CTX.get(id).wsRoom.events.onOpen(id, {} as Event, server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  webSocketOpen(ws: WebSocket): void | Promise<void> {
    const { id } = ws.deserializeAttachment();
    this.env.FP_EXPOSE_CTX.get(id).wsRoom.events.onOpen(id, {} as Event, ws);
  }

  webSocketError(ws: WebSocket, error: unknown): void | Promise<void> {
    const { id } = ws.deserializeAttachment();
    this.env.FP_EXPOSE_CTX.get(id).wsRoom.events.onError(id, error as Event, ws);
  }

  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer): Promise<void> {
    const { id } = ws.deserializeAttachment();
    // console.log("webSocketMessage", msg);
    this.env.FP_EXPOSE_CTX.get(id).wsRoom.events.onMessage(id, { data: msg } as MessageEvent, ws);
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void | Promise<void> {
    const { id } = ws.deserializeAttachment();
    this.env.FP_EXPOSE_CTX.get(id).wsRoom.events.onClose(id, { code, reason } as CloseEvent, ws);
  }
}
