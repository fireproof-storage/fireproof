// import PartySocket, { PartySocketOptions } from "partysocket";
import {
  Result,
  URI,
  KeyedResolvOnce,
  exception2Result,
  Logger,
  param,
  MatchResult,
  ResolveOnce,
  to_uint8,
  CoerceURI,
} from "@adviser/cement";
import type { Attachable, GatewayUrlsParam, SuperThis } from "../../../types.js";
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
import { ensureLogger, NotFoundError } from "../../../utils.js";
import { Gateway, GetResult } from "../../../blockstore/gateway.js";
import { UnsubscribeResult, VoidResult } from "../../../blockstore/serde-gateway.js";
import { registerStoreProtocol } from "../../../blockstore/register-store-protocol.js";
import { buildReqPutMeta, ReqPutMeta, ResPutMeta } from "../../../protocols/cloud/msg-types-meta.js";

const VERSION = "v0.1-fp-cloud";

export interface StoreTypeGateway {
  get(uri: URI, conn: AuthedConnection): Promise<Result<Uint8Array>>;
  put(uri: URI, body: Uint8Array, conn: AuthedConnection): Promise<Result<void>>;
  delete(uri: URI, conn: AuthedConnection): Promise<Result<void>>;
}

abstract class BaseGateway {
  readonly logger: Logger;
  readonly sthis: SuperThis;
  constructor(sthis: SuperThis, module: string) {
    this.sthis = sthis;
    this.logger = ensureLogger(sthis, module);
  }

  abstract getConn(uri: URI, conn: AuthedConnection): Promise<Result<Uint8Array>>;
  async get(uri: URI, rConn: AuthedConnection): Promise<Result<Uint8Array>> {
    if (rConn.conn.isErr()) {
      return this.logger.Error().Err(rConn.conn).Msg("get").ResultError();
    }
    // this.logger.Debug().Any("conn", conn.key).Msg("get");
    return this.getConn(uri, rConn);
  }

  abstract putConn(uri: URI, body: Uint8Array, conn: AuthedConnection): Promise<Result<void>>;
  async put(uri: URI, body: Uint8Array, rConn: AuthedConnection): Promise<Result<void>> {
    if (rConn.conn.isErr()) {
      return this.logger.Error().Err(rConn.conn).Msg("Error in putConn").ResultError();
    }
    // this.logger.Debug().Any("conn", conn.key).Msg("put");
    return this.putConn(uri, body, rConn);
  }

  abstract delConn(uri: URI, conn: AuthedConnection): Promise<Result<void>>;
  async delete(uri: URI, rConn: AuthedConnection): Promise<Result<void>> {
    // const rConn = await prConn;
    if (rConn.conn.isErr()) {
      return this.logger.Error().Err(rConn).Msg("Error in deleteConn").ResultError();
    }
    // const conn = rConn.Ok();
    // this.logger.Debug().Any("conn", conn.key).Msg("del");
    return this.delConn(uri, rConn);
  }

  // prepareReqSignedUrl(type: string, method: HttpMethods, store: FPStoreTypes, uri: URI, conn: Connection): Result<ReqSignedUrl> {

  //   const sig = {
  //     conn,
  //     params: {
  //       method,
  //       store,
  //       key: uri.getParam("
  //   } satisfies ReqSignedUrl;
  //   return Result.Ok(buildReqSignedUrl(this.sthis, type, sig, conn))
  // }

  async getReqSignedUrl<S extends ResSignedUrl>(
    type: string,
    method: HttpMethods,
    store: FPStoreTypes,
    waitForFn: (msg: MsgBase) => boolean,
    uri: URI,
    conn: AuthedConnection,
  ): Promise<MsgWithError<S>> {
    const rParams = uri.getParamsResult({
      key: param.REQUIRED,
      store: param.REQUIRED,
      path: param.OPTIONAL,
      tenant: param.REQUIRED,
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
    const rsu = {
      tid: this.sthis.nextId().str,
      auth: rAuth.Ok(),
      type,
      // conn: conn.conn,
      tenant: {
        tenant: params.tenant,
        ledger: params.name,
      },
      // tenant: conn.tenant,
      methodParams: {
        method,
        store,
      },
      params: {
        ...params,
        key: params.key,
      },
      version: VERSION,
    } as ReqSignedUrl;
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
  async getConn(uri: URI, conn: AuthedConnection): Promise<Result<Uint8Array>> {
    // type: string, method: HttpMethods, store: FPStoreTypes, waitForFn:
    const rResSignedUrl = await this.getReqSignedUrl<ResGetData>("reqGetData", "GET", "data", MsgIsResGetData, uri, conn);
    if (MsgIsError(rResSignedUrl)) {
      return this.logger.Error().Err(rResSignedUrl).Msg("Error in buildResSignedUrl").ResultError();
    }
    const { signedUrl: downloadUrl } = rResSignedUrl;
    return this.getObject(uri, downloadUrl, conn);
  }
  async putConn(uri: URI, body: Uint8Array, conn: AuthedConnection): Promise<Result<void>> {
    const rResSignedUrl = await this.getReqSignedUrl<ResPutData>("reqPutData", "PUT", "data", MsgIsResPutData, uri, conn);
    if (MsgIsError(rResSignedUrl)) {
      return this.logger.Error().Err(rResSignedUrl).Msg("Error in buildResSignedUrl").ResultError();
    }
    const { signedUrl: uploadUrl } = rResSignedUrl;
    // console.log("putConn", { uploadUrl });
    return this.putObject(uri, uploadUrl, body, conn);
  }
  async delConn(uri: URI, conn: AuthedConnection): Promise<Result<void>> {
    const rResSignedUrl = await this.getReqSignedUrl<ResDelData>("reqDelData", "DELETE", "data", MsgIsResDelData, uri, conn);
    if (MsgIsError(rResSignedUrl)) {
      return this.logger.Error().Err(rResSignedUrl).Msg("Error in buildResSignedUrl").ResultError();
    }
    const { signedUrl: deleteUrl } = rResSignedUrl;
    return this.delObject(uri, deleteUrl, conn);
  }
}

class MetaGateway extends BaseGateway implements StoreTypeGateway {
  constructor(sthis: SuperThis) {
    super(sthis, "MetaGateway");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getConn(uri: URI, conn: AuthedConnection): Promise<Result<Uint8Array>> {
    // const rkey = uri.getParamResult("key");
    // if (rkey.isErr()) {
    //   return Result.Err(rkey.Err());
    // }
    // const rsu = buildReqGetMeta(this.sthis, conn.key, {
    //   ...conn.key,
    //   method: "GET",
    //   store: "meta",
    //   key: rkey.Ok(),
    // });
    // const rRes = await conn.request<ResGetMeta>(rsu, {
    //   waitType: "resGetMeta",
    // });
    // if (rRes.isErr()) {
    //   return Result.Err(rRes.Err());
    // }
    // const res = rRes.Ok();
    // if (MsgIsError(res)) {
    //   return Result.Err(res);
    // }
    // if (res.signedGetUrl) {
    //   return this.getObject(uri, res.signedGetUrl);
    // }
    // return Result.Ok(this.sthis.txt.encode(JSON.stringify(res.metas)));
    return Result.Ok(new Uint8Array());
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async putConn(uri: URI, body: Uint8Array, conn: AuthedConnection): Promise<Result<void>> {
    const bodyRes = Result.Ok(body); // await bs.addCryptoKeyToGatewayMetaPayload(uri, this.sthis, body);
    if (bodyRes.isErr()) {
      return this.logger.Error().Err(bodyRes).Msg("Error in addCryptoKeyToGatewayMetaPayload").ResultError();
    }
    conn.conn.Ok().request<ResPutMeta, ReqPutMeta>(buildReqPutMeta(this.sthis, conn.conn.Ok().authType, uri.getParams()), {
    // const rsu = this.prepareReqSignedUrl(uri, "PUT", conn.key);
    // if (rsu.isErr()) {
    //   return Result.Err(rsu.Err());
    // }


    const dbMetas = JSON.parse(this.sthis.txt.decode(bodyRes.Ok())) as CRDTEntry[];
    this.logger.Debug().Any("dbMetas", dbMetas).Msg("putMeta");
    const req = buildReqPutMeta(this.sthis, conn.key, rsu.Ok().params, dbMetas);
    const res = await conn.request<ResPutMeta>(req, { waitType: "resPutMeta" });
    if (res.isErr()) {
      return Result.Err(res.Err());
    }
    // console.log("putMeta", JSON.stringify({dbMetas, res}));
    // this.logger.Debug().Any("qs", { req, res: res.Ok() }).Msg("putMeta");
    // this.putObject(uri, res.Ok().signedPutUrl, bodyRes.Ok());
    return res;
    // return Result.Ok(undefined);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async delConn(uri: URI, conn: AuthedConnection): Promise<Result<void>> {
    // const rsu = this.prepareReqSignedUrl(uri, "DELETE", conn.key);
    // if (rsu.isErr()) {
    //   return Result.Err(rsu.Err());
    // }
    // const res = await conn.request<ResDelMeta>(buildReqDelMeta(this.sthis, conn.key, rsu.Ok().params), {
    //   waitType: "resDelMeta",
    // });
    // if (res.isErr()) {
    //   return Result.Err(res.Err());
    // }
    // const { signedDelUrl } = res.Ok();
    // if (signedDelUrl) {
    //   return this.delObject(uri, signedDelUrl);
    // }
    // return Result.Ok(undefined);
    return Result.Ok(undefined);
  }
}

class WALGateway extends BaseGateway implements StoreTypeGateway {
  // WAL will not pollute to the cloud
  readonly wals = new Map<string, Uint8Array>();
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
  async getConn(uri: URI): Promise<Result<Uint8Array>> {
    const rKey = this.getWalKeyFromUri(uri);
    if (rKey.isErr()) {
      return Result.Err(rKey.Err());
    }
    const wal = this.wals.get(rKey.Ok());
    if (!wal) {
      return Result.Err(new NotFoundError("Not found"));
    }
    return Result.Ok(wal);
  }
  async putConn(uri: URI, body: Uint8Array): Promise<Result<void>> {
    const rKey = this.getWalKeyFromUri(uri);
    if (rKey.isErr()) {
      return Result.Err(rKey.Err());
    }
    this.wals.set(rKey.Ok(), body);
    return Result.Ok(undefined);
  }
  async delConn(uri: URI): Promise<Result<void>> {
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
    case "data":
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
  readonly uri: URI;
  readonly matchRes: MatchResult;
  readonly connection: ResolveOnce<Result<MsgConnected>>;
  readonly trackPuts: Set<string>;
}

interface AuthedConnection {
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
function connectionURI(uri: URI): URI {
  return uri.build().delParam("authJWK").delParam("key").delParam("store").URI();
}

const subscriptions = new Map<string, Subscription[]>();
// const doServerSubscribe = new KeyedResolvOnce();
export class FireproofCloudGateway implements Gateway {
  readonly logger: Logger;
  readonly sthis: SuperThis;
  readonly #connectionURIs = new Map<string, ConnectionItem>();

  constructor(sthis: SuperThis) {
    this.sthis = sthis;
    this.logger = ensureLogger(sthis, "FireproofCloudGateway", {
      this: true,
    });
  }

  async buildUrl(baseUrl: URI, key: string): Promise<Result<URI>> {
    return Result.Ok(baseUrl.build().setParam("key", key).URI());
  }

  async start(uri: URI): Promise<Result<URI>> {
    await this.sthis.start();
    const ret = uri.build().defParam("version", VERSION);
    const rName = uri.getParamResult("name");
    if (rName.isErr()) {
      return this.logger.Error().Err(rName).Msg("name not found").ResultError();
    }
    ret.defParam("protocol", "wss");
    const retURI = ret.URI();
    const matchURI = connectionURI(retURI);
    this.#connectionURIs.set(matchURI.toString(), {
      uri: matchURI,
      matchRes: matchURI.match(matchURI),
      connection: new ResolveOnce<Result<MsgConnected>>(),
      trackPuts: new Set<string>(),
    });
    return Result.Ok(retURI);
  }

  async get(uri: URI, sthis: SuperThis): Promise<GetResult> {
    const ret = await getStoreTypeGateway(sthis, uri).get(uri, await this.getCloudConnectionItem(uri));
    // console.log("get>>>>>>>>>>>>>", uri.toString(), ret);
    return ret;
  }

  async put(uri: URI, body: Uint8Array, sthis: SuperThis): Promise<Result<void>> {
    const item = await this.getCloudConnectionItem(uri);
    const ret = await getStoreTypeGateway(sthis, uri).put(uri, body, item);
    if (ret.isOk()) {
      if (uri.getParam("testMode")) {
        item.citem.trackPuts.add(uri.toString());
      }
    }
    return ret;
  }

  async delete(uri: URI, sthis: SuperThis): Promise<VoidResult> {
    const item = await this.getCloudConnectionItem(uri);
    item.citem.trackPuts.delete(uri.toString());
    return getStoreTypeGateway(sthis, uri).delete(uri, item);
  }

  async close(uri: URI): Promise<VoidResult> {
    const uriStr = uri.toString();
    // CAUTION here is my happen a mutation of subscriptions caused by unsub
    for (const sub of Array.from(subscriptions.values())) {
      for (const s of sub) {
        if (s.uri.toString() === uriStr) {
          s.unsub();
        }
      }
    }
    const rConn = await this.getCloudConnectionItem(uri);
    if (rConn.conn.isErr()) {
      return this.logger.Error().Err(rConn).Msg("Error in getCloudConnection").ResultError();
    }
    const conn = rConn.conn.Ok();
    const rAuth = await conn.msgConnAuth();
    await conn.close(rAuth.Ok());
    this.#connectionURIs.delete(rConn.citem.uri.toString());
    return Result.Ok(undefined);
  }

  // fireproof://localhost:1999/?name=test-public-api&protocol=ws&store=meta
  async getCloudConnection(uri: URI): Promise<Result<MsgConnectedAuth>> {
    return this.getCloudConnectionItem(uri).then((r) => {
      return r.conn;
    });
  }

  async getCloudConnectionItem(uri: URI): Promise<AuthedConnection> {
    const matchURI = connectionURI(uri);
    let bestMatch: ConnectionItem | undefined;
    for (const ci of this.#connectionURIs.values()) {
      const mci = ci.uri.match(matchURI);
      if (mci.score >= ci.matchRes.score) {
        bestMatch = ci;
        break;
      }
    }
    if (!bestMatch) {
      return {
        conn: this.logger.Error().Url(matchURI).Msg("No connection found").ResultError(),
        citem: {} as ConnectionItem,
      };
    }
    const conn = await bestMatch.connection.once(async () => {
      const rParams = uri.getParamsResult({
        name: param.REQUIRED,
        protocol: "https",
        store: param.REQUIRED,
        storekey: param.OPTIONAL,
        tenant: param.REQUIRED,
      });
      if (rParams.isErr()) {
        return this.logger.Error().Url(uri).Err(rParams).Msg("getCloudConnection:err").ResultError<MsgConnected>();
      }
      const params = rParams.Ok();
      // let tenant: string;
      // if (params.tenant) {
      //   tenant = params.tenant;
      // } else {
      //   if (!params.storekey) {
      //     return this.logger.Error().Url(uri).Msg("no tendant or storekey given").ResultError();
      //   }
      //   const dataKey = params.storekey.replace(/:(meta|wal)@$/, `:data@`);
      //   const kb = await rt.kb.getKeyBag(this.sthis);
      //   const rfingerprint = await kb.getNamedKey(dataKey);
      //   if (rfingerprint.isErr()) {
      //     return this.logger.Error().Err(rfingerprint).Msg("Error in getNamedKey").ResultError();
      //   }
      //   tenant = rfingerprint.Ok().fingerPrint;
      // }

      const rAuth = await authTypeFromUri(this.logger, uri);
      if (rAuth.isErr()) {
        return Result.Err<MsgConnected>(rAuth);
      }

      const qOpen = buildReqOpen(this.sthis, rAuth.Ok(), {});

      const cUrl = uri.build().protocol(params.protocol).cleanParams().URI();
      // if (cUrl.pathname === "/") {
      //   cUrl = cUrl.build().pathname("/fp").URI();
      // }
      return Msger.connect(this.sthis, rAuth.Ok(), cUrl, qOpen);
    });
    if (conn.isErr()) {
      return { conn: Result.Err(conn), citem: bestMatch };
    }
    return { conn: Result.Ok(conn.Ok().attachAuth(() => authTypeFromUri(this.logger, uri))), citem: bestMatch };
    //  keyedConnections.get(keyTenantLedger(qOpen.conn.key)).once(async () => Msger.open(this.sthis, cUrl, qOpen));
  }

  // private notifySubscribers(data: Uint8Array, callbacks: ((msg: Uint8Array) => void)[] = []): void {
  //   for (const cb of callbacks) {
  //     try {
  //       cb(data);
  //     } catch (error) {
  //       this.logger.Error().Err(error).Msg("Error in subscriber callback execution");
  //     }
  //   }
  // }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async subscribe(uri: URI, callback: (meta: Uint8Array) => void): Promise<UnsubscribeResult> {
    return Result.Err(new Error("Not implemented"));
    // const rParams = uri.getParamsResult({
    //   store: 0,
    //   storekey: 0,
    // });
    // if (rParams.isErr()) {
    //   return this.logger.Error().Err(rParams).Msg("Error in subscribe").ResultError();
    // }
    // const { store } = rParams.Ok();
    // if (store !== "meta") {
    //   return Result.Err(new Error("store must be meta"));
    // }
    // const rConn = await this.getCloudConnection(uri);
    // if (rConn.isErr()) {
    //   return this.logger.Error().Err(rConn).Msg("Error in subscribe:getCloudConnection").ResultError();
    // }
    // const conn = rConn.Ok();
    // const rResSubscribeMeta = await doServerSubscribe.get(pkKey(conn.key)).once(async () => {
    //   const subId = this.sthis.nextId().str;
    //   const fn = (subId: string) => (msg: MsgBase) => {
    //     if (MsgIsUpdateMetaEvent(msg) && subId === msg.subscriberId) {
    //       // console.log("onMessage", subId, conn.key, msg.metas);
    //       const s = subscriptions.get(subId);
    //       if (!s) {
    //         return;
    //       }
    //       console.log("msg", JSON.stringify(msg));
    //       this.notifySubscribers(
    //         this.sthis.txt.encode(JSON.stringify(msg.metas)),
    //         s.map((s) => s.callback)
    //       );
    //     }
    //   };
    //   conn.onMessage(fn(subId));
    //   return conn.request<ResSubscribeMeta>(buildReqSubscriptMeta(this.sthis, conn.key, subId), {
    //     waitType: "resSubscribeMeta",
    //   });
    // });
    // if (rResSubscribeMeta.isErr()) {
    //   return this.logger.Error().Err(rResSubscribeMeta).Msg("Error in subscribe:request").ResultError();
    // }
    // const subId = rResSubscribeMeta.Ok().subscriberId;
    // let callbacks = subscriptions.get(subId);
    // if (!callbacks) {
    //   callbacks = [];
    //   subscriptions.set(subId, callbacks);
    // }
    // const sid = this.sthis.nextId().str;
    // const unsub = () => {
    //   const idx = callbacks.findIndex((c) => c.sid === sid);
    //   if (idx !== -1) {
    //     callbacks.splice(idx, 1);
    //   }
    //   if (callbacks.length === 0) {
    //     subscriptions.delete(subId);
    //   }
    // };
    // callbacks.push({ uri: uri.toString(), callback, sid, unsub });
    // return Result.Ok(unsub);
  }

  async destroy(uri: URI, sthis: SuperThis): Promise<Result<void>> {
    const item = await this.getCloudConnectionItem(uri);
    await Promise.all(Array.from(item.citem.trackPuts).map(async (k) => this.delete(URI.from(k), sthis)));
    return Result.Ok(undefined);
  }

  async getPlain(): Promise<Result<Uint8Array>> {
    return Result.Err(new Error("Not implemented"));
    // const url = uri.build().setParam("key", key).URI();
    // const dbFile = this.sthis.pathOps.join(rt.getPath(url, this.sthis), rt.getFileName(url, this.sthis));
    // this.logger.Debug().Url(url).Str("dbFile", dbFile).Msg("get");
    // const buffer = await this.gateway.get(url);
    // this.logger.Debug().Url(url).Str("dbFile", dbFile).Len(buffer).Msg("got");
    // return buffer.Ok();
  }
}

const onceRegisterFireproofCloudStoreProtocol = new KeyedResolvOnce<() => void>();
export function registerFireproofCloudStoreProtocol(protocol = "fpcloud:") {
  return onceRegisterFireproofCloudStoreProtocol.get(protocol).once(() => {
    URI.protocolHasHostpart(protocol);
    return registerStoreProtocol({
      protocol,
      defaultURI() {
        return URI.from("fpcloud://fireproof.cloud/");
      },
      gateway: async (sthis: SuperThis) => {
        return new FireproofCloudGateway(sthis);
      },
    });
  });
}

registerFireproofCloudStoreProtocol();

export function toCloud(url: CoerceURI): Attachable {
  const urlObj = URI.from(url);
  if (urlObj.protocol !== "fpcloud:") {
    throw new Error("url must have fireproof protocol");
  }
  // const existingName = urlObj.getParam("name");
  // urlObj.defParam("name", remoteDbName || existingName || dbName);
  // urlObj.defParam("localName", dbName);
  // urlObj.defParam("storekey", `@${dbName}:data@`);
  return {
    name: urlObj.protocol,
    prepare(): Promise<GatewayUrlsParam> {
      return Promise.resolve({
        car: { url: urlObj },
        file: { url: urlObj },
        meta: { url: urlObj },
      });
    },
  };
}
