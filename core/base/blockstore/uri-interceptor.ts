import { URI, Promisable, Result } from "@adviser/cement";
import { PassThroughGateway } from "./interceptor-gateway.js";
import {
  SerdeGatewayBuildUrlReturn,
  SerdeGatewayCloseReturn,
  SerdeGatewayCtx,
  SerdeGatewayDeleteReturn,
  SerdeGatewayDestroyReturn,
  SerdeGatewayGetReturn,
  SerdeGatewayPutReturn,
  SerdeGatewayStartReturn,
  SerdeGatewaySubscribeReturn,
} from "./serde-gateway.js";
import { FPEnvelope, FPEnvelopeMeta } from "./fp-envelope.js";

export type URIMapper = (uri: URI) => Promisable<URI>;

export class URIInterceptor extends PassThroughGateway {
  static withMapper(mapper: URIMapper): URIInterceptor {
    return new URIInterceptor().addMapper(mapper);
  }

  readonly #uriMapper = new Set<URIMapper>();

  addMapper(mapper: URIMapper): URIInterceptor {
    this.#uriMapper.add(mapper);
    return this;
  }

  async #map(uri: URI): Promise<URI> {
    let ret = uri;
    for (const mapper of this.#uriMapper) {
      ret = await mapper(ret);
    }
    return ret;
  }

  async buildUrl(ctx: SerdeGatewayCtx, url: URI, key: string): Promise<Result<SerdeGatewayBuildUrlReturn>> {
    const ret = await super.buildUrl(ctx, await this.#map(url), key);
    return ret;
  }
  async start(ctx: SerdeGatewayCtx, url: URI): Promise<Result<SerdeGatewayStartReturn>> {
    const ret = await super.start(ctx, await this.#map(url));
    return ret;
  }
  async close(ctx: SerdeGatewayCtx, url: URI): Promise<Result<SerdeGatewayCloseReturn>> {
    const ret = await super.close(ctx, await this.#map(url));
    return ret;
  }
  async delete(ctx: SerdeGatewayCtx, url: URI): Promise<Result<SerdeGatewayDeleteReturn>> {
    const ret = await super.delete(ctx, await this.#map(url));
    return ret;
  }
  async destroy(ctx: SerdeGatewayCtx, url: URI): Promise<Result<SerdeGatewayDestroyReturn>> {
    const ret = await super.destroy(ctx, await this.#map(url));
    return ret;
  }
  async put<T>(ctx: SerdeGatewayCtx, url: URI, body: FPEnvelope<T>): Promise<Result<SerdeGatewayPutReturn<T>>> {
    const ret = await super.put<T>(ctx, await this.#map(url), body);
    return ret;
  }
  async get<S>(ctx: SerdeGatewayCtx, url: URI): Promise<Result<SerdeGatewayGetReturn<S>>> {
    const ret = await super.get<S>(ctx, await this.#map(url));
    return ret;
  }
  async subscribe(
    ctx: SerdeGatewayCtx,
    url: URI,
    callback: (meta: FPEnvelopeMeta) => Promise<void>,
  ): Promise<Result<SerdeGatewaySubscribeReturn>> {
    const ret = await super.subscribe(ctx, await this.#map(url), callback);
    return ret;
  }
}
