import {
  AuthType,
  GwCtx,
  MsgBase,
  MsgWithTenantLedger,
  NextId,
  MsgTypesCtx,
  SignedUrlParam,
  VERSION,
  ReqSignedUrl,
  MethodSignedUrlParams,
  MsgWithConn,
  ReqGwCtx,
  MsgBaseSchema,
  SignedUrlParamSchema,
  MethodSignedUrlParamSchema,
  ResSignedUrlSchema,
  QSIdSchema,
  ResOptionalSignedUrlSchema,
} from "./msg-types.js";
import { TenantLedgerSchema } from "./msg-types.zod.js";
import { V2SerializedMetaKey } from "@fireproof/core-types-blockstore";
import { z } from "zod";

/* Put Meta */
export function buildReqPutMeta(
  sthis: NextId,
  auth: AuthType,
  signedUrlParam: SignedUrlParam,
  meta: V2SerializedMetaKey,
  gwCtx: ReqGwCtx,
): ReqPutMeta {
  return {
    auth,
    type: "reqPutMeta",
    ...gwCtx,
    tid: gwCtx.tid ?? sthis.nextId().str,
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
  req: MsgWithTenantLedger<MsgWithConn<ReqPutMeta>>,
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
export function MsgIsBindGetMeta(msg: MsgBase): msg is BindGetMeta {
  return msg.type === "bindGetMeta";
}

export function buildBindGetMeta(sthis: NextId, auth: AuthType, msp: MethodSignedUrlParams, gwCtx: ReqGwCtx): BindGetMeta {
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
  req: MsgWithTenantLedger<MsgWithConn<ReqSignedUrl>>,
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
export function buildReqDelMeta(
  sthis: NextId,
  auth: AuthType,
  param: SignedUrlParam,
  gwCtx: ReqGwCtx,
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

export function buildResDelMeta(
  // msgCtx: MsgTypesCtx,
  req: MsgWithTenantLedger<MsgWithConn<ReqDelMeta>>,
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

// ============================================================================
// Zod Schemas for Meta Messages
// ============================================================================

// Note: V2SerializedMetaKey comes from @fireproof/core-types-blockstore
// We'll use z.any() for now to avoid circular dependencies
const V2SerializedMetaKeySchema = z.any() as z.ZodType<V2SerializedMetaKey>;

// ReqPutMeta and ResPutMeta
export const ReqPutMetaSchema = MsgBaseSchema.extend({
  type: z.literal("reqPutMeta"),
  conn: QSIdSchema.partial().optional(),
  tenant: TenantLedgerSchema,
  methodParam: MethodSignedUrlParamSchema,
  urlParam: SignedUrlParamSchema,
  meta: V2SerializedMetaKeySchema,
});

export type ReqPutMeta = z.infer<typeof ReqPutMetaSchema>;

export const ResPutMetaValSchema = z.object({
  type: z.literal("resPutMeta"),
  meta: V2SerializedMetaKeySchema,
});

export type ResPutMetaVal = z.infer<typeof ResPutMetaValSchema>;

export const ResPutMetaSchema = ResSignedUrlSchema.extend({
  type: z.literal("resPutMeta"),
  meta: V2SerializedMetaKeySchema,
});

export type ResPutMeta = z.infer<typeof ResPutMetaSchema>;

// BindGetMeta and EventGetMeta
export const BindGetMetaSchema = MsgBaseSchema.extend({
  type: z.literal("bindGetMeta"),
  conn: QSIdSchema.partial().optional(),
  tenant: TenantLedgerSchema,
  methodParam: MethodSignedUrlParamSchema,
  urlParam: SignedUrlParamSchema,
});

export type BindGetMeta = z.infer<typeof BindGetMetaSchema>;

export const EventGetMetaSchema = ResSignedUrlSchema.extend({
  type: z.literal("eventGetMeta"),
  meta: V2SerializedMetaKeySchema,
});

export type EventGetMeta = z.infer<typeof EventGetMetaSchema>;

// ReqDelMeta and ResDelMeta
export const ReqDelMetaSchema = MsgBaseSchema.extend({
  type: z.literal("reqDelMeta"),
  conn: QSIdSchema.partial().optional(),
  tenant: TenantLedgerSchema,
  urlParam: SignedUrlParamSchema,
  meta: V2SerializedMetaKeySchema.optional(),
});

export type ReqDelMeta = z.infer<typeof ReqDelMetaSchema>;

export const ResDelMetaSchema = ResOptionalSignedUrlSchema.extend({
  type: z.literal("resDelMeta"),
});

export type ResDelMeta = z.infer<typeof ResDelMetaSchema>;
