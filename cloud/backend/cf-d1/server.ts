/// <reference types="@cloudflare/workers-types" />

import { DurableObject } from "cloudflare:workers";
// import { WebSocket as CFWebSocket, ExportedHandler, Response as CFResponse } from "@cloudflare/workers-types";
import { Hono } from "hono";
import { Env } from "./env.js";
import { CFExposeCtx, CFHonoFactory, getRoomDurableObject } from "./cf-hono-server.js";

import { BuildURI, LoggerImpl } from "@adviser/cement";
import { HonoServer } from "@fireproof/cloud-backend-base";
import { ensureSuperThis } from "@fireproof/core-runtime";

export default {
  fetch: async (req, env): Promise<Response> => {
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
