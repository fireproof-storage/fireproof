/// <reference types="@cloudflare/workers-types" />

import { DurableObject } from "cloudflare:workers";
// import { WebSocket as CFWebSocket, ExportedHandler, Response as CFResponse } from "@cloudflare/workers-types";
import { Hono } from "hono";
import { Env } from "./env.js";
import { CFExposeCtx, CFHonoFactory, getRoomDurableObject } from "./cf-hono-server.js";

import { BuildURI, LoggerImpl } from "@adviser/cement";
import { HonoServer } from "@fireproof/cloud-backend-base";
import { ensureSuperThis } from "@fireproof/core-runtime";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  fetch: async (req, env): Promise<Response> => {
    const url = new URL(req.url);

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: CORS_HEADERS });
    }

    // Health check endpoint
    if (url.pathname === "/health" || url.pathname === "/") {
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Blob routes - direct R2 access (replaces MinIO/S3)
    if (url.pathname.startsWith("/blob/")) {
      const key = url.pathname.slice(6); // Remove "/blob/" prefix

      if (!env.FP_STORAGE) {
        return new Response("R2 storage not configured", { status: 501, headers: CORS_HEADERS });
      }

      switch (req.method) {
        case "GET": {
          const obj = await env.FP_STORAGE.get(key);
          if (!obj) {
            return new Response("Not found", { status: 404, headers: CORS_HEADERS });
          }
          return new Response(obj.body, {
            status: 200,
            headers: { ...CORS_HEADERS, "Content-Type": "application/octet-stream" },
          });
        }
        case "PUT": {
          const body = await req.arrayBuffer();
          await env.FP_STORAGE.put(key, body);
          return new Response(null, { status: 200, headers: CORS_HEADERS });
        }
        case "DELETE": {
          await env.FP_STORAGE.delete(key);
          return new Response(null, { status: 200, headers: CORS_HEADERS });
        }
        case "HEAD": {
          const obj = await env.FP_STORAGE.head(key);
          if (!obj) {
            return new Response(null, { status: 404, headers: CORS_HEADERS });
          }
          return new Response(null, {
            status: 200,
            headers: { ...CORS_HEADERS, "Content-Length": obj.size.toString(), ETag: obj.etag },
          });
        }
        default:
          return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
      }
    }

    // All other requests go to the Durable Object
    return getRoomDurableObject(env, "V1").fetch(req);
  },
} satisfies ExportedHandler<Env>;

export interface ExecSQLResult {
  readonly rowsRead: number;
  readonly rowsWritten: number;
  readonly rawResults: unknown[];
}

export class FPRoomDurableObject extends DurableObject<Env> {
  // Add the brand property
  // readonly [__DURABLE_OBJECT_BRAND]: never;
  // wsEvents?: CFWSEvents;

  readonly id = Math.random().toString(36).slice(2);

  readonly honoApp: Hono = new Hono();
  readonly honoServer: HonoServer = new HonoServer(new CFHonoFactory()).register(this.honoApp);
  // this.honoApp = new Hono();
  // this.honoServer = new HonoServer(new CFHonoFactory()).register(this.honoApp);

  // constructor(state: DurableObjectState, env: Env) {
  //   super(state, env);
  // }
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

    const ret = await this.honoApp.fetch(new Request(uri.toString(), request as unknown as Request), this.env);
    return ret;
  }

  webSocketOpen(iws: WebSocket): void | Promise<void> {
    const ws = iws as unknown as WebSocket;
    const { id } = ws.deserializeAttachment();
    this.env.FP_EXPOSE_CTX.get(id).ctx.wsRoom.events.onOpen(id, {} as Event, ws);
  }

  webSocketError(iws: WebSocket, error: unknown): void | Promise<void> {
    const ws = iws as unknown as WebSocket;
    const { id } = ws.deserializeAttachment();
    this.env.FP_EXPOSE_CTX.get(id).ctx.wsRoom.events.onError(id, error as Event, ws);
  }

  async webSocketMessage(iws: WebSocket, msg: string | ArrayBuffer): Promise<void> {
    const ws = iws as unknown as WebSocket;
    const { id } = ws.deserializeAttachment();
    this.env.FP_EXPOSE_CTX.get(id).ctx.wsRoom.events.onMessage(id, { data: msg } as globalThis.MessageEvent, ws);
  }

  webSocketClose(iws: WebSocket, code: number, reason: string): void | Promise<void> {
    const ws = iws as unknown as WebSocket;
    const dat = ws.deserializeAttachment();
    this.env.FP_EXPOSE_CTX.get(dat.id).ctx.wsRoom.events.onClose(dat.id, { code, reason } as CloseEvent, ws);
  }
}
