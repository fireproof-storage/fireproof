/// <reference types="@cloudflare/workers-types" />

import { DurableObject } from "cloudflare:workers";
import { LoggerImpl } from "@adviser/cement";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { Env } from "./env.js";
import { QSSendProvider } from "./qs-send-provider.js";
import { qsDbEvento } from "./qs-db-evento.js";

export class QSDBStore extends DurableObject<Env> {
  private readonly sthis;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.sthis = ensureSuperThis({ logger: new LoggerImpl() });
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS docs (
        id         TEXT PRIMARY KEY,
        cid        TEXT NOT NULL,
        data       BLOB NOT NULL,
        synced     INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer): Promise<void> {
    const sendProvider = new QSSendProvider(ws, this.sthis);
    if (typeof msg === "string") {
      console.log("[QSDBStore] rejected string message");
      await sendProvider.send({} as never, { type: "QSResErr", tid: "unknown", arg: 0, error: "binary messages only" });
      return;
    }
    console.log("[QSDBStore] dispatching binary message, bytes:", (msg as ArrayBuffer).byteLength);
    await qsDbEvento().trigger({ ctx: this, request: msg as ArrayBuffer, send: sendProvider });
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    ws.close(code, reason);
  }

  webSocketError(ws: WebSocket, error: unknown): void {
    ws.close(1011, String(error));
  }
}
