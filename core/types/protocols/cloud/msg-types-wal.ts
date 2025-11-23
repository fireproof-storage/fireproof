import {
  MsgBase,
  MsgWithError,
  buildRes,
  NextId,
  ReqSignedUrlParam,
  buildReqSignedUrl,
  GwCtx,
  MsgIsTenantLedger,
  MsgWithTenantLedger,
  MsgTypesCtx,
  MsgWithConn,
  ResSignedUrlSchema,
} from "./msg-types.js";
import { CalculatePreSignedUrl } from "./msg-types-data.js";
import { z } from "zod";

export function MsgIsReqGetWAL(msg: MsgBase): msg is ReqGetWAL {
  return msg.type === "reqGetWAL";
}

export function buildReqGetWAL(sthis: NextId, sup: ReqSignedUrlParam, ctx: GwCtx): ReqGetWAL {
  return buildReqSignedUrl<ReqGetWAL>(sthis, "reqGetWAL", sup, ctx);
}

export function MsgIsResGetWAL(msg: MsgBase): msg is ResGetWAL {
  return msg.type === "resGetWAL";
}

export function buildResGetWAL(
  msgCtx: MsgTypesCtx,
  req: MsgWithTenantLedger<MsgWithConn<ReqGetWAL>>,
  ctx: CalculatePreSignedUrl,
): Promise<MsgWithError<ResGetWAL>> {
  return buildRes<MsgWithTenantLedger<MsgWithConn<ReqGetWAL>>, ResGetWAL>(
    { method: "GET", store: "wal" },
    "resGetWAL",
    msgCtx,
    req,
    ctx,
  );
}

export function MsgIsReqPutWAL(msg: MsgBase): msg is ReqPutWAL {
  return msg.type === "reqPutWAL";
}

export function buildReqPutWAL(sthis: NextId, sup: ReqSignedUrlParam, ctx: GwCtx): ReqPutWAL {
  return buildReqSignedUrl<ReqPutWAL>(sthis, "reqPutWAL", sup, ctx);
}

export function MsgIsResPutWAL(msg: MsgBase): msg is ResPutWAL {
  return msg.type === "resPutWAL";
}

export function buildResPutWAL(
  msgCtx: MsgTypesCtx,
  req: MsgWithTenantLedger<MsgWithConn<ReqPutWAL>>,
  ctx: CalculatePreSignedUrl,
): Promise<MsgWithError<ResPutWAL>> {
  return buildRes<MsgWithTenantLedger<MsgWithConn<ReqPutWAL>>, ResPutWAL>(
    { method: "PUT", store: "wal" },
    "resPutWAL",
    msgCtx,
    req,
    ctx,
  );
}

export function MsgIsReqDelWAL(msg: MsgBase): msg is ReqDelWAL {
  return msg.type === "reqDelWAL";
}

export function buildReqDelWAL(sthis: NextId, sup: ReqSignedUrlParam, ctx: GwCtx): ReqDelWAL {
  return buildReqSignedUrl<ReqDelWAL>(sthis, "reqDelWAL", sup, ctx);
}

export function MsgIsResDelWAL(msg: MsgBase): msg is ResDelWAL {
  return msg.type === "resDelWAL" && MsgIsTenantLedger(msg);
}

export function buildResDelWAL(
  msgCtx: MsgTypesCtx,
  req: MsgWithTenantLedger<MsgWithConn<ReqDelWAL>>,
  ctx: CalculatePreSignedUrl,
): Promise<MsgWithError<ResDelWAL>> {
  return buildRes<MsgWithTenantLedger<MsgWithConn<ReqDelWAL>>, ResDelWAL>(
    { method: "DELETE", store: "wal" },
    "resDelWAL",
    msgCtx,
    req,
    ctx,
  );
}

// ============================================================================
// Zod Schemas for WAL Messages
// ============================================================================

// ReqGetWAL and ResGetWAL
export const ReqGetWALSchema = ResSignedUrlSchema.extend({
  type: z.literal("reqGetWAL"),
});

export type ReqGetWAL = z.infer<typeof ReqGetWALSchema>;

export const ResGetWALSchema = ResSignedUrlSchema.extend({
  type: z.literal("resGetWAL"),
});

export type ResGetWAL = z.infer<typeof ResGetWALSchema>;

// ReqPutWAL and ResPutWAL
export const ReqPutWALSchema = ResSignedUrlSchema.extend({
  type: z.literal("reqPutWAL"),
});

export type ReqPutWAL = z.infer<typeof ReqPutWALSchema>;

export const ResPutWALSchema = ResSignedUrlSchema.extend({
  type: z.literal("resPutWAL"),
});

export type ResPutWAL = z.infer<typeof ResPutWALSchema>;

// ReqDelWAL and ResDelWAL
export const ReqDelWALSchema = ResSignedUrlSchema.extend({
  type: z.literal("reqDelWAL"),
});

export type ReqDelWAL = z.infer<typeof ReqDelWALSchema>;

export const ResDelWALSchema = ResSignedUrlSchema.extend({
  type: z.literal("resDelWAL"),
});

export type ResDelWAL = z.infer<typeof ResDelWALSchema>;
