import { SuperThis, ps } from "@fireproof/core";
import { MsgDispatcher, MsgDispatcherCtx } from "./msg-dispatch.js";
import { metaMerger } from "./meta-merger/meta-merger.js";
import { Promisable } from "@adviser/cement";
import { TenantLedger } from "../../src/protocols/cloud/msg-types.js";
// import { isAuthTypeFPCloud, MsgBase, MsgIsTenantLedger } from "../../src/protocols/cloud/msg-types.js";
// import { WSRoom } from "./ws-room.js";

const {
  MsgIsReqGetData,
  buildResGetData,
  MsgIsReqPutData,
  MsgIsReqDelData,
  buildResDelData,
  buildResPutData,
  MsgIsReqDelWAL,
  MsgIsReqGetWAL,
  MsgIsReqPutWAL,
  buildResDelWAL,
  buildResGetWAL,
  buildResPutWAL,
  MsgIsReqGestalt,
  buildResGestalt,
  MsgIsReqOpen,
  buildErrorMsg,
  buildResOpen,
  buildResChat,
  MsgIsReqChat,
  qsidEqual,
  MsgIsReqClose,
  buildResClose,
  MsgIsBindGetMeta,
  MsgIsReqDelMeta,
  MsgIsReqPutMeta,
} = ps.cloud;

type ReqGetData = ps.cloud.ReqGetData;
type ReqPutData = ps.cloud.ReqPutData;
type ReqDelData = ps.cloud.ReqDelData;
type ReqDelWAL = ps.cloud.ReqDelWAL;
type ReqGetWAL = ps.cloud.ReqGetWAL;
type ReqPutWAL = ps.cloud.ReqPutWAL;
type ReqGestalt = ps.cloud.ReqGestalt;
type ReqChat = ps.cloud.ReqChat;
type ReqClose = ps.cloud.ReqClose;
type MsgWithConn<T extends ps.cloud.MsgBase> = ps.cloud.MsgWithConn<T>;
type BindGetMeta = ps.cloud.BindGetMeta;
type ReqDelMeta = ps.cloud.ReqDelMeta;
type ReqPutMeta = ps.cloud.ReqPutMeta;

// export type MsgWithConnAuthTendantLedger<T extends ps.cloud.MsgBase> = MsgWithConnAuth<T> & {
//   readonly tenantLedger: {
//     readonly tenant: string;
//     readonly ledger: string;
//   };
// }

export function ensureTendantLedger<T extends ps.cloud.MsgBase>(
  fn: (
    ctx: MsgDispatcherCtx,
    msg: ps.cloud.MsgWithOptionalTenantLedger<MsgWithConn<T>>,
  ) => Promisable<ps.cloud.MsgWithError<ps.cloud.MsgBase>>,
  // right: "read" | "write" = "write"
): (ctx: MsgDispatcherCtx, msg: MsgWithConn<T>) => Promisable<ps.cloud.MsgWithError<ps.cloud.MsgBase>> {
  return async (ctx, msg) => {
    if (!ps.cloud.isAuthTypeFPCloud(msg.auth)) {
      return buildErrorMsg(ctx, msg, new Error("ensureTendantLedger: needs auth with claim"));
    }
    const optionalTenantLedger = msg as ps.cloud.MsgWithOptionalTenantLedger<MsgWithConn<T>>;
    const tl = {
      tenant: optionalTenantLedger.tenant?.tenant ?? msg.auth.params.claim.selected.tenant,
      ledger: optionalTenantLedger.tenant?.ledger ?? msg.auth.params.claim.selected.ledger,
    } satisfies TenantLedger;
    const tlMsg = { ...msg, auth: msg.auth, tenant: tl };

    if (!tlMsg.auth.params.claim.tenants.map((i) => i.id).includes(tl.tenant)) {
      return buildErrorMsg(
        ctx,
        msg,
        new Error(`ensureTendantLedger: missing tenant: ${tlMsg.tenant.tenant}:${msg.auth.params.claim.tenants.map((i) => i.id)}`),
      );
    }
    if (!msg.auth.params.claim.ledgers.map((i) => i.id).includes(tlMsg.tenant.ledger)) {
      return buildErrorMsg(
        ctx,
        msg,
        new Error(`ensureTendantLedger: missing ledger: ${tlMsg.tenant.ledger}:${msg.auth.params.claim.ledgers.map((i) => i.id)}`),
      );
    }
    /* need some read and write check here */
    const ret = await fn(ctx, msg);
    return ret;
  };
}

export function buildMsgDispatcher(_sthis: SuperThis /*, gestalt: Gestalt, ende: EnDeCoder, wsRoom: WSRoom*/): MsgDispatcher {
  const dp = MsgDispatcher.new(_sthis /*, gestalt, ende, wsRoom*/);
  dp.registerMsg(
    {
      match: MsgIsReqGestalt,
      isNotConn: true,
      fn: (ctx, msg: ReqGestalt) => {
        const resGestalt = buildResGestalt(msg, ctx.gestalt, msg.auth);
        // console.log(">>>>>>>>>>>>>>", resGestalt);
        return resGestalt;
      },
    },
    {
      match: MsgIsReqOpen,
      isNotConn: true,
      fn: (ctx, msg) => {
        if (!MsgIsReqOpen(msg)) {
          return buildErrorMsg(ctx, msg, new Error("missing connection"));
        }
        if (ctx.wsRoom.isConnected(msg)) {
          return buildResOpen(ctx.sthis, msg, msg.conn.resId);
        }
        // const resId = sthis.nextId(12).str;
        const resId = ctx.ws.id;
        const resOpen = buildResOpen(ctx.sthis, msg, resId);
        ctx.wsRoom.addConn(ctx.ws, resOpen.conn);
        return resOpen;
      },
    },
    {
      match: MsgIsReqClose,
      fn: (ctx, msg: MsgWithConn<ReqClose>) => {
        ctx.wsRoom.removeConn(msg.conn);
        return buildResClose(msg, msg.conn);
      },
    },
    {
      match: MsgIsReqChat,
      fn: (ctx, msg: MsgWithConn<ReqChat>) => {
        const connItems = ctx.wsRoom.getConns(msg.conn);
        const ci = connItems.map((i) => i.conns).flat();
        // console.log("ReqChat", msg.conn, connItems.length);
        // if (!ci) {
        //   return buildErrorMsg(ctx, msg, new Error("missing connection in chat"));
        // }
        for (const item of connItems) {
          for (const conn of item.conns) {
            if (qsidEqual(conn, msg.conn)) {
              continue;
            }
            if (msg.message.startsWith("/ping")) {
              continue;
            }
            // console.log("me", msg.message);
            if (msg.message.startsWith("/close-connection")) {
              setTimeout(() => {
                item.ws.close();
                ctx.wsRoom.removeConn(...item.conns);
              }, 50);
            }
            //}
            dp.send(
              {
                ...ctx,
                ws: item.ws,
              },
              buildResChat(msg, conn, `[${msg.conn.reqId}]: ${msg.message}`, ci),
            );
          }
        }
        return buildResChat(msg, msg.conn, `ack: ${msg.message}`, ci);
      },
    },
    {
      match: MsgIsReqGetData,
      fn: ensureTendantLedger<ReqGetData>((ctx, msg) => {
        return buildResGetData(ctx, msg, ctx.impl);
      }),
    },
    {
      match: MsgIsReqPutData,
      fn: ensureTendantLedger<ReqPutData>((ctx, msg) => {
        return buildResPutData(ctx, msg, ctx.impl);
      }),
    },
    {
      match: MsgIsReqDelData,
      fn: ensureTendantLedger<ReqDelData>((ctx, msg) => {
        return buildResDelData(ctx, msg, ctx.impl);
      }),
    },
    {
      match: MsgIsReqGetWAL,
      fn: ensureTendantLedger<ReqGetWAL>((ctx, msg) => {
        return buildResGetWAL(ctx, msg, ctx.impl);
      }),
    },
    {
      match: MsgIsReqPutWAL,
      fn: ensureTendantLedger<ReqPutWAL>((ctx, msg) => {
        return buildResPutWAL(ctx, msg, ctx.impl);
      }),
    },
    {
      match: MsgIsReqDelWAL,
      fn: ensureTendantLedger<ReqDelWAL>((ctx, msg) => {
        return buildResDelWAL(ctx, msg, ctx.impl);
      }),
    },
    {
      match: MsgIsBindGetMeta,
      fn: ensureTendantLedger<BindGetMeta>((ctx, msg) => {
        return ctx.impl.handleBindGetMeta(ctx, msg);
      }),
    },
    {
      match: MsgIsReqPutMeta,
      fn: ensureTendantLedger<ReqPutMeta>(async (ctx, req) => {
        const ret = await ctx.impl.handleReqPutMeta(ctx, req);
        if (!ps.cloud.MsgIsResPutMeta(ret)) {
          return ret;
        }
        const conns = ctx.wsRoom.getConns(req.conn);
        for (const conn of conns) {
          const myConn = conn.conns.find((i) => qsidEqual(i, req.conn));
          if (!myConn) {
            continue;
          }
          // pretty bad but ok for now we should be able to
          // filter by tenant and ledger on a connection level
          const res = await metaMerger(ctx).metaToSend({
            conn: myConn,
            tenant: req.tenant,
          });
          if (res.metas.length === 0) {
            continue;
          }
          dp.send(
            {
              ...ctx,
              ws: conn.ws,
            },
            ps.cloud.buildEventGetMeta(
              ctx,
              req,
              res,
              {
                conn: myConn,
                tenant: req.tenant,
              },
              ret.signedUrl,
            ),
          );
        }
        return ret;
      }),
    },
    {
      match: MsgIsReqDelMeta,
      fn: ensureTendantLedger<ReqDelMeta>((ctx, msg) => {
        return ctx.impl.handleReqDelMeta(ctx, msg);
      }),
    },
  );
  return dp;
}
