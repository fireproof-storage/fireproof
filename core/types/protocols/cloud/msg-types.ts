import { Future, Logger, Result } from "@adviser/cement";
import { SuperThis } from "@fireproof/core-types-base";
import { CalculatePreSignedUrl } from "./msg-types-data.js";
import { FPCloudClaimSchema, ReadWrite, Role, TenantLedger, TenantLedgerSchema } from "./msg-types.zod.js";
import { z } from "zod";
// import { PreSignedMsg } from "./pre-signed-url.js";

export const VERSION = "FP-MSG-1.0";

// BaseTokenParam type now inferred from Zod schema (defined below)

// export type ReadWrite = "read" | "write";

export function toReadWrite(i?: string): ReadWrite {
  if (!i) {
    return "read";
  }
  switch (i.toLowerCase()) {
    case "write":
      return "write";
    default:
      return "read";
  }
}

// export type Role = "admin" | "owner" | "member";

export function toRole(i?: string): Role {
  if (!i) {
    return "member";
  }
  switch (i.toLowerCase()) {
    case "admin":
      return "admin";
    case "owner":
      return "owner";
    default:
      return "member";
  }
}

// export type RoleClaim = TenantClaim | LedgerClaim;

// export interface FPWaitTokenResult {
//   readonly type: "FPWaitTokenResult";
//   readonly token: string;
// }

// export function isFPWaitTokenResult(r: unknown): r is FPWaitTokenResult {
//   return typeof r === "object" && !!r && (r as FPWaitTokenResult).type === "FPWaitTokenResult";
// }

// TokenForParam type now inferred from Zod schema (defined below)

export type MsgWithError<T extends MsgBase> = T | ErrorMsg;

export interface PreSignedMsg extends MsgWithTenantLedger<MsgWithConn> {
  readonly methodParam: MethodSignedUrlParam;
  readonly urlParam: SignedUrlParam;
}

export interface MsgRawConnection<T extends MsgBase = MsgBase> {
  // readonly ws: WebSocket;
  // readonly params: ConnectionKey;
  // qsOpen: ReqRes<ReqOpen, ResOpen>;
  readonly sthis: SuperThis;
  // readonly exchangedGestalt: ExchangedGestalt;
  // readonly activeBinds: Map<string, ActiveStream<T, MsgBase>>;

  // readonly vconn: VirtualConnection;

  isReady: boolean;

  bind<S extends T, Q extends T>(req: Q, opts: RequestOpts): ReadableStream<MsgWithError<S>>;
  request<S extends T, Q extends T>(req: Q, opts: RequestOpts): Promise<MsgWithError<S>>;
  send<S extends T, Q extends T>(msg: Q): Promise<MsgWithError<S>>;
  start(): Promise<Result<void>>;
  close(o: T): Promise<Result<void>>;
}

export interface RequestOpts {
  readonly waitFor: (msg: MsgBase) => boolean;
  readonly noConn?: boolean; // if true, no connection is required
  readonly pollInterval?: number; // 1000ms
  readonly timeout?: number; // ms
  readonly noRetry?: boolean;
  readonly rawConn?: MsgRawConnection;
}

export interface EnDeCoder {
  encode<T>(node: T): Uint8Array<ArrayBufferLike>;
  decode<T>(data: Uint8Array<ArrayBufferLike>): T;
}

export interface WaitForTid {
  readonly tid: string;
  readonly future: Future<MsgBase>;
  readonly timeout?: number;
  // undefined match all
  readonly waitFor: (msg: MsgBase) => boolean;
}

// export interface ConnId {
//   readonly connId: string;
// }
// type AddConnId<T extends MsgBase, N> = Omit<T, "type"> & ConnId & { readonly type: N };
export interface NextId {
  readonly nextId: SuperThis["nextId"];
}

export function isAuthTypeFPCloudJWK(a: AuthType): a is FPJWKCloudAuthType {
  return a.type === "fp-cloud-jwk";
}

export function isAuthTypeFPCloud(a: AuthType): a is FPCloudAuthType {
  return a.type === "fp-cloud";
}

export type AuthFactory = (tp?: Partial<TokenForParam>) => Promise<Result<AuthType>>;

export function keyTenantLedger(t: TenantLedger): string {
  return `${t.tenant}:${t.ledger}`;
}

export function qsidEqual(a: QSId, b: QSId): boolean {
  return a.reqId === b.reqId && a.resId === b.resId;
}

export function qsidKey(qsid: QSId): string {
  return `${qsid.reqId}:${qsid.resId}`;
}

// export interface Connection extends ReqResId{
//   readonly key: TenantLedger;
// }

// export interface Connected {
//   readonly conn: Connection;
// }

export function MsgIsTid(msg: MsgBase, tid: string): boolean {
  return !msg.tid || msg.tid === tid;
}

// MsgConnAuth type now inferred from Zod schema (defined below)

export type MsgWithConn<T extends MsgBase = MsgBase> = T & { readonly conn: QSId };

export type MsgWithOptionalConn<T extends MsgBase = MsgBase> = T & { readonly conn?: Partial<QSId> };

// type MsgWithOptionalConn<T extends MsgBase = MsgBase> = T & { readonly conn?: QSId };

// export type MsgWithOptionalConnAuth<T extends MsgBase = MsgBase> = MsgWithOptionalConn<T> & { readonly auth: AuthType };

export type MsgWithOptionalTenantLedger<T extends MsgWithConn> = T & { readonly tenant?: Partial<TenantLedger> };
export type MsgWithTenantLedger<T extends MsgWithOptionalConn> = T & { readonly tenant: TenantLedger };

// ErrorMsg types now inferred from Zod schemas (defined below)

export function MsgIsNotReadyError(msg: MsgBase): msg is NotReadyErrorMsg {
  return MsgIsError(msg) && (msg as NotReadyErrorMsg).reason === "not-ready";
}

export function MsgIsError(rq: MsgBase): rq is ErrorMsg {
  return rq.type === "error";
}

export function MsgIsQSError(rq: ReqRes<MsgBase, MsgBase>): rq is ReqRes<ErrorMsg, ErrorMsg> {
  return rq.res.type === "error" || rq.req.type === "error";
}

export type HttpMethods = "GET" | "PUT" | "DELETE";
export type FPStoreTypes = "meta" | "car" | "wal" | "file";

export function coerceFPStoreTypes(s?: string): FPStoreTypes {
  const x = s?.trim();
  if (x === "meta" || x === "car" || x === "wal" || x === "file") {
    return x;
  }
  throw new Error(`Invalid FPStoreTypes: ${s}`);
}

// reqRes is http
// stream is WebSocket
export type ProtocolCapabilities = "reqRes" | "stream";

export function isProtocolCapabilities(s: string): s is ProtocolCapabilities {
  const x = s.trim();
  return x === "reqRes" || x === "stream";
}

export interface Gestalt {
  /**
   * Describes StoreTypes which are handled
   */
  readonly storeTypes: FPStoreTypes[];
  /**
   * A unique identifier
   */
  readonly id: string;
  /**
   * protocol capabilities
   * defaults "stream"
   */
  readonly protocolCapabilities: ProtocolCapabilities[];
  /**
   * HttpEndpoints (URL) required atleast one
   * could be absolute or relative
   */
  readonly httpEndpoints: string[];
  /**
   * WebsocketEndpoints (URL) required atleast one
   * could be absolute or relative
   */
  readonly wsEndpoints: string[];
  /**
   * Encodings supported
   * JSON, CBOR
   */
  readonly encodings: ("JSON" | "CBOR")[];
  /**
   * Authentication methods supported
   */
  readonly auth: AuthType[];
  /**
   * Requires Authentication
   */
  readonly requiresAuth: boolean;
  /**
   * In|Outband Data | Meta | WAL Support
   * Inband Means that the Payload is part of the message
   * Outband Means that the Payload is PUT/GET to a different URL
   * A Clien implementation usally not support reading or writing
   * support
   */
  readonly data?: {
    readonly inband: boolean;
    readonly outband: boolean;
  };
  readonly meta?: {
    readonly inband: true; // meta inband is mandatory
    readonly outband: boolean;
  };
  readonly wal?: {
    readonly inband: boolean;
    readonly outband: boolean;
  };
  /**
   * Request Types supported
   * reqGestalt, reqSubscribeMeta, reqPutMeta, reqGetMeta, reqDelMeta, reqUpdateMeta
   */
  readonly reqTypes: string[];
  /**
   * Response Types supported
   * resGestalt, resSubscribeMeta, resPutMeta, resGetMeta, resDelMeta, updateMeta
   */
  readonly resTypes: string[];
  /**
   * Event Types supported
   * updateMeta
   */
  readonly eventTypes: string[];
}

// MsgerParams type now inferred from Zod schema (defined below)

// force the server id
export type GestaltParam = Partial<Gestalt> & { readonly id: string };

export function defaultGestalt(msgP: MsgerParams, gestalt: GestaltParam): Gestalt {
  return {
    storeTypes: ["meta", "file", "car", "wal"],
    httpEndpoints: ["/fp"],
    wsEndpoints: ["/ws"],
    encodings: ["JSON"],
    protocolCapabilities: msgP.protocolCapabilities || ["reqRes", "stream"],
    auth: [],
    requiresAuth: false,
    data: msgP.hasPersistent
      ? {
          inband: true,
          outband: true,
        }
      : undefined,
    meta: msgP.hasPersistent
      ? {
          inband: true,
          outband: true,
        }
      : undefined,
    wal: msgP.hasPersistent
      ? {
          inband: true,
          outband: true,
        }
      : undefined,
    reqTypes: [
      "reqOpen",
      "reqGestalt",
      // "reqSignedUrl",
      "reqSubscribeMeta",
      "reqPutMeta",
      "reqBindMeta",
      "reqDelMeta",
      "reqPutData",
      "reqGetData",
      "reqDelData",
      "reqPutWAL",
      "reqGetWAL",
      "reqDelWAL",
      "reqUpdateMeta",
    ],
    resTypes: [
      "resOpen",
      "resGestalt",
      // "resSignedUrl",
      "resSubscribeMeta",
      "resPutMeta",
      "resGetMeta",
      "resDelMeta",
      "resPutData",
      "resGetData",
      "resDelData",
      "resPutWAL",
      "resGetWAL",
      "resDelWAL",
      "updateMeta",
    ],
    eventTypes: ["updateMeta"],
    ...gestalt,
  };
}

export function buildReqChat(sthis: NextId, auth: AuthType, conn: Partial<QSId>, message: string, targets?: QSId[]): ReqChat {
  return {
    tid: sthis.nextId().str,
    type: "reqChat",
    version: VERSION,
    auth,
    conn: conn as QSId, // to build on ReqOpenConn is fine
    message,
    targets: targets ?? [],
  };
}

export function buildResChat(req: ReqChat, conn?: QSId, message?: string, targets?: QSId[], auth?: AuthType): ResChat {
  return {
    ...req,
    auth: auth || req.auth,
    conn: conn || req.conn,
    message: message || req.message,
    targets: targets || req.targets,
    type: "resChat",
    version: VERSION,
  };
}

export function MsgIsReqChat(msg: MsgBase): msg is ReqChat {
  return msg.type === "reqChat";
}

export function MsgIsResChat(msg: MsgBase): msg is ResChat {
  return msg.type === "resChat";
}

/**
 * The ReqGestalt message is used to request the
 * features of the Responder.
 */

export function MsgIsReqGestalt(msg: MsgBase): msg is ReqGestalt {
  return msg.type === "reqGestalt";
}

export function buildReqGestalt(sthis: NextId, auth: AuthType, gestalt: Gestalt, publish?: boolean): ReqGestalt {
  return {
    tid: sthis.nextId().str,
    auth,
    type: "reqGestalt",
    version: VERSION,
    gestalt,
    publish,
  };
}

// ConnInfo type now inferred from Zod schema (defined below)
/**
 * The ResGestalt message is used to respond with
 * the features of the Responder.
 */

export function buildResGestalt(req: ReqGestalt, gestalt: Gestalt, auth: AuthType): ResGestalt | ErrorMsg {
  return {
    tid: req.tid,
    auth: auth || req.auth,
    type: "resGestalt",
    version: VERSION,
    gestalt,
  };
}

export function MsgIsResGestalt(msg: MsgBase): msg is ResGestalt {
  return msg.type === "resGestalt";
}

// export interface ReqOpenConnection {
//   // readonly key: TenantLedger;
//   readonly reqId?: string;
//   readonly resId?: string; // for double open
// }

export function buildReqOpen(sthis: NextId, auth: AuthType, conn: Partial<QSId>): ReqOpen {
  const req = {
    tid: sthis.nextId().str,
    auth,
    type: "reqOpen",
    version: VERSION,
    conn: {
      ...conn,
      reqId: conn.reqId || sthis.nextId().str,
    },
  } satisfies ReqOpen;
  return req;
}

// export function MsgIsReqOpenWithConn(imsg: MsgBase): imsg is MsgWithConn<ReqOpen> {
//   const msg = imsg as MsgWithConn<ReqOpen>;
//   return msg.type === "reqOpen" && !!msg.conn && !!msg.conn.reqId;
// }

export function MsgIsReqOpen(imsg: MsgBase): imsg is ReqOpen {
  const msg = imsg as MsgWithConn<ReqOpen>;
  return msg.type === "reqOpen" && !!msg.conn && !!msg.conn.reqId;
}

export function MsgIsWithConn<T extends MsgBase>(msg: T): msg is MsgWithConn<T> {
  const mwc = (msg as MsgWithConn<T>).conn;
  return mwc && !!(mwc as QSId).reqId && !!(mwc as QSId).resId;
}

export function MsgIsWithConnAuth<T extends MsgBase>(msg: T): msg is MsgWithConn<T> {
  return MsgIsWithConn(msg) && !!msg.auth && typeof msg.auth.type === "string";
}

export function MsgIsConnected<T extends MsgBase>(msg: T, qsid: QSId): msg is MsgWithConn<T> {
  return MsgIsWithConn(msg) && msg.conn.reqId === qsid.reqId && msg.conn.resId === qsid.resId;
}

export function buildResOpen(sthis: NextId, req: ReqOpen, resStreamId?: string): ResOpen {
  if (!(req.conn && req.conn.reqId)) {
    throw new Error("req.conn.reqId is required");
  }
  return {
    ...req,
    type: "resOpen",
    conn: {
      ...req.conn,
      resId: req.conn.resId || resStreamId || sthis.nextId().str,
    },
  };
}

export function MsgIsResOpen(msg: MsgBase): msg is ResOpen {
  return msg.type === "resOpen";
}

export function MsgIsReqClose(msg: MsgBase): msg is ReqClose {
  return msg.type === "reqClose" && MsgIsWithConn(msg);
}

export function MsgIsResClose(msg: MsgBase): msg is ResClose {
  return msg.type === "resClose" && MsgIsWithConn(msg);
}

export function buildResClose(req: ReqClose, conn: QSId): ResClose {
  return {
    ...req,
    type: "resClose",
    conn,
  };
}

export function buildReqClose(sthis: NextId, auth: AuthType, conn: QSId): ReqClose {
  return {
    tid: sthis.nextId().str,
    auth,
    type: "reqClose",
    version: VERSION,
    conn,
  };
}

// export type ReqSignedUrlParam = Omit<SignedUrlParam, "method" | "store">;
export interface ReqSignedUrlParam {
  readonly auth: AuthType;
  readonly methodParam: MethodSignedUrlParam;
  readonly urlParam: SignedUrlParam;
}

export interface UpdateReqRes<Q extends MsgBase, S extends MsgBase> {
  req: Q;
  res: S;
}

export type ReqRes<Q extends MsgBase, S extends MsgBase> = Readonly<UpdateReqRes<Q, S>>;

export function buildErrorMsg(
  msgCtx: { readonly logger: Logger; readonly sthis: SuperThis },
  base: Partial<MsgBase & { ref?: unknown }>,
  error: Error,
  body?: string,
  stack?: string[],
): ErrorMsg {
  if (!stack && msgCtx.sthis.env.get("FP_STACK")) {
    stack = error.stack?.split("\n");
  }
  const msg = {
    auth: base.auth || { type: "error" },
    src: base,
    type: "error",
    tid: base.tid || "internal",
    message: error.message,
    version: VERSION,
    body,
    stack,
  } satisfies ErrorMsg;
  msgCtx.logger.Any("ErrorMsg", msg);
  return msg;
}

export function MsgIsTenantLedger<T extends MsgBase>(msg: T): msg is MsgWithTenantLedger<MsgWithConn<T>> {
  if (MsgIsWithConnAuth(msg)) {
    const t = (msg as MsgWithTenantLedger<MsgWithConn<T>>).tenant;
    return !!t && !!t.tenant && !!t.ledger;
  }
  return false;
}

export type ReqSignedUrlWithoutMethodParams = SignedUrlParams & MsgWithTenantLedger<MsgWithConn>;
export type ReqSignedUrl = MethodSignedUrlParams & MsgWithTenantLedger<MsgWithOptionalConn>;

// GwCtx, ReqGwCtx, and GwCtxConn types now inferred from Zod schemas (defined below)

export function buildReqSignedUrl<T extends ReqSignedUrl>(sthis: NextId, type: string, rparam: ReqSignedUrlParam, gwCtx: GwCtx): T {
  return {
    tid: sthis.nextId().str,
    type,
    auth: rparam.auth,
    version: VERSION,
    ...gwCtx,
    methodParam: rparam.methodParam,
    urlParam: rparam.urlParam,
  } satisfies ReqSignedUrl as T;
}

export interface MsgTypesCtx {
  readonly sthis: SuperThis;
  readonly logger: Logger;
  // readonly auth: AuthFactory;
}

// export async function msgTypesCtxSync(msgCtx: MsgTypesCtx): Promise<MsgTypesCtxSync> {
//   return {
//     sthis: msgCtx.sthis,
//     logger: msgCtx.logger,
//     auth: await msgCtx.auth(),
//   };
// }

export interface MsgTypesCtxSync {
  readonly sthis: SuperThis;
  readonly logger: Logger;
  readonly auth: AuthType;
}

export function resAuth(msg: MsgBase): Promise<AuthType> {
  return msg.auth ? Promise.resolve(msg.auth) : Promise.reject(new Error("No Auth"));
}

// ============================================================================
// Zod Schemas for Req/Res Messages
// ============================================================================

// Base schemas - Auth types as discriminated union
const UCanAuthSchema = z
  .object({
    type: z.literal("ucan"),
    params: z
      .object({
        tbd: z.string(),
      })
      .readonly(),
  })
  .readonly();

const FPJWKCloudAuthTypeSchema = z
  .object({
    type: z.literal("fp-cloud-jwk"),
    params: z
      .object({
        jwk: z.string(),
      })
      .readonly(),
  })
  .readonly();

// BaseTokenParam schema
const BaseTokenParamSchemaBase = z.object({
  alg: z.string(), // defaults ES256
  issuer: z.string(),
  audience: z.string(),
  validFor: z.number(),
});

export const BaseTokenParamSchema = BaseTokenParamSchemaBase.readonly();

export type BaseTokenParam = z.infer<typeof BaseTokenParamSchema>;
// TokenForParam schema - intersection of FPCloudClaim and Partial<BaseTokenParam>
export const TokenForParamSchema = FPCloudClaimSchema.and(BaseTokenParamSchemaBase.partial()).readonly();
export type TokenForParam = z.infer<typeof TokenForParamSchema>;

const FPCloudAuthTypeSchema = z
  .object({
    type: z.literal("fp-cloud"),
    params: z
      .object({
        claim: TokenForParamSchema,
        jwk: z.string(),
      })
      .readonly(),
  })
  .readonly();

const ErrorAuthSchema = z
  .object({
    type: z.literal("error"),
  })
  .readonly();

const FPDeviceIdAuthSchema = z
  .object({
    type: z.literal("device-id"),
    params: z
      .object({
        sessionToken: z.string(),
      })
      .readonly(),
  })
  .readonly();

export const AuthTypeSchema = z.discriminatedUnion("type", [
  UCanAuthSchema,
  FPJWKCloudAuthTypeSchema,
  FPCloudAuthTypeSchema,
  FPDeviceIdAuthSchema,
  ErrorAuthSchema,
]);

export type AuthType = z.infer<typeof AuthTypeSchema>;
export type UCanAuth = z.infer<typeof UCanAuthSchema>;
export type FPJWKCloudAuthType = z.infer<typeof FPJWKCloudAuthTypeSchema>;
export type FPCloudAuthType = z.infer<typeof FPCloudAuthTypeSchema>;

export const QSIdSchema = z.object({
  reqId: z.string(),
  resId: z.string(),
});

export type QSId = z.infer<typeof QSIdSchema>;

export const MsgBaseSchema = z.object({
  tid: z.string(),
  type: z.string(),
  version: z.string(),
  auth: AuthTypeSchema,
});

export const MsgBaseSchemaReadonly = MsgBaseSchema.readonly();

export type MsgBase = z.infer<typeof MsgBaseSchemaReadonly>;

export const GestaltSchema: z.ZodType<Gestalt> = z.object({
  storeTypes: z.array(z.enum(["meta", "car", "wal", "file"])),
  id: z.string(),
  protocolCapabilities: z.array(z.enum(["reqRes", "stream"])),
  httpEndpoints: z.array(z.string()),
  wsEndpoints: z.array(z.string()),
  encodings: z.array(z.enum(["JSON", "CBOR"])),
  auth: z.array(AuthTypeSchema),
  requiresAuth: z.boolean(),
  data: z
    .object({
      inband: z.boolean(),
      outband: z.boolean(),
    })
    .optional(),
  meta: z
    .object({
      inband: z.literal(true),
      outband: z.boolean(),
    })
    .optional(),
  wal: z
    .object({
      inband: z.boolean(),
      outband: z.boolean(),
    })
    .optional(),
  reqTypes: z.array(z.string()),
  resTypes: z.array(z.string()),
  eventTypes: z.array(z.string()),
});

export const MethodSignedUrlParamSchema = z.object({
  method: z.enum(["GET", "PUT", "DELETE"]),
  store: z.enum(["meta", "car", "wal", "file"]),
});

export type MethodSignedUrlParam = z.infer<typeof MethodSignedUrlParamSchema>;

export const SignedUrlParamSchema = z.object({
  path: z.string().optional(),
  key: z.string(),
  expires: z.number().optional(),
  index: z.string().optional(),
});

export type SignedUrlParam = z.infer<typeof SignedUrlParamSchema>;

// Composite parameter schemas
export const MethodParamsSchema = z.object({
  methodParam: MethodSignedUrlParamSchema,
});

export type MethodParams = z.infer<typeof MethodParamsSchema>;

export const SignedUrlParamsSchema = z.object({
  urlParam: SignedUrlParamSchema,
});

export type SignedUrlParams = z.infer<typeof SignedUrlParamsSchema>;

export const MethodSignedUrlParamsSchema = MethodParamsSchema.and(SignedUrlParamsSchema);

export type MethodSignedUrlParams = z.infer<typeof MethodSignedUrlParamsSchema>;

// ReqChat and ResChat
export const ReqChatSchema = MsgBaseSchema.extend({
  type: z.literal("reqChat"),
  conn: QSIdSchema,
  message: z.string(),
  targets: z.array(QSIdSchema),
}).readonly();

export const ResChatSchema = MsgBaseSchema.extend({
  type: z.literal("resChat"),
  conn: QSIdSchema,
  message: z.string(),
  targets: z.array(QSIdSchema),
}).readonly();

// ReqGestalt and ResGestalt
export const ReqGestaltSchema = MsgBaseSchema.extend({
  type: z.literal("reqGestalt"),
  gestalt: GestaltSchema,
  publish: z.boolean().optional(),
}).readonly();

export const ResGestaltSchema = MsgBaseSchema.extend({
  type: z.literal("resGestalt"),
  gestalt: GestaltSchema,
}).readonly();

// ReqOpen and ResOpen
export const ReqOpenConnSchema = z
  .object({
    reqId: z.string(),
    resId: z.string().optional(),
  })
  .readonly();

export type ReqOpenConn = z.infer<typeof ReqOpenConnSchema>;

export const ReqOpenSchema = MsgBaseSchema.extend({
  type: z.literal("reqOpen"),
  conn: ReqOpenConnSchema,
}).readonly();

export const ResOpenSchema = MsgBaseSchema.extend({
  type: z.literal("resOpen"),
  conn: QSIdSchema,
}).readonly();

// ReqClose and ResClose
export const ReqCloseSchema = MsgBaseSchema.extend({
  type: z.literal("reqClose"),
  conn: QSIdSchema,
}).readonly();

export const ResCloseSchema = MsgBaseSchema.extend({
  type: z.literal("resClose"),
  conn: QSIdSchema,
}).readonly();

// MsgConnAuth schema
export const MsgConnAuthSchema = z
  .object({
    conn: QSIdSchema,
    auth: AuthTypeSchema,
  })
  .readonly();

export type MsgConnAuth = z.infer<typeof MsgConnAuthSchema>;

// ErrorMsg schemas
export const ErrorMsgBaseSchema = z
  .object({
    type: z.literal("error"),
    src: z.unknown(),
    message: z.string(),
    body: z.string().optional(),
    stack: z.array(z.string()).optional(),
    conn: QSIdSchema.partial().optional(),
    tid: z.string(),
    version: z.string(),
    auth: AuthTypeSchema,
  })
  .readonly();

export const NotReadyErrorMsgSchema = z
  .object({
    type: z.literal("error"),
    src: z.literal("not-ready"),
    message: z.literal("Not Ready"),
    reason: z.literal("not-ready"),
    body: z.string().optional(),
    stack: z.array(z.string()).optional(),
    conn: QSIdSchema.partial().optional(),
    tid: z.string(),
    version: z.string(),
    auth: AuthTypeSchema,
  })
  .readonly();

export const ErrorMsgSchema = z.union([ErrorMsgBaseSchema, NotReadyErrorMsgSchema]);

// Type inference for error messages
export type ErrorMsgBase = z.infer<typeof ErrorMsgBaseSchema>;
export type NotReadyErrorMsg = z.infer<typeof NotReadyErrorMsgSchema>;
export type ErrorMsg = z.infer<typeof ErrorMsgSchema>;

// ConnInfo schema
export const ConnInfoSchema = z
  .object({
    connIds: z.array(z.string()),
  })
  .readonly();

export type ConnInfo = z.infer<typeof ConnInfoSchema>;

// MsgerParams schema
export const MsgerParamsSchema = z
  .object({
    mime: z.string(),
    auth: AuthTypeSchema.optional(),
    hasPersistent: z.boolean().optional(),
    protocolCapabilities: z.array(z.enum(["reqRes", "stream"])).optional(),
    timeout: z.number(),
  })
  .readonly();

export type MsgerParams = z.infer<typeof MsgerParamsSchema>;

// GwCtx schema
export const GwCtxSchema = z
  .object({
    tid: z.string().optional(),
    conn: QSIdSchema,
    tenant: TenantLedgerSchema,
  })
  .readonly();

export type GwCtx = z.infer<typeof GwCtxSchema>;

// ReqGwCtx schema
export const ReqGwCtxSchema = z
  .object({
    tid: z.string().optional(),
    conn: QSIdSchema.partial(),
    tenant: TenantLedgerSchema,
  })
  .readonly();

export type ReqGwCtx = z.infer<typeof ReqGwCtxSchema>;

// GwCtxConn schema
export const GwCtxConnSchema = z
  .object({
    tid: z.string().optional(),
    conn: QSIdSchema,
    tenant: TenantLedgerSchema,
  })
  .readonly();

export type GwCtxConn = z.infer<typeof GwCtxConnSchema>;

// ResSignedUrl and ResOptionalSignedUrl
export const ResSignedUrlSchema = MsgBaseSchema.extend({
  conn: QSIdSchema,
  tenant: TenantLedgerSchema,
  methodParam: MethodSignedUrlParamSchema,
  urlParam: SignedUrlParamSchema,
  signedUrl: z.string(),
});

export const ResOptionalSignedUrlSchema = MsgBaseSchema.extend({
  conn: QSIdSchema,
  tenant: TenantLedgerSchema,
  urlParam: SignedUrlParamSchema,
  methodParam: MethodSignedUrlParamSchema,
  signedUrl: z.string().optional(),
});

// Type inference - replace original interfaces with inferred types
export type ReqChat = z.infer<typeof ReqChatSchema>;
export type ResChat = z.infer<typeof ResChatSchema>;
export type ReqGestalt = z.infer<typeof ReqGestaltSchema>;
export type ResGestalt = z.infer<typeof ResGestaltSchema>;
export type ReqOpen = z.infer<typeof ReqOpenSchema>;
export type ResOpen = z.infer<typeof ResOpenSchema>;
export type ReqClose = z.infer<typeof ReqCloseSchema>;
export type ResClose = z.infer<typeof ResCloseSchema>;
export type ResSignedUrl = z.infer<typeof ResSignedUrlSchema>;
export type ResOptionalSignedUrl = z.infer<typeof ResOptionalSignedUrlSchema>;

export async function buildRes<Q extends MsgWithTenantLedger<MsgWithConn<ReqSignedUrlWithoutMethodParams>>, S extends ResSignedUrl>(
  methodParam: MethodSignedUrlParam,
  type: string,
  msgCtx: MsgTypesCtx,
  req: Q,
  ctx: CalculatePreSignedUrl,
): Promise<MsgWithError<S>> {
  const psm = {
    type: "reqSignedUrl",
    auth: await resAuth(req),
    version: req.version,
    methodParam,
    urlParam: {
      ...req.urlParam,
    },
    conn: req.conn,
    tenant: req.tenant,
    tid: req.tid,
  } satisfies PreSignedMsg;
  const rSignedUrl = await ctx.calculatePreSignedUrl(msgCtx, psm);
  if (rSignedUrl.isErr()) {
    return buildErrorMsg(msgCtx, req, rSignedUrl.Err());
  }
  return {
    ...req,
    urlParam: psm.urlParam,
    methodParam,
    type,
    signedUrl: rSignedUrl.Ok().toString(),
  } as unknown as MsgWithError<S>;
}
