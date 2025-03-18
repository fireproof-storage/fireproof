import { VERSION } from "@adviser/cement";
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
} from "./msg-types.js";
import { V2SerializedMetaKey } from "../../runtime/meta-key-hack.js";

/* Put Meta */
export interface ReqPutMeta extends MsgWithTenantLedger<MsgWithConnAuth> {
  readonly type: "reqPutMeta";
  readonly methodParams: MethodSignedUrlParam;
  readonly params: SignedUrlParam;
  readonly meta: V2SerializedMetaKey;
}

export interface ResPutMeta extends MsgWithTenantLedger<MsgWithConnAuth>, ResOptionalSignedUrl {
  readonly type: "resPutMeta";
  // readonly signedUrl?: string;
  readonly meta: V2SerializedMetaKey;
}

export function buildReqPutMeta(
  sthis: NextId,
  auth: AuthType,
  signedUrlParams: SignedUrlParam,
  meta: V2SerializedMetaKey,
  gwCtx: GwCtx,
): ReqPutMeta {
  return {
    auth,
    tid: sthis.nextId().str,
    type: "reqPutMeta",
    ...gwCtx,
    version: VERSION,
    methodParams: {
      method: "PUT",
      store: "meta",
    },
    params: signedUrlParams,
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
): ResPutMeta {
  return {
    meta,
    tid: req.tid,
    conn: req.conn,
    auth: req.auth,
    tenant: req.tenant,
    type: "resPutMeta",
    // key: req.key,
    version: VERSION,
  };
}

export function MsgIsResPutMeta(qs: MsgBase): qs is ResPutMeta {
  return qs.type === "resPutMeta";
}

/* Bind Meta */
export interface BindGetMeta extends MsgWithTenantLedger<MsgWithConnAuth> {
  readonly type: "bindGetMeta";
  readonly params: SignedUrlParam;
}

export function MsgIsBindGetMeta(msg: MsgBase): msg is BindGetMeta {
  return msg.type === "bindGetMeta";
}

export interface EventGetMeta extends MsgWithTenantLedger<MsgWithConnAuth>, ResOptionalSignedUrl {
  readonly type: "eventGetMeta";
  readonly meta: V2SerializedMetaKey;
}

export function buildBindGetMeta(sthis: NextId, auth: AuthType, params: SignedUrlParam, gwCtx: GwCtx): BindGetMeta {
  return {
    auth,
    tid: sthis.nextId().str,
    ...gwCtx,
    type: "bindGetMeta",
    version: VERSION,
    params,
  };
}

export function buildEventGetMeta(
  _msgCtx: MsgTypesCtx,
  req: MsgWithTenantLedger<MsgWithConnAuth<BindGetMeta>>,
  meta: V2SerializedMetaKey,
  gwCtx: GwCtx,
): EventGetMeta {
  return {
    conn: gwCtx.conn,
    tenant: req.tenant,
    auth: req.auth,
    tid: req.tid,
    meta,
    type: "eventGetMeta",
    params: req.params,
    methodParams: { method: "GET", store: "meta" },
    version: VERSION,
  };
}

export function MsgIsEventGetMeta(qs: MsgBase): qs is EventGetMeta {
  return qs.type === "eventGetMeta";
}

/* Del Meta */
export interface ReqDelMeta extends MsgWithTenantLedger<MsgWithConnAuth> {
  readonly type: "reqDelMeta";
  readonly params: SignedUrlParam;
}

export function buildReqDelMeta(sthis: NextId, auth: AuthType, signedUrlParams: SignedUrlParam, gwCtx: GwCtx): ReqDelMeta {
  return {
    auth,
    tid: sthis.nextId().str,
    tenant: gwCtx.tenant,
    conn: gwCtx.conn,
    type: "reqDelMeta",
    version: VERSION,
    params: signedUrlParams,
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
  signedUrl?: string,
): ResDelMeta {
  return {
    auth: req.auth,
    params: req.params,
    methodParams: { method: "DELETE", store: "meta" },
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
