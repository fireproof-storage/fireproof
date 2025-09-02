import { Result, URI } from "@adviser/cement";
import { NotFoundError, PARAM, SuperThis } from "@fireproof/core-types-base";
import {
  FPEnvelope,
  FPEnvelopeMeta,
  FPEnvelopeSubscriptions,
  FPEnvelopeTypes,
  FPEnvelopeWAL,
  isFPEnvelopeBlob,
  isFPEnvelopeCar,
  isFPEnvelopeFile,
  isFPEnvelopeMeta,
  isFPEnvelopeSubscription,
  isFPEnvelopeWAL,
  SerdeGateway,
  SerdeGatewayCtx,
  SerdeGetResult,
  UnsubscribeResult,
  VoidResult,
} from "@fireproof/core-types-blockstore";
import { MEMORY_VERSION } from "./version.js";
import { ensureLogger } from "@fireproof/core-runtime";
import { dbMetaEvent2Serialized, WALState2Serialized } from "@fireproof/core-gateways-base";

function cleanURI(uri: URI): URI {
  return uri
    .build()
    .cleanParams(
      PARAM.VERSION,
      PARAM.NAME,
      // PARAM.STORE,
      PARAM.STORE_KEY,
      PARAM.SELF_REFLECT,
      PARAM.LOCAL_NAME,
    )
    .URI();
}


export class MemoryGateway implements SerdeGateway {
  readonly id: string;
  readonly memories: Map<string, FPEnvelope<unknown>>;
  readonly sthis: SuperThis;
  // readonly logger: Logger;
  constructor(sthis: SuperThis, memories: Map<string, FPEnvelope<unknown>>) {
    this.memories = memories;
    this.sthis = sthis;
    this.id = this.sthis.nextId().str;
  }

  buildUrl(_ctx: SerdeGatewayCtx, baseUrl: URI, key: string): Promise<Result<URI>> {
    return Promise.resolve(Result.Ok(baseUrl.build().setParam(PARAM.KEY, key).URI()));
  }
  start(ctx: SerdeGatewayCtx, baseUrl: URI): Promise<Result<URI>> {
    return Promise.resolve(Result.Ok(baseUrl.build().setParam(PARAM.VERSION, MEMORY_VERSION).URI()));
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  close(ctx: SerdeGatewayCtx, baseUrl: URI): Promise<VoidResult> {
    return Promise.resolve(Result.Ok(undefined));
  }
  destroy(ctx: SerdeGatewayCtx, baseUrl: URI): Promise<VoidResult> {
    const keyUrl = cleanURI(baseUrl);
    const match = keyUrl.match(keyUrl);
    for (const key of this.memories.keys()) {
      if (keyUrl.match(key).score >= match.score) {
        this.memories.delete(key);
      }
    }
    // this.memorys.clear();
    return Promise.resolve(Result.Ok(undefined));
  }

  buildSubscriptionKey(url: URI): string {
    return cleanURI(url).build().delParam(PARAM.KEY).setParam(PARAM.STORE, FPEnvelopeTypes.SUBSCRIPTIONS).toString();
  }

  async subscribe(ctx: SerdeGatewayCtx, url: URI, callback: (meta: FPEnvelopeMeta) => Promise<void>): Promise<UnsubscribeResult> {
    const key = this.buildSubscriptionKey(url);
    let subs = this.memories.get(key) as FPEnvelopeSubscriptions | undefined
    if (!(subs && isFPEnvelopeSubscription(subs))) {
      subs = { payload: { subs: [] }, type: FPEnvelopeTypes.SUBSCRIPTIONS }
      this.memories.set(key, subs)
    }
    const id = ctx.loader.sthis.nextId().str;
    subs.payload.subs.push({ id, fn: callback })
    if (subs.payload.actualMeta) {
      await callback(subs.payload.actualMeta) 
    }
    return Promise.resolve(Result.Ok(() => {
      const f = subs.payload.subs.findIndex(s => s.id === id)
      subs.payload.subs.splice(f, 1)
    }));
  }

  async put<T>(ctx: SerdeGatewayCtx, iurl: URI, body: FPEnvelope<T>): Promise<VoidResult> {
    const url = cleanURI(iurl);
    // logger.Debug().Url(url).Msg("put");
    switch (true) {
      case isFPEnvelopeBlob(body):
        ensureLogger(ctx.loader.sthis, "MemoryGatewayCar")
          .Debug()
          .Any({ id: this.id, url, len: body.payload.length })
          .Msg("put-car");
        break;
      case isFPEnvelopeMeta(body): {
        ensureLogger(ctx.loader.sthis, "MemoryGatewayMeta").Debug().Any({ id: this.id, url, meta: body.payload }).Msg("put-meta");
        const x = this.memories.get(url.toString());
        if (!(x && isFPEnvelopeMeta(x))) {
          break;
        }
        body.payload.unshift(...x.payload)
        const subKey = this.buildSubscriptionKey(url)
        let subs = this.memories.get(subKey)
        if (!subs) {
          subs = { payload: { subs: [] }, type: FPEnvelopeTypes.SUBSCRIPTIONS }
          this.memories.set(subKey, subs)
        }
        if (isFPEnvelopeSubscription(subs)) {
          subs.payload.actualMeta = body
          for (const s of subs.payload.subs) {
            await s.fn(body)
          } 
        }
        break;
      }
    }
    this.memories.set(url.toString(), body);
    return Result.Ok(undefined);
  }

  log<T>(sthis: SuperThis, url: URI, r: SerdeGetResult<T>): Promise<SerdeGetResult<T>> {
    const out: {
      id: string;
      url: URI;
      notFound?: true;
      meta?: FPEnvelopeMeta["payload"];
      dataLen?: number;
      wal?: FPEnvelopeWAL["payload"];
    } = { id: this.id, url };
    if (r.isErr()) {
      out.notFound = true;
    } else {
      const v = r.Ok();
      switch (true) {
        case isFPEnvelopeMeta(v):
          out.meta = v.payload;
          break;
        case isFPEnvelopeBlob(v):
          out.dataLen = v.payload.length;
          break;
        case isFPEnvelopeWAL(v):
          out.wal = v.payload;
          break;
      }
    }
    switch (true) {
      case url.getParam(PARAM.STORE) === "meta":
        ensureLogger(sthis, "MemoryGatewayMeta")
          .Debug()
          .Any(out)
          .Msg("get-meta");
        break;
      case url.getParam(PARAM.STORE) === "car":
        ensureLogger(sthis, "MemoryGatewayCar")
          .Debug()
          .Any(out)
          .Msg("get-car");
        break;
      case url.getParam(PARAM.STORE) === "wal":
        ensureLogger(sthis, "MemoryGatewayWal")
          .Debug()
          .Any(out)
          .Msg("get-wal");
    }
    return Promise.resolve(r);
  }

  // get could return a NotFoundError if the key is not found
  get<S>(ctx: SerdeGatewayCtx, iurl: URI): Promise<SerdeGetResult<S>> {
    const url = cleanURI(iurl);
    // logger.Debug().Url(url).Msg("get");
    const x = this.memories.get(url.toString()) as FPEnvelope<S> | undefined;
    if (!x) {
      return this.log(ctx.loader.sthis, url, Result.Err(new NotFoundError(`not found: ${url.toString()}`)));
    }
    return this.log(ctx.loader.sthis, url, Result.Ok(x));
  }

  delete(ctx: SerdeGatewayCtx, url: URI): Promise<VoidResult> {
    this.memories.delete(cleanURI(url).toString());
    return Promise.resolve(Result.Ok(undefined));
  }

  async getPlain(ctx: SerdeGatewayCtx, url: URI, key: string): Promise<Result<Uint8Array>> {
    const x = this.memories.get(cleanURI(url).build().setParam(PARAM.KEY, key).toString());
    if (!x) {
      return Result.Err(new NotFoundError("not found"));
    }
    if (!(ctx.encoder && ctx.encoder.car && ctx.encoder.file && ctx.encoder.meta && ctx.encoder.wal)) {
      return Result.Err(new Error("missing encoder"));
    }
    if (!(ctx.decoder && ctx.decoder.meta)) {
      return Result.Err(new Error("missing decoder"));
    }
    switch (true) {
      case isFPEnvelopeCar(x):
        return ctx.encoder.car(ctx.loader.sthis, x.payload);
      case isFPEnvelopeFile(x):
        return ctx.encoder.file(ctx.loader.sthis, x.payload);
      case isFPEnvelopeMeta(x):
        return ctx.encoder.meta(ctx.loader.sthis, await dbMetaEvent2Serialized(ctx.loader.sthis, x.payload));
      case isFPEnvelopeWAL(x):
        return ctx.encoder.wal(ctx.loader.sthis, await WALState2Serialized(ctx.loader.sthis, x.payload));
      default:
        return Result.Err(new Error("unknown envelope type"));
    }
  }
}
