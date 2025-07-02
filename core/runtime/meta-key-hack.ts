import { exception2Result, Result, URI } from "@adviser/cement";
import { SerializedMeta } from "./gateways/fp-envelope-serialize.js";
import { SerdeGateway, SerdeGatewayCtx } from "../blockstore/serde-gateway.js";
import { PARAM, SuperThis } from "../types.js";
import { FPEnvelope, FPEnvelopeMeta } from "../blockstore/fp-envelope.js";
import { NotFoundError } from "../utils.js";
import { DefSerdeGateway } from "./gateways/def-serde-gateway.js";
import { Gateway } from "../blockstore/gateway.js";
import { Loadable } from "../blockstore/types.js";

type V1SerializedMetaKey = SerializedMeta & {
  // old version
  readonly key?: string | string[];
  // new version
  readonly keys?: string[];
};

export interface V2SerializedMetaKey {
  readonly metas: SerializedMeta[];
  readonly keys: string[];
}

// type SerializedMetaWithKey = V1SerializedMetaKey[] | V2SerializedMetaKey;

function fromV1toV2SerializedMetaKey(v1s: unknown[], keys: string[] = []): V2SerializedMetaKey {
  const res = (v1s as Partial<V1SerializedMetaKey>[]).reduce(
    (acc, v1) => {
      const keys: string[] = [];
      if (v1.key) {
        if (typeof v1.key === "string") {
          acc.keys.add(v1.key);
        } else {
          keys.push(...v1.key);
        }
      }
      if (v1.keys) {
        keys.push(...v1.keys);
      }
      for (const key of keys) {
        acc.keys.add(key);
      }
      if (typeof v1.cid === "string" && (!v1.data || typeof v1.data === "string") && (!v1.parents || Array.isArray(v1.parents))) {
        acc.metas.set(v1.cid, {
          data: v1.data ?? "",
          parents: v1.parents ?? [],
          cid: v1.cid,
        });
      }
      return acc;
    },
    {
      metas: new Map<string, SerializedMeta>(),
      keys: new Set<string>(keys),
    },
  );
  return {
    metas: Array.from(res.metas.values()),
    keys: Array.from(res.keys),
  };
}

function isV2SerializedMetaKey(or: NonNullable<unknown>): or is Partial<V2SerializedMetaKey> {
  const my = or as Partial<V2SerializedMetaKey>;
  return my !== null && (!my.keys || Array.isArray(my.keys)) && (!my.metas || Array.isArray(my.metas));
}

function toV2SerializedMetaKey(or: NonNullable<unknown>): V2SerializedMetaKey {
  if (Array.isArray(or)) {
    return fromV1toV2SerializedMetaKey(or);
  }
  if (isV2SerializedMetaKey(or)) {
    return fromV1toV2SerializedMetaKey(or.metas ?? [], or.keys ?? []);
  }
  throw new Error("not a valid serialized meta key");
}

export async function V2SerializedMetaKeyExtractKey(
  ctx: SerdeGatewayCtx,
  v2: V2SerializedMetaKey,
): Promise<Result<SerializedMeta[]>> {
  const kb = await ctx.loader.keyBag();
  if (!kb) {
    return Promise.resolve(Result.Err(new Error("missing keybag")));
  }
  const dataUrl = await ctx.loader.attachedStores.local().active.car.url();
  const keyName = dataUrl.getParam(PARAM.STORE_KEY);
  if (!keyName) {
    ctx.loader.sthis.logger.Warn().Url(dataUrl).Msg("missing store key");
  } else {
    const rKey = await kb.getNamedKey(keyName);
    if (rKey.isErr()) {
      ctx.loader.sthis.logger.Warn().Str("keyName", keyName).Msg("did not found a extractable key");
    } else {
      for (const keyStr of v2.keys) {
        // side effect: in the keybag
        // this is the key gossip protocol
        // it basically collects all the keys that are used distributed metas
        const res = await rKey.Ok().upsert(keyStr, false);
        if (res.isErr()) {
          ctx.loader.sthis.logger.Warn().Str("keyStr", keyStr).Msg("failed to upsert key");
        }
      }
    }
  }
  return Promise.resolve(Result.Ok(v2.metas));
}

export async function decodeAsToSerializedMeta(ctx: SerdeGatewayCtx, raw: Uint8Array): Promise<Result<V2SerializedMetaKey>> {
  const rJsObj = exception2Result(() => JSON.parse(ctx.loader.sthis.txt.decode(raw))) as Result<NonNullable<unknown>>;
  if (rJsObj.isErr()) {
    return Result.Err(rJsObj);
  }
  const v2 = toV2SerializedMetaKey(rJsObj.unwrap());
  const metas = await V2SerializedMetaKeyExtractKey(ctx, v2);
  if (metas.isErr()) {
    return Result.Err(metas);
  }
  return Result.Ok({
    metas: metas.Ok(),
    keys: v2.keys,
  });
}

export function addKeyToDbMetaDecoder(
  ctx: SerdeGatewayCtx & { readonly lastDecodedMetas?: V2SerializedMetaKey[] },
): SerdeGatewayCtx & { lastDecodedMetas: V2SerializedMetaKey[] } {
  const lastDecodedMetas: V2SerializedMetaKey[] = ctx.lastDecodedMetas ?? [];
  return {
    ...ctx,
    lastDecodedMetas,
    decoder: {
      meta: async (sthis: SuperThis, raw: Uint8Array): Promise<Result<SerializedMeta[]>> => {
        const r = await decodeAsToSerializedMeta(ctx, raw);
        if (r.isErr()) {
          return Promise.resolve(Result.Err(r));
        }
        // we only want to keep the last 2 metas
        if (lastDecodedMetas.length > 2) {
          lastDecodedMetas.shift();
        }
        lastDecodedMetas.push(r.Ok());
        return Promise.resolve(Result.Ok(r.Ok().metas));
      },
    },
  };
}

async function wrapEncode<T extends V1SerializedMetaKey[] | V2SerializedMetaKey>(
  ctx: SerdeGatewayCtx,
  payload: SerializedMeta[],
  fn: (payload: SerializedMeta[], keyM: string[]) => T,
): Promise<Result<T>> {
  const carStore = ctx.loader.attachedStores.local().active.car;
  const kb = await ctx.loader.keyBag();
  if (!kb) {
    return Promise.resolve(Result.Err(new Error("missing keybag")));
  }
  const keyName = carStore.url().getParam(PARAM.STORE_KEY) ?? "";
  const rKex = await kb.getNamedKey(keyName);
  if (rKex.isErr()) {
    return Promise.resolve(Result.Err(rKex.Err()));
  }
  /* security: we don't want to log the key */
  const keyMaterials = await rKex
    .Ok()
    .asKeysItem()
    .then((i) => Object.values(i.keys).map((i) => i.key));

  return Promise.resolve(Result.Ok(fn(payload, keyMaterials)));
}

export function encodeAsV1SerializedMetaKey(
  ctx: SerdeGatewayCtx,
  payload: SerializedMeta[],
): Promise<Result<V1SerializedMetaKey[]>> {
  return wrapEncode(ctx, payload, (payload, keyM) => payload.map((p) => ({ ...p, key: keyM }) satisfies V1SerializedMetaKey));
}

export function encodeAsV2SerializedMetaKey(ctx: SerdeGatewayCtx, payload: SerializedMeta[]): Promise<Result<V2SerializedMetaKey>> {
  return wrapEncode(
    ctx,
    payload,
    (payload, keyM) =>
      ({
        metas: payload,
        keys: keyM,
      }) satisfies V2SerializedMetaKey,
  );
}

export function addKeyToDbMetaEncoder(ctx: SerdeGatewayCtx, version: "v1" | "v2"): SerdeGatewayCtx {
  return {
    ...ctx,
    encoder: {
      meta: async (sthis: SuperThis, payload: SerializedMeta[]): Promise<Result<Uint8Array>> => {
        let obj: Result<V1SerializedMetaKey[] | V2SerializedMetaKey>;
        switch (version) {
          case "v1":
            obj = await encodeAsV1SerializedMetaKey(ctx, payload);
            break;
          case "v2":
            obj = await encodeAsV2SerializedMetaKey(ctx, payload);
            break;
          default:
            return Promise.resolve(Result.Err(`unknown version:[${version}]`));
        }
        if (obj.isErr()) {
          return Promise.resolve(Result.Err(obj));
        }
        try {
          return Promise.resolve(Result.Ok(sthis.txt.encode(JSON.stringify(obj.Ok()))));
        } catch (e) {
          return Promise.resolve(Result.Err(e as Error));
        }
      },
    },
  };
}

export class AddKeyToDbMetaGateway implements SerdeGateway {
  private readonly sdGw: DefSerdeGateway;
  readonly version: "v1" | "v2";
  constructor(gw: Gateway, version: "v1" | "v2") {
    this.sdGw = new DefSerdeGateway(gw);
    this.version = version;
  }

  buildUrl(ctx: SerdeGatewayCtx, baseUrl: URI, key: string): Promise<Result<URI>> {
    return this.sdGw.buildUrl(ctx, baseUrl, key);
  }
  start(ctx: SerdeGatewayCtx, baseUrl: URI): Promise<Result<URI>> {
    return this.sdGw.start(ctx, baseUrl);
  }
  close(ctx: SerdeGatewayCtx, baseUrl: URI): Promise<Result<void, Error>> {
    return this.sdGw.close(ctx, baseUrl);
  }
  async put<T>(ctx: SerdeGatewayCtx, url: URI, body: FPEnvelope<T>): Promise<Result<void, Error>> {
    return this.sdGw.put(addKeyToDbMetaEncoder(ctx, this.version), url, body);
  }
  async get<S>(ctx: SerdeGatewayCtx, url: URI): Promise<Result<FPEnvelope<S>, Error | NotFoundError>> {
    return this.sdGw.get(addKeyToDbMetaDecoder({ ...ctx, lastDecodedMetas: this.lastDecodedMetas }), url);
  }

  // only for tests
  readonly lastDecodedMetas: V2SerializedMetaKey[] = [];

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  delete(ctx: SerdeGatewayCtx, url: URI, loader?: Loadable): Promise<Result<void, Error>> {
    return this.sdGw.delete(ctx, url);
  }
  subscribe(ctx: SerdeGatewayCtx, url: URI, callback: (meta: FPEnvelopeMeta) => Promise<void>): Promise<Result<() => void, Error>> {
    return this.sdGw.subscribe(addKeyToDbMetaDecoder({ ...ctx, lastDecodedMetas: this.lastDecodedMetas }), url, callback);
  }
  getPlain(ctx: SerdeGatewayCtx, url: URI, key: string): Promise<Result<Uint8Array>> {
    return this.sdGw.getPlain(ctx, url, key);
  }
  destroy(ctx: SerdeGatewayCtx, baseUrl: URI): Promise<Result<void, Error>> {
    return this.sdGw.destroy(ctx, baseUrl);
  }
}
