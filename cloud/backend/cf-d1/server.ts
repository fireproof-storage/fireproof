// / <reference types="@cloudflare/workers-types" />
// import { Logger } from "@adviser/cement";
// import { Hono } from "hono";
import { DurableObject } from "cloudflare:workers";
import { WebSocket as CFWebSocket } from "@cloudflare/workers-types";
import { HonoServer } from "../hono-server.js";
import { Hono } from "hono";
import { Env } from "./env.js";
import { CFExposeCtx, CFHonoFactory, getRoomDurableObject } from "./cf-hono-server.js";
import { WSMessageReceive } from "hono/ws";
import { ensureSuperThis } from "@fireproof/core";
import { BuildURI, LoggerImpl } from "@adviser/cement";
// import { ExportedHandler, WebSocket } from "@cloudflare/workers-types";

export default {
  async fetch(req, env): Promise<Response> {
    // CORS pre-flight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS,PUT,DELETE",
          "Access-Control-Allow-Headers": "Origin, Content-Type, Accept",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const res = await getRoomDurableObject(env, "V1").fetch(req);

    const outHeaders = new Headers(res.headers);
    outHeaders.set("Access-Control-Allow-Origin", "*");
    outHeaders.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS,PUT,DELETE");
    outHeaders.set("Access-Control-Allow-Headers", "Origin, Content-Type, Accept");
    outHeaders.set("Access-Control-Max-Age", "86400");

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: outHeaders,
    });
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

// export class FPBackendDurableObject extends DurableObject<Env> {
//   doneSchema = false;
//   async execSql(sql: string, params: unknown[], schema?: boolean): Promise<ExecSQLResult> {
//     if (schema && this.doneSchema) {
//       return { rowsRead: 0, rowsWritten: 0, rawResults: [] };
//     }
//     const cursor = await this.ctx.storage.sql.exec(sql, ...params);
//     const rawResults = cursor.toArray();
//     const res = {
//       rowsRead: cursor.rowsRead,
//       rowsWritten: cursor.rowsWritten,
//       rawResults,
//     };
//     // console.log("execSql", sql, params, res);
//     return res;
//   }
// }

export interface CFWSEvents {
  readonly onOpen: (evt: Event, ws: CFWebSocket) => void;
  readonly onMessage: (evt: MessageEvent<WSMessageReceive>, ws: CFWebSocket) => void;
  readonly onClose: (evt: CloseEvent, ws: CFWebSocket) => void;
  readonly onError: (evt: Event, ws: CFWebSocket) => void;
}

export class FPRoomDurableObject extends DurableObject<Env> {
  // wsEvents?: CFWSEvents;

  readonly id = Math.random().toString(36).slice(2);

  readonly honoApp: Hono;
  readonly honoServer: HonoServer;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.honoApp = new Hono();
    this.honoServer = new HonoServer(new CFHonoFactory()).register(this.honoApp);
  }
  // _id!: string;

  async fetch(request: Request): Promise<Response> {
    const sthis = ensureSuperThis({
      logger: new LoggerImpl(),
      env: {
        presetEnv: new Map<string, string>(
          Array.from(Object.entries(this.env as unknown as Record<string, string>)).filter((x) => typeof x[1] === "string"),
        ),
      },
    });

    const id = sthis.nextId(12).str;

    this.env = {
      ...this.env,
      FP_EXPOSE_CTX: CFExposeCtx.create(
        {
          env: this.env,
          ctx: this.ctx,
        },
        sthis,
        id,
      ),
    };

    const uri = BuildURI.from(request.url).setParam("ctxId", id).URI();

    // Cloudflare Workers request bodies are single-read streams. To avoid the
    // "Can't read from request stream after it has been read" error, we read
    // the body here (only once) and re-inject it into a brand-new Request.
    let body: ArrayBuffer | undefined;
    // Only methods that are allowed to carry a body should attempt to read it.
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
      // Clone before reading so that any further middleware reading from the
      // original request does not throw. The clone shares a tee'd body stream
      // so we can safely consume this copy.
      const clone = request.clone();
      body = await clone.arrayBuffer();
    }

    const forwardedReq = new Request(uri.toString(), {
      method: request.method,
      headers: request.headers,
      body: body ? body : undefined,
      // Preserve other relevant init properties if needed in future
    });

    const ret = await this.honoApp.fetch(forwardedReq, this.env);
    return ret;
  }

  webSocketOpen(ws: WebSocket): void | Promise<void> {
    const { id } = ws.deserializeAttachment();
    this.env.FP_EXPOSE_CTX.get(id).ctx.wsRoom.events.onOpen(id, {} as Event, ws as CFWebSocket);
  }

  webSocketError(ws: WebSocket, error: unknown): void | Promise<void> {
    const { id } = ws.deserializeAttachment();
    this.env.FP_EXPOSE_CTX.get(id).ctx.wsRoom.events.onError(id, error as Event, ws as CFWebSocket);
  }

  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer): Promise<void> {
    const { id } = ws.deserializeAttachment();
    this.env.FP_EXPOSE_CTX.get(id).ctx.wsRoom.events.onMessage(id, { data: msg } as MessageEvent, ws as CFWebSocket);
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void | Promise<void> {
    const dat = ws.deserializeAttachment();
    this.env.FP_EXPOSE_CTX.get(dat.id).ctx.wsRoom.events.onClose(dat.id, { code, reason } as CloseEvent, ws as CFWebSocket);
  }
}
