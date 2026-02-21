/// <reference types="@cloudflare/workers-types" />

import { Lazy, Evento, EventoResult, EventoType, LoggerImpl, Result, Option } from "@adviser/cement";
import { ensureSuperThis } from "@fireproof/core-runtime";
import {
  isQSReqGet, isQSReqPut, isQSReqQuery,
  isQSReqRegisterSubscribe, isQSReqUnregisterSubscribe,
  QSResErr, QSResRegisterSubscribe,
} from "@fireproof/cloud-quick-silver-types";
import type {
  QSReqGet, QSReqPut, QSReqQuery,
  QSReqRegisterSubscribe, QSReqUnregisterSubscribe,
} from "@fireproof/cloud-quick-silver-types";
import { QSCborEventoEnDecoder } from "./qs-encoder.js";
import type { QSSendProvider } from "./qs-send-provider.js";

// Minimal interface to avoid circular import with qs-room.ts
export interface QSRoomDO {
  getStoreWs(db: string, clientWs: WebSocket): Promise<WebSocket>;
  registerSubscription(ws: WebSocket, db: string, tid: string): void;
  unregisterSubscription(ws: WebSocket, tid: string): void;
}

function room(ctx: { ctx: unknown }): QSRoomDO {
  return ctx.ctx as QSRoomDO;
}

function clientWs(ctx: { send: unknown }): WebSocket {
  return ((ctx.send as { provider: QSSendProvider }).provider).ws;
}

export const qsRoomEvento = Lazy(() => {
  const sthis = ensureSuperThis({ logger: new LoggerImpl() });
  const evento = new Evento<ArrayBuffer, string>(new QSCborEventoEnDecoder(sthis));

  evento.push(
    {
      hash: "qs-req-register-subscribe",
      validate: async (ctx) => {
        if (isQSReqRegisterSubscribe(ctx.enRequest)) return Result.Ok(Option.Some(ctx.enRequest as QSReqRegisterSubscribe));
        return Result.Ok(Option.None());
      },
      handle: async (ctx) => {
        const req = ctx.validated as QSReqRegisterSubscribe;
        console.log("[QSRoom] register subscribe tid:", req.tid, "db:", req.db);
        room(ctx).registerSubscription(clientWs(ctx), req.db, req.tid);
        await ctx.send.send(ctx, { type: "QSResRegisterSubscribe", tid: req.tid, arg: req.arg, db: req.db } satisfies QSResRegisterSubscribe);
        return Result.Ok(EventoResult.Continue);
      },
    },
    {
      hash: "qs-req-unregister-subscribe",
      validate: async (ctx) => {
        if (isQSReqUnregisterSubscribe(ctx.enRequest)) return Result.Ok(Option.Some(ctx.enRequest as QSReqUnregisterSubscribe));
        return Result.Ok(Option.None());
      },
      handle: async (ctx) => {
        const req = ctx.validated as QSReqUnregisterSubscribe;
        console.log("[QSRoom] unregister subscribe tid:", req.tid, "db:", req.db);
        room(ctx).unregisterSubscription(clientWs(ctx), req.tid);
        return Result.Ok(EventoResult.Continue);
      },
    },
    {
      hash: "qs-req-forward",
      validate: async (ctx) => {
        const p = ctx.enRequest;
        if (isQSReqGet(p) || isQSReqPut(p) || isQSReqQuery(p)) return Result.Ok(Option.Some(p as QSReqGet | QSReqPut | QSReqQuery));
        return Result.Ok(Option.None());
      },
      handle: async (ctx) => {
        const req = ctx.validated as QSReqGet | QSReqPut | QSReqQuery;
        console.log("[QSRoom] routing", req.type, "tid:", req.tid, "db:", req.db);
        const storeWs = await room(ctx).getStoreWs(req.db, clientWs(ctx));
        try {
          storeWs.send(ctx.request);
        } catch (e) {
          console.log("[QSRoom] send to store failed (client may have disconnected):", e);
        }
        return Result.Ok(EventoResult.Continue);
      },
    },
    {
      type: EventoType.WildCard,
      hash: "qs-room-unknown",
      handle: async (ctx) => {
        await ctx.send.send(ctx, {
          type: "QSResErr", tid: "unknown", arg: 0, error: `unknown request: ${JSON.stringify(ctx.enRequest)}`,
        } satisfies QSResErr);
        return Result.Ok(EventoResult.Continue);
      },
    },
    {
      type: EventoType.Error,
      hash: "qs-room-error",
      handle: async (ctx) => {
        await ctx.send.send(ctx, {
          type: "QSResErr", tid: "unknown", arg: 0, error: ctx.error?.message ?? "internal error",
        } satisfies QSResErr);
        return Result.Ok(EventoResult.Continue);
      },
    },
  );

  return evento;
});
