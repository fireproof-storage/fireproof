// / <reference types="@cloudflare/workers-types" />
// import { Logger } from "@adviser/cement";
// import { Hono } from "hono";
import { DurableObject } from "cloudflare:workers";
import { HonoServer } from "../hono-server.js";
import { Hono } from "hono";
import { Env } from "./env.js";
import { CFExposeCtx, CFHonoFactory, getRoomDurableObject } from "./cf-hono-server.js";
import { WSMessageReceive } from "hono/ws";
import { ensureSuperThis } from "@fireproof/core";
import { BuildURI, LoggerImpl } from "@adviser/cement";
// import { ExportedHandler, WebSocket } from "@cloudflare/workers-types";

export default {
  fetch: async (req, env): Promise<Response> => {
    return getRoomDurableObject(env, "V1").fetch(req);
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
  readonly onOpen: (evt: Event, ws: WebSocket) => void;
  readonly onMessage: (evt: MessageEvent<WSMessageReceive>, ws: WebSocket) => void;
  readonly onClose: (evt: CloseEvent, ws: WebSocket) => void;
  readonly onError: (evt: Event, ws: WebSocket) => void;
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

    const ret = await this.honoApp.fetch(new Request(uri.toString(), request), this.env);
    return ret;
  }

  webSocketOpen(ws: WebSocket): void | Promise<void> {
    const { id } = ws.deserializeAttachment();
    this.env.FP_EXPOSE_CTX.get(id).ctx.wsRoom.events.onOpen(id, {} as Event, ws);
  }

  webSocketError(ws: WebSocket, error: unknown): void | Promise<void> {
    const { id } = ws.deserializeAttachment();
    this.env.FP_EXPOSE_CTX.get(id).ctx.wsRoom.events.onError(id, error as Event, ws);
  }

  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer): Promise<void> {
    const { id } = ws.deserializeAttachment();
    this.env.FP_EXPOSE_CTX.get(id).ctx.wsRoom.events.onMessage(id, { data: msg } as MessageEvent, ws);
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void | Promise<void> {
    const { id } = ws.deserializeAttachment();
    this.env.FP_EXPOSE_CTX.get(id).ctx.wsRoom.events.onClose(id, { code, reason } as CloseEvent, ws);
  }
}
