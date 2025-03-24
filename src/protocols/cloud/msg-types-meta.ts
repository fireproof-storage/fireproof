import {
  AuthType,
  GwCtx,
  MsgBase,
  MsgWithTenantLedger,
  NextId,
  ResOptionalSignedUrl,
  MsgTypesCtx,
  MsgWithConnAuth,
  SignedUrlParam,
  MethodSignedUrlParam,
  ResSignedUrl,
  VERSION,
  ReqSignedUrl,
  MethodSignedUrlParams,
} from "./msg-types.js";
import { V2SerializedMetaKey } from "../../runtime/meta-key-hack.js";

/* Put Meta */
export interface ReqPutMeta extends MsgWithTenantLedger<MsgWithConnAuth> {
  readonly type: "reqPutMeta";
  readonly methodParam: MethodSignedUrlParam;
  readonly urlParam: SignedUrlParam;
  readonly meta: V2SerializedMetaKey;
}

export interface ResPutMetaVal {
  readonly type: "resPutMeta";
  readonly meta: V2SerializedMetaKey;
}

export type ResPutMeta = ResPutMetaVal & ResSignedUrl & MsgWithTenantLedger<MsgWithConnAuth>;

export function buildReqPutMeta(
  sthis: NextId,
  auth: AuthType,
  signedUrlParam: SignedUrlParam,
  meta: V2SerializedMetaKey,
  gwCtx: GwCtx,
): ReqPutMeta {
  return {
    auth,
    tid: sthis.nextId().str,
    type: "reqPutMeta",
    ...gwCtx,
    version: VERSION,
    methodParam: {
      method: "PUT",
      store: "meta",
    },
    urlParam: signedUrlParam,
    meta,
  };
}

export function MsgIsReqPutMeta(msg: MsgBase): msg is ReqPutMeta {
  return msg.type === "reqPutMeta";
}

export function buildResPutMeta(
  _msgCtx: MsgTypesCtx,
  req: MsgWithTenantLedger<MsgWithConnAuth<ReqPutMeta>>,
  meta: V2SerializedMetaKey,
  signedUrl: string,
): ResPutMeta {
  return {
    meta,
    tid: req.tid,
    conn: req.conn,
    auth: req.auth,
    methodParam: req.methodParam,
    urlParam: req.urlParam,
    tenant: req.tenant,
    type: "resPutMeta",
    signedUrl,
    version: VERSION,
  };
}

export function MsgIsResPutMeta(qs: MsgBase): qs is ResPutMeta {
  return qs.type === "resPutMeta";
}

/* Bind Meta */
export interface BindGetMeta extends MsgWithTenantLedger<MsgWithConnAuth & ReqSignedUrl> {
  readonly type: "bindGetMeta";
  // readonly methodParams: MethodSignedUrlParam;
  // readonly params: SignedUrlParam;
}

export function MsgIsBindGetMeta(msg: MsgBase): msg is BindGetMeta {
  return msg.type === "bindGetMeta";
}

export interface EventGetMeta extends MsgWithTenantLedger<MsgWithConnAuth>, ResSignedUrl {
  readonly type: "eventGetMeta";
  readonly meta: V2SerializedMetaKey;
}

export function buildBindGetMeta(sthis: NextId, auth: AuthType, msp: MethodSignedUrlParams, gwCtx: GwCtx): BindGetMeta {
  return {
    auth,
    ...gwCtx,
    tid: gwCtx.tid ?? sthis.nextId().str,
    type: "bindGetMeta",
    version: VERSION,
    ...msp,
  };
}

export function buildEventGetMeta(
  _msgCtx: MsgTypesCtx,
  req: MsgWithTenantLedger<MsgWithConnAuth<ReqSignedUrl>>,
  meta: V2SerializedMetaKey,
  gwCtx: GwCtx,
  signedUrl: string,
): EventGetMeta {
  return {
    conn: gwCtx.conn,
    tenant: req.tenant,
    auth: req.auth,
    tid: req.tid,
    meta,
    signedUrl,
    type: "eventGetMeta",
    urlParam: req.urlParam,
    methodParam: { method: "GET", store: "meta" },
    version: VERSION,
  };
}

export function MsgIsEventGetMeta(qs: MsgBase): qs is EventGetMeta {
  return qs.type === "eventGetMeta";
}

/* Del Meta */
export interface ReqDelMeta extends MsgWithTenantLedger<MsgWithConnAuth> {
  readonly type: "reqDelMeta";
  readonly urlParam: SignedUrlParam;
  readonly meta?: V2SerializedMetaKey;
}

export function buildReqDelMeta(
  sthis: NextId,
  auth: AuthType,
  param: SignedUrlParam,
  gwCtx: GwCtx,
  meta?: V2SerializedMetaKey,
): ReqDelMeta {
  return {
    auth,
    tid: sthis.nextId().str,
    tenant: gwCtx.tenant,
    conn: gwCtx.conn,
    urlParam: param,
    meta,
    type: "reqDelMeta",
    version: VERSION,
    // params: signedUrlParams,
  };
}

export function MsgIsReqDelMeta(msg: MsgBase): msg is ReqDelMeta {
  return msg.type === "reqDelMeta";
}

export interface ResDelMeta extends MsgWithTenantLedger<MsgWithConnAuth>, ResOptionalSignedUrl {
  readonly type: "resDelMeta";
}

export function buildResDelMeta(
  // msgCtx: MsgTypesCtx,
  req: MsgWithTenantLedger<MsgWithConnAuth<ReqDelMeta>>,
  param: SignedUrlParam,
  signedUrl?: string,
): ResDelMeta {
  return {
    auth: req.auth,
    methodParam: { method: "DELETE", store: "meta" },
    urlParam: param,
    signedUrl,
    tid: req.tid,
    conn: req.conn,
    tenant: req.tenant,
    type: "resDelMeta",
    // key: req.key,
    version: VERSION,
  };
}

export function MsgIsResDelMeta(qs: MsgBase): qs is ResDelMeta {
  return qs.type === "resDelMeta";
}
