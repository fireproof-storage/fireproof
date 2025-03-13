import {
  MsgBase,
  MsgWithError,
  buildRes,
  NextId,
  ReqSignedUrl,
  ResSignedUrl,
  ReqSignedUrlParam,
  buildReqSignedUrl,
  GwCtx,
  MsgIsTenantLedger,
  MsgWithTenantLedger,
  MsgTypesCtx,
  MsgWithConnAuth,
} from "./msg-types.js";
import { CalculatePreSignedUrl } from "./msg-types-data.js";

export interface ReqGetWAL extends ReqSignedUrl {
  readonly type: "reqGetWAL";
}

export function MsgIsReqGetWAL(msg: MsgBase): msg is ReqGetWAL {
  return msg.type === "reqGetWAL";
}

export function buildReqGetWAL(sthis: NextId, sup: ReqSignedUrlParam, ctx: GwCtx): ReqGetWAL {
  return buildReqSignedUrl<ReqGetWAL>(sthis, "reqGetWAL", sup, ctx);
}

export interface ResGetWAL extends ResSignedUrl {
  readonly type: "resGetWAL";
  // readonly payload: Uint8Array; // transfered via JSON base64
}

export function MsgIsResGetWAL(msg: MsgBase): msg is ResGetWAL {
  return msg.type === "resGetWAL";
}

export function buildResGetWAL(
  msgCtx: MsgTypesCtx,
  req: MsgWithTenantLedger<MsgWithConnAuth<ReqGetWAL>>,
  ctx: CalculatePreSignedUrl,
): Promise<MsgWithError<ResGetWAL>> {
  return buildRes<MsgWithTenantLedger<MsgWithConnAuth<ReqGetWAL>>, ResGetWAL>(
    { method: "GET", store: "wal" },
    "resGetWAL",
    msgCtx,
    req,
    ctx,
  );
}

export interface ReqPutWAL extends Omit<ReqSignedUrl, "type"> {
  readonly type: "reqPutWAL";
  // readonly payload: Uint8Array; // transfered via JSON base64
}

export function MsgIsReqPutWAL(msg: MsgBase): msg is ReqPutWAL {
  return msg.type === "reqPutWAL";
}

export function buildReqPutWAL(sthis: NextId, sup: ReqSignedUrlParam, ctx: GwCtx): ReqPutWAL {
  return buildReqSignedUrl<ReqPutWAL>(sthis, "reqPutWAL", sup, ctx);
}

export interface ResPutWAL extends Omit<ResSignedUrl, "type"> {
  readonly type: "resPutWAL";
}

export function MsgIsResPutWAL(msg: MsgBase): msg is ResPutWAL {
  return msg.type === "resPutWAL";
}

export function buildResPutWAL(
  msgCtx: MsgTypesCtx,
  req: MsgWithTenantLedger<MsgWithConnAuth<ReqPutWAL>>,
  ctx: CalculatePreSignedUrl,
): Promise<MsgWithError<ResPutWAL>> {
  return buildRes<MsgWithTenantLedger<MsgWithConnAuth<ReqPutWAL>>, ResPutWAL>(
    { method: "PUT", store: "wal" },
    "resPutWAL",
    msgCtx,
    req,
    ctx,
  );
}

export interface ReqDelWAL extends Omit<ReqSignedUrl, "type"> {
  readonly type: "reqDelWAL";
}

export function MsgIsReqDelWAL(msg: MsgBase): msg is ReqDelWAL {
  return msg.type === "reqDelWAL";
}

export function buildReqDelWAL(sthis: NextId, sup: ReqSignedUrlParam, ctx: GwCtx): ReqDelWAL {
  return buildReqSignedUrl<ReqDelWAL>(sthis, "reqDelWAL", sup, ctx);
}

export interface ResDelWAL extends Omit<ResSignedUrl, "type"> {
  readonly type: "resDelWAL";
}

export function MsgIsResDelWAL(msg: MsgBase): msg is ResDelWAL {
  return msg.type === "resDelWAL" && MsgIsTenantLedger(msg);
}

export function buildResDelWAL(
  msgCtx: MsgTypesCtx,
  req: MsgWithTenantLedger<MsgWithConnAuth<ReqDelWAL>>,
  ctx: CalculatePreSignedUrl,
): Promise<MsgWithError<ResDelWAL>> {
  return buildRes<MsgWithTenantLedger<MsgWithConnAuth<ReqDelWAL>>, ResDelWAL>(
    { method: "DELETE", store: "wal" },
    "resDelWAL",
    msgCtx,
    req,
    ctx,
  );
}
