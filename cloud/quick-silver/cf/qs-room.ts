/// <reference types="@cloudflare/workers-types" />

import { DurableObject } from "cloudflare:workers";
import { LRUMap, LoggerImpl } from "@adviser/cement";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { Env } from "./env.js";
import {
  isQSReqGet, isQSReqPut, isQSReqQuery,
  isQSReqRegisterSubscribe, isQSReqUnregisterSubscribe,
  isQSEvtSubscribe,
  QSResErr, QSResRegisterSubscribe,
} from "@fireproof/cloud-quick-silver-types";
import type { QSReqRegisterSubscribe } from "@fireproof/cloud-quick-silver-types";
import { QSSendProvider } from "./qs-send-provider.js";

// Stored as ws.serializeAttachment — survives DO hibernation
interface WsSubscription {
  readonly db: string;
  readonly tid: string;
}

export class QSRoom extends DurableObject<Env> {
  private readonly sthis;
  private readonly stores = new LRUMap<string, WebSocket>({ maxEntries: 64 });

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.sthis = ensureSuperThis({ logger: new LoggerImpl() });
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    console.log("[QSRoom] new websocket connection accepted");
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer): Promise<void> {
    const sendProvider = new QSSendProvider(ws, this.sthis);
    if (typeof msg === "string") {
      console.log("[QSRoom] rejected string message");
      await sendProvider.send({} as never, { type: "QSResErr", tid: "unknown", arg: 0, error: "binary messages only" } satisfies QSResErr);
      return;
    }
    const decoded = this.sthis.ende.cbor.decodeUint8<unknown>(new Uint8Array(msg as ArrayBuffer));
    if (decoded.isErr()) {
      console.log("[QSRoom] rejected invalid cbor:", decoded.Err());
      await sendProvider.send({} as never, { type: "QSResErr", tid: "unknown", arg: 0, error: "invalid cbor" } satisfies QSResErr);
      return;
    }
    const parsed = decoded.Ok();

    if (isQSReqRegisterSubscribe(parsed)) {
      console.log("[QSRoom] register subscribe tid:", parsed.tid, "db:", parsed.db);
      this.registerSubscription(ws, parsed.db, parsed.tid);
      await sendProvider.send({} as never, { type: "QSResRegisterSubscribe", tid: parsed.tid, arg: parsed.arg, db: parsed.db } satisfies QSResRegisterSubscribe);
      return;
    }

    if (isQSReqUnregisterSubscribe(parsed)) {
      console.log("[QSRoom] unregister subscribe tid:", parsed.tid, "db:", parsed.db);
      this.unregisterSubscription(ws, parsed.tid);
      return;
    }

    if (!isQSReqGet(parsed) && !isQSReqPut(parsed) && !isQSReqQuery(parsed)) {
      console.log("[QSRoom] rejected invalid request:", parsed);
      await sendProvider.send({} as never, { type: "QSResErr", tid: "unknown", arg: 0, error: "invalid request" } satisfies QSResErr);
      return;
    }
    console.log("[QSRoom] routing", parsed.type, "tid:", parsed.tid, "db:", parsed.db);
    const storeWs = await this.getStoreWs(parsed.db, ws);
    try {
      storeWs.send(msg as ArrayBuffer);
    } catch (e) {
      console.log("[QSRoom] send to store failed (client may have disconnected):", e);
    }
  }

  private registerSubscription(ws: WebSocket, db: string, tid: string): void {
    const current: WsSubscription[] = ws.deserializeAttachment() ?? [];
    current.push({ db, tid });
    ws.serializeAttachment(current);
  }

  private unregisterSubscription(ws: WebSocket, tid: string): void {
    const current: WsSubscription[] = ws.deserializeAttachment() ?? [];
    ws.serializeAttachment(current.filter((s) => s.tid !== tid));
  }

  private dispatchSubscribeEvent(db: string, msg: unknown): void {
    const allWs = this.ctx.getWebSockets();
    console.log("[QSRoom] QSEvtSubscribe → checking", allWs.length, "websockets for db:", db);
    for (const subWs of allWs) {
      const subs: WsSubscription[] = subWs.deserializeAttachment() ?? [];
      for (const sub of subs) {
        if (sub.db !== db) continue;
        try {
          subWs.send(this.sthis.ende.cbor.encodeToUint8({ ...msg as object, tid: sub.tid }));
        } catch (e) {
          console.log("[QSRoom] failed to notify subscriber tid:", sub.tid, e);
        }
      }
    }
  }

  private async getStoreWs(db: string, clientWs: WebSocket): Promise<WebSocket> {
    return (await this.stores.getSet(db, async () => {
      const id = this.env.QS_DB_STORE.idFromName(db);
      const stub = this.env.QS_DB_STORE.get(id);
      const res = await stub.fetch("https://internal/ws", {
        headers: { Upgrade: "websocket" },
      });
      const storeWs = res.webSocket!;
      storeWs.accept();
      storeWs.addEventListener("message", (evt) => {
        const decoded = this.sthis.ende.cbor.decodeUint8<unknown>(new Uint8Array(evt.data as ArrayBuffer));
        if (decoded.isErr()) return;
        const msg = decoded.Ok();
        if (isQSEvtSubscribe(msg)) {
          this.dispatchSubscribeEvent(db, msg);
        } else {
          clientWs.send(evt.data);
        }
      });
      return storeWs;
    }))!;
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    // 1006 is synthesized by the runtime for abnormal drops — not a valid close() code
    const safeCode = code === 1006 ? 1000 : code;
    console.log("[QSRoom] websocket closed:", code, reason);
    this.stores.forEach((storeWs) => {
      try { storeWs.close(safeCode, reason); } catch { /* already closed */ }
    });
    this.stores.clear();
    try { ws.close(safeCode, reason); } catch { /* already closed */ }
  }

  webSocketError(ws: WebSocket, error: unknown): void {
    console.log("[QSRoom] websocket error:", error);
    ws.close(1011, String(error));
  }
}
