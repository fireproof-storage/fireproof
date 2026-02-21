/// <reference types="@cloudflare/workers-types" />

import { Lazy, Evento, EventoResult, EventoType, LoggerImpl, Result, Option } from "@adviser/cement";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { isQSReqGet, isQSReqPut, isQSReqQuery, QSResErr, QSEvtSubscribe } from "@fireproof/cloud-quick-silver-types";
import type { QSReqGet, QSReqPut, QSReqQuery } from "@fireproof/cloud-quick-silver-types";
import { QSCborEventoEnDecoder } from "./qs-encoder.js";

// Minimal interface to avoid circular import with qs-db-store.ts
interface QSDbDO {
  readonly ctx: { readonly storage: DurableObjectStorage };
}

function handlerSql(ctx: { ctx: unknown }): SqlStorage {
  return (ctx.ctx as unknown as QSDbDO).ctx.storage.sql;
}

export const qsDbEvento = Lazy(() => {
  const sthis = ensureSuperThis({ logger: new LoggerImpl() });
  const evento = new Evento<ArrayBuffer, string>(new QSCborEventoEnDecoder(sthis));

  evento.push(
    {
      hash: "qs-req-put",
      validate: async (ctx) => {
        if (isQSReqPut(ctx.enRequest)) return Result.Ok(Option.Some(ctx.enRequest as QSReqPut));
        return Result.Ok(Option.None());
      },
      handle: async (ctx) => {
        const req = ctx.validated as QSReqPut;
        const sql = handlerSql(ctx);
        sql.exec(
          `INSERT INTO docs (id, cid, data) VALUES (?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET cid = excluded.cid, data = excluded.data`,
          req.key,
          req.key,
          req.data,
        );
        await ctx.send.send(ctx, { type: "QSResPut", tid: req.tid, arg: req.arg, key: req.key });
        await ctx.send.send(ctx, {
          type: "QSEvtSubscribe",
          tid: req.tid,
          msg: { key: req.key, data: req.data },
        } satisfies QSEvtSubscribe);
        return Result.Ok(EventoResult.Continue);
      },
    },
    {
      hash: "qs-req-get",
      validate: async (ctx) => {
        if (isQSReqGet(ctx.enRequest)) return Result.Ok(Option.Some(ctx.enRequest as QSReqGet));
        return Result.Ok(Option.None());
      },
      handle: async (ctx) => {
        const req = ctx.validated as QSReqGet;
        const sql = handlerSql(ctx);
        const rows = [
          ...sql.exec<{ id: string; cid: string; data: Uint8Array }>(`SELECT id, cid, data FROM docs WHERE id = ?`, req.key),
        ];
        if (!rows.length) {
          await ctx.send.send(ctx, { type: "QSResGetNotFound", tid: req.tid, arg: req.arg, key: req.key });
        } else {
          const row = rows[0];
          await ctx.send.send(ctx, { type: "QSResGet", tid: req.tid, arg: req.arg, key: row.id, data: row.data });
        }
        return Result.Ok(EventoResult.Continue);
      },
    },
    {
      hash: "qs-req-query",
      validate: async (ctx) => {
        if (isQSReqQuery(ctx.enRequest)) return Result.Ok(Option.Some(ctx.enRequest as QSReqQuery));
        return Result.Ok(Option.None());
      },
      handle: async (ctx) => {
        const req = ctx.validated as QSReqQuery;
        const sql = handlerSql(ctx);
        await ctx.send.send(ctx, { type: "QSResQueryBegin", tid: req.tid, arg: req.arg });
        const cursor = sql.exec<{ id: string; cid: string; data: Uint8Array; synced: number }>(
          `SELECT id, cid, data, synced FROM docs`,
        );
        let rowNr = 0;
        for (const row of cursor) {
          await ctx.send.send(ctx, {
            type: "QSResQueryRow",
            tid: req.tid,
            arg: req.arg,
            rowNr: rowNr++,
            row: { _: { id: row.id, cid: row.cid, synced: row.synced }, payload: row.data },
          });
        }
        await ctx.send.send(ctx, { type: "QSResQueryEnd", tid: req.tid, arg: req.arg, rows: rowNr });
        return Result.Ok(EventoResult.Continue);
      },
    },
    {
      type: EventoType.WildCard,
      hash: "qs-unknown",
      handle: async (ctx) => {
        await ctx.send.send(ctx, {
          type: "QSResErr",
          tid: "unknown",
          arg: 0,
          error: `unknown request: ${JSON.stringify(ctx.enRequest)}`,
        } satisfies QSResErr);
        return Result.Ok(EventoResult.Continue);
      },
    },
    {
      type: EventoType.Error,
      hash: "qs-error",
      handle: async (ctx) => {
        await ctx.send.send(ctx, {
          type: "QSResErr",
          tid: "unknown",
          arg: 0,
          error: ctx.error?.message ?? "internal error",
        } satisfies QSResErr);
        return Result.Ok(EventoResult.Continue);
      },
    },
  );

  return evento;
});
