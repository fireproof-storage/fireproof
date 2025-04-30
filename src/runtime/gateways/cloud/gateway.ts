// import PartySocket, { PartySocketOptions } from "partysocket";
import {
  Result,
  URI,
  KeyedResolvOnce,
  exception2Result,
  Logger,
  param,
  ResolveOnce,
  to_uint8,
  BuildURI,
  Future,
} from "@adviser/cement";
import type { SuperThis } from "../../../types.js";
import {
  buildErrorMsg,
  buildReqOpen,
  FPStoreTypes,
  HttpMethods,
  MsgBase,
  MsgIsError,
  ReqSignedUrl,
  MsgWithError,
  ResSignedUrl,
  GwCtx,
  QSId,
  coerceFPStoreTypes,
  AuthType,
} from "../../../protocols/cloud/msg-types.js";
import { MsgConnected, MsgConnectedAuth, Msger, authTypeFromUri } from "../../../protocols/cloud/msger.js";
import {
  MsgIsResDelData,
  MsgIsResGetData,
  MsgIsResPutData,
  ResDelData,
  ResGetData,
  ResPutData,
} from "../../../protocols/cloud/msg-types-data.js";
import { ensureLogger, hashObject, NotFoundError } from "../../../utils.js";
import { SerdeGateway, SerdeGatewayCtx, SerdeGetResult, UnsubscribeResult, VoidResult } from "../../../blockstore/serde-gateway.js";
import { FPEnvelope, FPEnvelopeMeta, FPEnvelopeWAL } from "../../../blockstore/fp-envelope.js";
import { dbMetaEvent2Serialized, decode2DbMetaEvents, fpDeserialize, fpSerialize } from "../fp-envelope-serialize.js";
import {
  BindGetMeta,
  buildBindGetMeta,
  buildReqDelMeta,
  buildReqPutMeta,
  EventGetMeta,
  MsgIsEventGetMeta,
  MsgIsResPutMeta,
  ReqDelMeta,
  ReqPutMeta,
  ResDelMeta,
  ResPutMeta,
} from "../../../protocols/cloud/msg-types-meta.js";
import { encodeAsV2SerializedMetaKey, V2SerializedMetaKeyExtractKey } from "../../meta-key-hack.js";

const VERSION = "v0.1-fp-cloud";

type ConnectedSerdeGatewayCtx = SerdeGatewayCtx & { conn: AuthedConnection };

export interface StoreTypeGateway {
  get: <S>(ctx: ConnectedSerdeGatewayCtx, url: URI) => Promise<SerdeGetResult<S>>;
  put: <T>(ctx: ConnectedSerdeGatewayCtx, url: URI, body: FPEnvelope<T>) => Promise<VoidResult>;
  delete: (ctx: ConnectedSerdeGatewayCtx, url: URI) => Promise<VoidResult>;
}

abstract class BaseGateway {
  readonly logger: Logger;
  readonly sthis: SuperThis;
  constructor(sthis: SuperThis, module: string) {
    this.sthis = sthis;
    this.logger = ensureLogger(sthis, module);
  }

  async buildReqSignedUrl(
    type: string,
    method: HttpMethods,
    store: FPStoreTypes,
    uri: URI,
    conn: AuthedConnection,
  ): Promise<MsgWithError<ReqSignedUrl>> {
    const rParams = uri.getParamsResult({
      key: param.REQUIRED,
      store: param.REQUIRED,
      path: param.OPTIONAL,
      tenant: param.REQUIRED,
      ledger: param.REQUIRED,
      name: param.REQUIRED,
      index: param.OPTIONAL,
    });
    if (rParams.isErr()) {
      return buildErrorMsg(this, {} as MsgBase, rParams.Err());
    }
    const params = rParams.Ok();
    if (store !== params.store) {
      return buildErrorMsg(this, {} as MsgBase, new Error("store mismatch"));
    }
    const rAuth = await authTypeFromUri(this.logger, uri);
    if (rAuth.isErr()) {
      return buildErrorMsg(this, {} as MsgBase, rAuth.Err());
    }
    return {
      tid: this.sthis.nextId().str,
      auth: rAuth.Ok(),
      type,
      conn: conn.conn.Ok().conn,
      tenant: {
        tenant: params.tenant,
        ledger: params.ledger,
      },
      // tenant: conn.tenant,
      methodParam: {
        method,
        store,
      },
      urlParam: {
        ...params,
        key: params.key,
      },
      version: VERSION,
    } satisfies ReqSignedUrl;
  }

  async getReqSignedUrl<S extends ResSignedUrl>(
    type: string,
    method: HttpMethods,
    store: FPStoreTypes,
    waitForFn: (msg: MsgBase) => boolean,
    uri: URI,
    conn: AuthedConnection,
  ): Promise<MsgWithError<S>> {
    const rsu = await this.buildReqSignedUrl(type, method, store, uri, conn);
    if (MsgIsError(rsu)) {
      return rsu;
    }
    return conn.conn.Ok().request<S, ReqSignedUrl>(rsu, { waitFor: waitForFn });
  }

  async putObject(uri: URI, uploadUrl: string, body: Uint8Array, conn: AuthedConnection): Promise<Result<void>> {
    this.logger.Debug().Any("url", { uploadUrl, uri }).Msg("put-fetch-url");
    const rUpload = await exception2Result(async () => fetch(uploadUrl, { method: "PUT", body }));
    if (rUpload.isErr()) {
      return this.logger.Error().Url(uploadUrl, "uploadUrl").Err(rUpload).Msg("Error in put fetch").ResultError();
    }
    if (!rUpload.Ok().ok) {
      return this.logger.Error().Url(uploadUrl, "uploadUrl").Http(rUpload.Ok()).Msg("Error in put fetch").ResultError();
    }
    if (uri.getParam("testMode")) {
      conn.citem.trackPuts.add(uri.toString());
    }
    return Result.Ok(undefined);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getObject(uri: URI, downloadUrl: string, _conn: AuthedConnection): Promise<Result<Uint8Array>> {
    this.logger.Debug().Any("url", { downloadUrl, uri }).Msg("get-fetch-url");
    const rDownload = await exception2Result(async () => fetch(downloadUrl.toString(), { method: "GET" }));
    if (rDownload.isErr()) {
      return this.logger.Error().Url(downloadUrl, "uploadUrl").Err(rDownload).Msg("Error in get downloadUrl").ResultError();
    }
    const download = rDownload.Ok();
    if (!download.ok) {
      if (download.status === 404) {
        return Result.Err(new NotFoundError("Not found"));
      }
      return this.logger.Error().Url(downloadUrl, "uploadUrl").Err(rDownload).Msg("Error in get fetch").ResultError();
    }
    return Result.Ok(to_uint8(await download.arrayBuffer()));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async delObject(uri: URI, deleteUrl: string, _conn: AuthedConnection): Promise<Result<void>> {
    this.logger.Debug().Any("url", { deleteUrl, uri }).Msg("get-fetch-url");
    const rDelete = await exception2Result(async () => fetch(deleteUrl.toString(), { method: "DELETE" }));
    if (rDelete.isErr()) {
      return this.logger.Error().Url(deleteUrl, "deleteUrl").Err(rDelete).Msg("Error in get deleteURL").ResultError();
    }
    const download = rDelete.Ok();
    if (!download.ok) {
      if (download.status === 404) {
        return Result.Err(new NotFoundError("Not found"));
      }
      return this.logger.Error().Url(deleteUrl, "deleteUrl").Err(rDelete).Msg("Error in del fetch").ResultError();
    }
    return Result.Ok(undefined);
  }
}

class DataGateway extends BaseGateway implements StoreTypeGateway {
  constructor(sthis: SuperThis) {
    super(sthis, "DataGateway");
  }
  async get<S>(ctx: ConnectedSerdeGatewayCtx, uri: URI): Promise<SerdeGetResult<S>> {
    // type: string, method: HttpMethods, store: FPStoreTypes, waitForFn:
    const store = coerceFPStoreTypes(uri.getParam("store"));
    const rResSignedUrl = await this.getReqSignedUrl<ResGetData>("reqGetData", "GET", store, MsgIsResGetData, uri, ctx.conn);
    if (MsgIsError(rResSignedUrl)) {
      return this.logger.Error().Err(rResSignedUrl).Msg("Error in buildResSignedUrl").ResultError();
    }
    const { signedUrl: downloadUrl } = rResSignedUrl;
    const r = await fpDeserialize(this.sthis, uri, this.getObject(uri, downloadUrl, ctx.conn));
    return r as SerdeGetResult<S>;
  }
  async put<S>(ctx: ConnectedSerdeGatewayCtx, uri: URI, data: FPEnvelope<S>): Promise<Result<void>> {
    const store = coerceFPStoreTypes(uri.getParam("store"));
    const rResSignedUrl = await this.getReqSignedUrl<ResPutData>("reqPutData", "PUT", store, MsgIsResPutData, uri, ctx.conn);
    if (MsgIsError(rResSignedUrl)) {
      return this.logger.Error().Err(rResSignedUrl).Msg("Error in buildResSignedUrl").ResultError();
    }
    const { signedUrl: uploadUrl } = rResSignedUrl;
    const rBlob = await fpSerialize(ctx.loader.sthis, data);
    if (rBlob.isErr()) {
      return rBlob;
    }
    const r = await this.putObject(uri, uploadUrl, rBlob.Ok(), ctx.conn);
    return r;
  }
  async delete(ctx: ConnectedSerdeGatewayCtx, uri: URI): Promise<Result<void>> {
    const store = coerceFPStoreTypes(uri.getParam("store"));
    const rResSignedUrl = await this.getReqSignedUrl<ResDelData>("reqDelData", "DELETE", store, MsgIsResDelData, uri, ctx.conn);
    if (MsgIsError(rResSignedUrl)) {
      return this.logger.Error().Err(rResSignedUrl).Msg("Error in buildResSignedUrl").ResultError();
    }
    const { signedUrl: deleteUrl } = rResSignedUrl;
    return this.delObject(uri, deleteUrl, ctx.conn);
  }
}

function getGwCtx(conn: QSId, uri: URI): Result<GwCtx> {
  const rParams = uri.getParamsResult({
    tid: param.OPTIONAL,
    tenant: param.REQUIRED,
    ledger: param.REQUIRED,
  });
  if (rParams.isErr()) {
    return Result.Err(rParams);
  }
  const r = rParams.Ok();
  return Result.Ok({
    tid: r.tid,
    conn,
    tenant: {
      tenant: r.tenant,
      ledger: r.ledger,
    },
  });
}

class CurrentMeta {
  readonly boundGetMeta = new KeyedResolvOnce<ReadableStream<MsgWithError<EventGetMeta>>>();

  readonly currentMeta = new KeyedResolvOnce<FPEnvelopeMeta>();

  private valueReady = new Future<void>();
  private value: Result<FPEnvelopeMeta> | undefined;

  private readonly subscriptions: Map<string, (meta: FPEnvelopeMeta) => Promise<void>>;
  constructor(subscriptions: Map<string, (meta: FPEnvelopeMeta) => Promise<void>>) {
    this.subscriptions = subscriptions;
  }

  async get(
    ctx: ConnectedSerdeGatewayCtx,
    authType: AuthType,
    reqSignedUrl: ReqSignedUrl,
    gwCtx: GwCtx,
  ): Promise<Result<FPEnvelopeMeta>> {
    // console.log("cloud-get-1")
    const key = await hashObject(ctx.conn.conn.Ok().conn);
    // register bind updates
    const item = this.boundGetMeta.get(key);
    // console.log("cloud-get-2")
    item
      .once(async () => {
        const res = ctx.conn.conn
          .Ok()
          .bind<EventGetMeta, BindGetMeta>(buildBindGetMeta(ctx.loader.sthis, authType, reqSignedUrl, gwCtx), {
            waitFor: MsgIsEventGetMeta,
          });
        for await (const msg of res) {
          if (MsgIsEventGetMeta(msg)) {
            const rV2Meta = await V2SerializedMetaKeyExtractKey(ctx, msg.meta);
            const r = await decode2DbMetaEvents(ctx.loader.sthis, rV2Meta);
            let value: Result<FPEnvelopeMeta>;
            if (r.isErr()) {
              value = Result.Err(r);
            } else {
              value = Result.Ok({
                type: "meta",
                payload: r.Ok(),
              } satisfies FPEnvelopeMeta);
            }
            // console.log("cloud-set-value", value);
            this.value = value;
            this.valueReady.resolve();
            this.valueReady = new Future();
            this.currentMeta.get(key).reset();
            if (value.isOk()) {
              for (const cb of this.subscriptions.values()) {
                await cb(value.Ok());
              }
            }
          }
        }
        ctx.loader.logger.Error().Msg("Error bind should not end");
      })
      .catch((err) => {
        ctx.loader.logger.Error().Err(err).Msg("Error in bindGetMeta");
      });
    // console.log("cloud-get-3")
    return this.currentMeta.get(key).once(async () => {
      if (!this.value) {
        // console.log("cloud-get-4")
        await this.valueReady.asPromise();
        // console.log("cloud-get-5")
      }
      const rDbMeta = this.value;
      if (!rDbMeta) {
        return ctx.loader.logger.Error().Msg("No value").ResultError();
      }
      return rDbMeta;
    });
  }
}

class MetaGateway extends BaseGateway implements StoreTypeGateway {
  readonly subscriptions = new Map<string, (meta: FPEnvelopeMeta) => Promise<void>>();
  readonly currentMeta = new CurrentMeta(this.subscriptions);

  constructor(sthis: SuperThis) {
    super(sthis, "MetaGateway");
  }
  async subscribe(ctx: SerdeGatewayCtx, uri: URI, callback: (meta: FPEnvelopeMeta) => Promise<void>): Promise<UnsubscribeResult> {
    const key = ctx.loader.sthis.nextId().str;
    const unsub = () => {
      this.subscriptions.delete(key);
    };
    this.subscriptions.set(key, callback);
    return Result.Ok(unsub);
  }

  async get<S>(ctx: ConnectedSerdeGatewayCtx, uri: URI): Promise<SerdeGetResult<S>> {
    // const sp = sup({ method: "GET", store: "meta" });

    const reqSignedUrl = await this.buildReqSignedUrl("bindGetMeta", "GET", "meta", uri, ctx.conn);
    if (MsgIsError(reqSignedUrl)) {
      return this.logger.Error().Err(reqSignedUrl).Msg("Error in buildReqSignedUrl").ResultError();
    }
    const rGwCtx = getGwCtx(ctx.conn.conn.Ok().conn, uri);
    if (rGwCtx.isErr()) {
      return Result.Err(rGwCtx);
    }
    const rAuthType = await ctx.conn.conn.Ok().authType();
    if (rAuthType.isErr()) {
      return Result.Err(rAuthType);
    }
    const rMeta = await this.currentMeta.get(ctx, rAuthType.Ok(), reqSignedUrl, rGwCtx.Ok());
    if (rMeta.isErr()) {
      return Result.Err(rMeta);
    }
    return Result.Ok(rMeta.Ok() as FPEnvelope<S>);
  }
  async put<S>(ctx: ConnectedSerdeGatewayCtx, uri: URI, imeta: FPEnvelope<S>): Promise<Result<void>> {
    const meta = imeta as FPEnvelopeMeta;
    const reqSignedUrl = await this.buildReqSignedUrl("reqPutMeta", "PUT", "meta", uri, ctx.conn);
    if (MsgIsError(reqSignedUrl)) {
      return this.logger.Error().Err(reqSignedUrl).Msg("Error in buildReqSignedUrl").ResultError();
    }
    const rGwCtx = getGwCtx(ctx.conn.conn.Ok().conn, uri);
    if (rGwCtx.isErr()) {
      return Result.Err(rGwCtx);
    }
    const rAuthType = await ctx.conn.conn.Ok().authType();
    if (rAuthType.isErr()) {
      return Result.Err(rAuthType);
    }

    const serializedMeta = await dbMetaEvent2Serialized(ctx.loader.sthis, meta.payload);

    const rKeyedMeta = await encodeAsV2SerializedMetaKey(ctx, serializedMeta);
    if (rKeyedMeta.isErr()) {
      return rKeyedMeta;
    }
    const reqPutMeta = buildReqPutMeta(ctx.loader.sthis, rAuthType.Ok(), reqSignedUrl.urlParam, rKeyedMeta.Ok(), rGwCtx.Ok());
    const resMsg = await ctx.conn.conn.Ok().request<ResPutMeta, ReqPutMeta>(reqPutMeta, {
      waitFor: MsgIsResPutMeta,
    });
    if (MsgIsError(resMsg)) {
      return this.logger.Error().Err(resMsg).Msg("Error in buildResSignedUrl").ResultError();
    }
    return Result.Ok(undefined);
  }

  async delete(ctx: ConnectedSerdeGatewayCtx, uri: URI): Promise<Result<void>> {
    const reqSignedUrl = await this.getReqSignedUrl<ResDelData>("reqDelMeta", "DELETE", "meta", MsgIsResDelData, uri, ctx.conn);
    if (MsgIsError(reqSignedUrl)) {
      return this.logger.Error().Err(reqSignedUrl).Msg("Error in buildReqSignedUrl").ResultError();
    }
    const rGwCtx = getGwCtx(ctx.conn.conn.Ok().conn, uri);
    if (rGwCtx.isErr()) {
      return Result.Err(rGwCtx);
    }
    const rAuthType = await ctx.conn.conn.Ok().authType();
    if (rAuthType.isErr()) {
      return Result.Err(rAuthType);
    }
    const reqDelMeta = buildReqDelMeta(ctx.loader.sthis, rAuthType.Ok(), reqSignedUrl.urlParam, rGwCtx.Ok());
    const resMsg = await ctx.conn.conn.Ok().request<ResDelMeta, ReqDelMeta>(reqDelMeta, {
      waitFor: MsgIsResDelData,
    });
    if (MsgIsError(resMsg)) {
      return this.logger.Error().Err(resMsg).Msg("Error in buildResSignedUrl").ResultError();
    }
    return Result.Ok(undefined);
  }
}

class WALGateway extends BaseGateway implements StoreTypeGateway {
  // WAL will not pollute to the cloud
  readonly wals = new Map<string, FPEnvelopeWAL>();
  constructor(sthis: SuperThis) {
    super(sthis, "WALGateway");
  }
  getWalKeyFromUri(uri: URI): Result<string> {
    const rKey = uri.getParamsResult({
      key: 0,
      name: 0,
    });
    if (rKey.isErr()) {
      return Result.Err(rKey.Err());
    }
    const { name, key } = rKey.Ok();
    return Result.Ok(`${name}:${key}`);
  }
  async get<S>(ctx: ConnectedSerdeGatewayCtx, uri: URI): Promise<SerdeGetResult<S>> {
    const rKey = this.getWalKeyFromUri(uri);
    if (rKey.isErr()) {
      return Result.Err(rKey.Err());
    }
    const wal = this.wals.get(rKey.Ok());
    if (!wal) {
      return Result.Err(new NotFoundError("Not found"));
    }
    return Result.Ok(wal as FPEnvelope<S>);
  }
  async put<S>(ctx: ConnectedSerdeGatewayCtx, uri: URI, body: FPEnvelope<S>): Promise<Result<void>> {
    const rKey = this.getWalKeyFromUri(uri);
    if (rKey.isErr()) {
      return Result.Err(rKey.Err());
    }
    this.wals.set(rKey.Ok(), body as FPEnvelopeWAL);
    return Result.Ok(undefined);
  }
  async delete(ctx: ConnectedSerdeGatewayCtx, uri: URI): Promise<Result<void>> {
    const rKey = this.getWalKeyFromUri(uri);
    if (rKey.isErr()) {
      return Result.Err(rKey.Err());
    }
    this.wals.delete(rKey.Ok());
    return Result.Ok(undefined);
  }
}

const storeTypedGateways = new KeyedResolvOnce<StoreTypeGateway>();
function getStoreTypeGateway(sthis: SuperThis, uri: URI): StoreTypeGateway {
  const store = uri.getParam("store");
  switch (store) {
    case "file":
    case "car":
      return storeTypedGateways.get(store).once(() => new DataGateway(sthis));
    case "meta":
      return storeTypedGateways.get(store).once(() => new MetaGateway(sthis));
    case "wal":
      return storeTypedGateways.get(store).once(() => new WALGateway(sthis));
    default:
      throw ensureLogger(sthis, "getStoreTypeGateway").Error().Str("store", store).Msg("Invalid store type").ResultError();
  }
}

interface ConnectionItem {
  // readonly uri: URI;
  // readonly matchRes: MatchResult;
  readonly connection: ResolveOnce<Result<MsgConnected>>;
  readonly trackPuts: Set<string>;
}

export interface AuthedConnection {
  readonly conn: Result<MsgConnectedAuth>;
  readonly citem: ConnectionItem;
}

// const keyedConnections = new KeyedResolvOnce<Connection>();
interface Subscription {
  readonly sid: string;
  readonly uri: string; // optimization
  readonly callback: (msg: Uint8Array) => void;
  readonly unsub: () => void;
}

const subscriptions = new Map<string, Subscription[]>();
// const doServerSubscribe = new KeyedResolvOnce();
export class FireproofCloudGateway implements SerdeGateway {
  readonly logger: Logger;
  readonly sthis: SuperThis;
  readonly #connectionURIs = new KeyedResolvOnce<ConnectionItem>();

  constructor(sthis: SuperThis) {
    this.sthis = sthis;
    this.logger = ensureLogger(sthis, "FireproofCloudGateway", {
      this: true,
    });
    // console.log("FireproofCloudGateway", this.sthis.nextId().str);
  }

  async buildUrl(ctx: SerdeGatewayCtx, baseUrl: URI, key: string): Promise<Result<URI>> {
    return Result.Ok(baseUrl.build().setParam("key", key).URI());
  }

  async start(ctx: SerdeGatewayCtx, uri: URI): Promise<Result<URI>> {
    await this.sthis.start();
    // const rName = uri.getParamResult("name");
    // if (rName.isErr()) {
    //   return this.logger.Error().Err(rName).Msg("name not found").ResultError();
    // }
    const ret = uri.build().defParam("version", VERSION);
    ret.defParam("protocol", "wss");
    const retURI = ret.URI();
    this.registerConnectionURI(retURI, () => ({
      connection: new ResolveOnce<Result<MsgConnected>>(),
      trackPuts: new Set<string>(),
    }));
    return Result.Ok(retURI);
  }

  async get<S>(ctx: SerdeGatewayCtx, uri: URI): Promise<SerdeGetResult<S>> {
    const conn = await this.getCloudConnectionItem(ctx.loader.logger, uri);
    if (conn.conn.isErr()) {
      return Result.Err(conn.conn);
    }
    const ret = await getStoreTypeGateway(ctx.loader.sthis, uri).get<S>({ ...ctx, conn }, uri);
    // console.log("get>>>>>>>>>>>>>", conn.conn.Ok().conn, uri.toString(), ret);
    return ret;
  }

  async put<T>(ctx: SerdeGatewayCtx, uri: URI, body: FPEnvelope<T>): Promise<VoidResult> {
    const conn = await this.getCloudConnectionItem(ctx.loader.logger, uri);
    if (conn.conn.isErr()) {
      // console.log("put-conn-err", conn.conn);
      return conn.conn;
    }
    const ret = await getStoreTypeGateway(ctx.loader.sthis, uri).put<T>({ ...ctx, conn }, uri, body);
    // console.log("put-conn-r", ret.isOk());
    if (ret.isOk()) {
      if (uri.getParam("testMode")) {
        conn.citem.trackPuts.add(uri.toString());
      }
    }
    return ret;
  }

  async delete(ctx: SerdeGatewayCtx, uri: URI): Promise<VoidResult> {
    const conn = await this.getCloudConnectionItem(ctx.loader.logger, uri);
    if (conn.conn.isErr()) {
      return conn.conn;
    }
    conn.citem.trackPuts.delete(uri.toString());
    return getStoreTypeGateway(ctx.loader.sthis, uri).delete({ ...ctx, conn }, uri);
  }

  async close(ctx: SerdeGatewayCtx, uri: URI): Promise<VoidResult> {
    const uriStr = uri.toString();
    // CAUTION here is my happen a mutation of subscriptions caused by unsub
    for (const sub of Array.from(subscriptions.values())) {
      for (const s of sub) {
        if (s.uri.toString() === uriStr) {
          s.unsub();
        }
      }
    }
    const rConn = await this.getCloudConnectionItem(ctx.loader.logger, uri);
    if (rConn.conn.isErr()) {
      return this.logger.Error().Err(rConn).Msg("Error in getCloudConnection").ResultError();
    }
    const conn = rConn.conn.Ok();
    const rAuth = await conn.msgConnAuth();
    await conn.close(rAuth.Ok());
    this.#connectionURIs.unget(this.matchURI(uri)());
    return Result.Ok(undefined);
  }

  matchURI(uri: URI): () => string {
    // console.log("getCloudConnectionItem", uri);
    let protocol = uri.getParam("protocol", "https");
    switch (protocol) {
      case "wss":
        protocol = "https";
        break;
      case "ws":
        protocol = "http";
        break;
      case "http":
        break;
      case "https":
      default:
        protocol = "https";
        break;
    }
    const matchURI = BuildURI.from(uri).cleanParams().protocol(protocol).URI().toString();
    return () => {
      return matchURI;
    };
  }

  registerConnectionURI(uri: URI, itemFactory: () => ConnectionItem): void {
    this.#connectionURIs.get(this.matchURI(uri)).once(itemFactory);
  }

  async getCloudConnectionItem(logger: Logger, uri: URI): Promise<AuthedConnection> {
    const item = this.#connectionURIs.get(this.matchURI(uri));
    const bestMatch = item.value;
    if (!item.ready || !bestMatch) {
      return { conn: logger.Error().Url(uri).Msg("Connection not ready").ResultError(), citem: {} as ConnectionItem };
    }
    const conn = await bestMatch.connection.once(async () => {
      const rParams = uri.getParamsResult({
        protocol: "https",
      });
      if (rParams.isErr()) {
        return this.logger.Error().Url(uri).Err(rParams).Msg("getCloudConnection:err").ResultError<MsgConnected>();
      }
      const params = rParams.Ok();
      const rAuth = await authTypeFromUri(this.logger, uri);
      if (rAuth.isErr()) {
        return Result.Err<MsgConnected>(rAuth);
      }
      const qOpen = buildReqOpen(this.sthis, rAuth.Ok(), {});

      const cUrl = uri.build().protocol(params.protocol).cleanParams().URI();
      return Msger.connect(this.sthis, rAuth.Ok(), cUrl, qOpen);
    });
    if (conn.isErr()) {
      return { conn: Result.Err(conn), citem: bestMatch };
    }
    return { conn: Result.Ok(conn.Ok().attachAuth(() => authTypeFromUri(this.logger, uri))), citem: bestMatch };
  }

  async subscribe(ctx: SerdeGatewayCtx, uri: URI, callback: (meta: FPEnvelopeMeta) => Promise<void>): Promise<UnsubscribeResult> {
    const metaGw = getStoreTypeGateway(ctx.loader.sthis, uri) as MetaGateway;

    return metaGw.subscribe(ctx, uri, callback);
  }

  async destroy(ctx: SerdeGatewayCtx, uri: URI): Promise<VoidResult> {
    const item = await this.getCloudConnectionItem(ctx.loader.logger, uri);
    if (item.conn.isErr()) {
      return item.conn;
    }
    await Promise.all(Array.from(item.citem.trackPuts).map(async (k) => this.delete(ctx, URI.from(k))));
    return Result.Ok(undefined);
  }

  async getPlain(): Promise<Result<Uint8Array>> {
    return Result.Err(new Error("Not implemented"));
  }
}
