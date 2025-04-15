import { SuperThis, ps } from "@fireproof/core";
import { MsgDispatcher } from "./msg-dispatch.js";
import { buildEventGetMeta, MsgIsResPutMeta } from "../../src/protocols/cloud/msg-types-meta.js";
import { metaMerger } from "./meta-merger/meta-merger.js";
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
type MsgWithConnAuth<T extends ps.cloud.MsgBase> = ps.cloud.MsgWithConnAuth<T>;
type BindGetMeta = ps.cloud.BindGetMeta;
type ReqDelMeta = ps.cloud.ReqDelMeta;
type ReqPutMeta = ps.cloud.ReqPutMeta;

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
      fn: (ctx, msg: MsgWithConnAuth<ReqClose>) => {
        ctx.wsRoom.removeConn(msg.conn);
        return buildResClose(msg, msg.conn);
      },
    },
    {
      match: MsgIsReqChat,
      fn: (ctx, msg: MsgWithConnAuth<ReqChat>) => {
        const conns = ctx.wsRoom.getConns(msg.conn);
        const ci = conns.map((c) => c.conn);
        for (const conn of conns) {
          if (qsidEqual(conn.conn, msg.conn)) {
            continue;
          }
          dp.send(
            {
              ...ctx,
              ws: conn.ws,
            },
            buildResChat(msg, conn.conn, `[${msg.conn.reqId}]: ${msg.message}`, ci),
          );
        }
        return buildResChat(msg, msg.conn, `ack: ${msg.message}`, ci);
      },
    },
    {
      match: MsgIsReqGetData,
      fn: (ctx, msg: MsgWithConnAuth<ReqGetData>) => {
        return buildResGetData(ctx, msg, ctx.impl);
      },
    },
    {
      match: MsgIsReqPutData,
      fn: (ctx, msg: MsgWithConnAuth<ReqPutData>) => {
        return buildResPutData(ctx, msg, ctx.impl);
      },
    },
    {
      match: MsgIsReqDelData,
      fn: (ctx, msg: MsgWithConnAuth<ReqDelData>) => {
        return buildResDelData(ctx, msg, ctx.impl);
      },
    },
    {
      match: MsgIsReqGetWAL,
      fn: (ctx, msg: MsgWithConnAuth<ReqGetWAL>) => {
        return buildResGetWAL(ctx, msg, ctx.impl);
      },
    },
    {
      match: MsgIsReqPutWAL,
      fn: (ctx, msg: MsgWithConnAuth<ReqPutWAL>) => {
        return buildResPutWAL(ctx, msg, ctx.impl);
      },
    },
    {
      match: MsgIsReqDelWAL,
      fn: (ctx, msg: MsgWithConnAuth<ReqDelWAL>) => {
        return buildResDelWAL(ctx, msg, ctx.impl);
      },
    },
    {
      match: MsgIsBindGetMeta,
      fn: (ctx, msg: MsgWithConnAuth<BindGetMeta>) => {
        return ctx.impl.handleBindGetMeta(ctx, msg);
      },
    },
    {
      match: MsgIsReqPutMeta,
      fn: async (ctx, req: MsgWithConnAuth<ReqPutMeta>) => {
        const ret = await ctx.impl.handleReqPutMeta(ctx, req);
        if (!MsgIsResPutMeta(ret)) {
          return ret;
        }
        const conns = ctx.wsRoom.getConns(req.conn);
        for (const conn of conns) {
          if (qsidEqual(conn.conn, req.conn)) {
            continue;
          }
          // pretty bad but ok for now we should be able to
          // filter by tenant and ledger on a connection level
          const res = await metaMerger(ctx).metaToSend({
            conn: conn.conn,
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
            buildEventGetMeta(
              ctx,
              req,
              res,
              {
                conn: conn.conn,
                tenant: req.tenant,
              },
              ret.signedUrl,
            ),
          );
        }
        return ret;
      },
    },
    {
      match: MsgIsReqDelMeta,
      fn: (ctx, msg: MsgWithConnAuth<ReqDelMeta>) => {
        return ctx.impl.handleReqDelMeta(ctx, msg);
      },
    },
  );
  return dp;
}
