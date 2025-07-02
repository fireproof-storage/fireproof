import { Result, URI } from "@adviser/cement";
import { Gateway, GetResult } from "../../../blockstore/gateway.js";
import { PARAM, SuperThis } from "../../../types.js";
import { MEMORY_VERSION } from "./version.js";
import { ensureLogger, NotFoundError } from "../../../utils.js";
import { VoidResult } from "../../../blockstore/serde-gateway.js";

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

export class MemoryGateway implements Gateway {
  readonly memories: Map<string, Uint8Array>;
  readonly sthis: SuperThis;
  // readonly logger: Logger;
  constructor(sthis: SuperThis, memories: Map<string, Uint8Array>) {
    this.memories = memories;
    this.sthis = sthis;
  }

  buildUrl(baseUrl: URI, key: string): Promise<Result<URI>> {
    return Promise.resolve(Result.Ok(baseUrl.build().setParam(PARAM.KEY, key).URI()));
  }
  start(baseUrl: URI): Promise<Result<URI>> {
    return Promise.resolve(Result.Ok(baseUrl.build().setParam(PARAM.VERSION, MEMORY_VERSION).URI()));
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  close(baseUrl: URI): Promise<VoidResult> {
    return Promise.resolve(Result.Ok(undefined));
  }
  destroy(baseUrl: URI): Promise<VoidResult> {
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

  // subscribe(url: URI, callback: (meta: Uint8Array) => void, sthis: SuperThis): Promise<UnsubscribeResult> {
  //   console.log("subscribe", url.toString());
  //   const callbackKey = `callbacks:${cleanURI(url).toString()}`;
  //   const callbacks = (this.memories.get(callbackKey) as Callbacks) ?? new Map<string, Callbacks>();
  //   const key = sthis.nextId().str;
  //   callbacks.set(key, callback);
  //   return Promise.resolve(
  //     Result.Ok(() => {
  //       callbacks.delete(key);
  //       if (callbacks.size === 0) {
  //         this.memories.delete(callbackKey);
  //       }
  //     }),
  //   );
  // }

  async put(url: URI, bytes: Uint8Array, sthis: SuperThis): Promise<VoidResult> {
    // logger.Debug().Url(url).Msg("put");
    if (url.getParam(PARAM.STORE) === "car") {
      const logger = ensureLogger(sthis, "MemoryGatewayCar");
      logger.Debug().Url(url).Msg("put-car");
    }
    if (url.getParam(PARAM.STORE) === "meta") {
      const logger = ensureLogger(sthis, "MemoryGatewayMeta");
      logger.Debug().Url(url).Msg("put-meta");
      // if (url.hasParam(PARAM.SELF_REFLECT)) {
      //   const callbackKey = `callbacks:${cleanURI(url).toString()}`;
      //   const callbacks = this.memories.get(callbackKey) as Callbacks;
      //   if (callbacks) {
      //     for (const callback of callbacks.values()) {
      //       callback(bytes);
      //     }
      //   }
      // }
    }
    this.memories.set(cleanURI(url).toString(), bytes);
    return Result.Ok(undefined);
  }
  // get could return a NotFoundError if the key is not found
  get(url: URI, sthis: SuperThis): Promise<GetResult> {
    // logger.Debug().Url(url).Msg("get");
    const x = this.memories.get(cleanURI(url).toString());
    if (!x) {
      // const possible = Array.from(this.memorys.keys()).filter(i => i.startsWith(url.build().cleanParams().toString()))
      // this.sthis.logger.Warn().Any("possible", possible).Url(url).Msg("not found");
      return Promise.resolve(Result.Err(new NotFoundError(`not found: ${url.toString()}`)));
    }
    const logger = ensureLogger(sthis, "MemoryGateway");
    if (url.getParam(PARAM.STORE) === "meta") {
      logger.Debug().Url(url).Msg("get-meta");
    }
    if (url.getParam(PARAM.STORE) === "car") {
      logger.Debug().Url(url).Msg("get-car");
    }
    return Promise.resolve(Result.Ok(x));
  }
  delete(url: URI): Promise<VoidResult> {
    this.memories.delete(cleanURI(url).toString());
    return Promise.resolve(Result.Ok(undefined));
  }

  async getPlain(url: URI, key: string): Promise<Result<Uint8Array>> {
    const x = this.memories.get(cleanURI(url).build().setParam(PARAM.KEY, key).toString());
    if (!x) {
      return Result.Err(new NotFoundError("not found"));
    }
    return Result.Ok(x);
  }
}
