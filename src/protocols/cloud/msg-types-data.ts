import { Result, URI } from "@adviser/cement";
import {
  ReqSignedUrl,
  NextId,
  MsgBase,
  ResSignedUrl,
  MsgWithError,
  buildRes,
  ReqSignedUrlParam,
  buildReqSignedUrl,
  GwCtx,
  MsgIsTenantLedger,
  MsgTypesCtx,
  PreSignedMsg,
  MsgWithConn,
} from "./msg-types.js";

export interface ReqGetData extends ReqSignedUrl {
  readonly type: "reqGetData";
}

export function buildReqGetData(sthis: NextId, sup: ReqSignedUrlParam, ctx: GwCtx): ReqGetData {
  return buildReqSignedUrl<ReqGetData>(sthis, "reqGetData", sup, ctx);
}

export function MsgIsReqGetData(msg: MsgBase): msg is ReqGetData {
  return msg.type === "reqGetData";
}

export interface ResGetData extends ResSignedUrl {
  readonly type: "resGetData";
  // readonly payload: Uint8Array; // transfered via JSON base64
}

export function MsgIsResGetData(msg: MsgBase): msg is ResGetData {
  return msg.type === "resGetData" && MsgIsTenantLedger(msg);
}

export interface CalculatePreSignedUrl {
  calculatePreSignedUrl(ctx: MsgTypesCtx, p: PreSignedMsg): Promise<Result<URI>>;
}

export function buildResGetData(
  msgCtx: MsgTypesCtx,
  req: MsgWithConn<ReqGetData>,
  ctx: CalculatePreSignedUrl,
): Promise<MsgWithError<ResGetData>> {
  return buildRes<MsgWithConn<ReqGetData>, ResGetData>(
    { method: "GET", store: req.methodParam.store },
    "resGetData",
    msgCtx,
    req,
    ctx,
  );
}

export interface ReqPutData extends ReqSignedUrl {
  readonly type: "reqPutData";
  // readonly payload: Uint8Array; // transfered via JSON base64
}

export function MsgIsReqPutData(msg: MsgBase): msg is ReqPutData {
  return msg.type === "reqPutData";
}

export function buildReqPutData(sthis: NextId, sup: ReqSignedUrlParam, ctx: GwCtx): ReqPutData {
  return buildReqSignedUrl<ReqPutData>(sthis, "reqPutData", sup, ctx);
}

export interface ResPutData extends ResSignedUrl {
  readonly type: "resPutData";
}

export function MsgIsResPutData(msg: MsgBase): msg is ResPutData {
  return msg.type === "resPutData";
}

export function buildResPutData(
  msgCtx: MsgTypesCtx,
  req: MsgWithConn<ReqPutData>,
  ctx: CalculatePreSignedUrl,
): Promise<MsgWithError<ResPutData>> {
  return buildRes<MsgWithConn<ReqPutData>, ResPutData>(
    { method: "PUT", store: req.methodParam.store },
    "resPutData",
    msgCtx,
    req,
    ctx,
  );
}

export interface ReqDelData extends ReqSignedUrl {
  readonly type: "reqDelData";
}

export function MsgIsReqDelData(msg: MsgBase): msg is ReqDelData {
  return msg.type === "reqDelData";
}

export function buildReqDelData(sthis: NextId, sup: ReqSignedUrlParam, ctx: GwCtx): ReqDelData {
  return buildReqSignedUrl<ReqDelData>(sthis, "reqDelData", sup, ctx);
}

export interface ResDelData extends ResSignedUrl {
  readonly type: "resDelData";
}

export function MsgIsResDelData(msg: MsgBase): msg is ResDelData {
  return msg.type === "resDelData";
}

export function buildResDelData(
  msgCtx: MsgTypesCtx,
  req: MsgWithConn<ReqDelData>,
  ctx: CalculatePreSignedUrl,
): Promise<MsgWithError<ResDelData>> {
  return buildRes<MsgWithConn<ReqDelData>, ResDelData>(
    { method: "DELETE", store: req.methodParam.store },
    "resDelData",
    msgCtx,
    req,
    ctx,
  );
}
