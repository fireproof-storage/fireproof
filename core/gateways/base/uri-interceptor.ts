import { URI, Promisable, Result } from "@adviser/cement";
import { PassThroughGateway } from "./interceptor-gateway.js";
import {
  FPEnvelope,
  FPEnvelopeMeta,
  SerdeGatewayBuildUrlReturn,
  SerdeGatewayCloseReturn,
  SerdeGatewayCtx,
  SerdeGatewayDeleteReturn,
  SerdeGatewayDestroyReturn,
  SerdeGatewayGetReturn,
  SerdeGatewayPutReturn,
  SerdeGatewayStartReturn,
  SerdeGatewaySubscribeReturn,
} from "@fireproof/core-types-blockstore";

export type URIMapper = (uri: URI) => Promisable<Result<URI>>;

export class URIInterceptor extends PassThroughGateway {
  static withMapper(mapper: URIMapper): URIInterceptor {
    return new URIInterceptor().addMapper(mapper);
  }

  readonly #uriMapper = new Set<URIMapper>();

  addMapper(mapper: URIMapper): URIInterceptor {
    this.#uriMapper.add(mapper);
    return this;
  }

  async #map(uri: URI): Promise<Result<URI>> {
    let ret = Result.Ok(uri);
    for (const mapper of this.#uriMapper) {
      ret = await mapper(ret.Ok());
      if (ret.isErr()) {
        return ret;
      }
    }
    return ret;
  }

  async buildUrl(ctx: SerdeGatewayCtx, url: URI, key: string): Promise<Result<SerdeGatewayBuildUrlReturn>> {
    const mappedUrl = await this.#map(url);
    if (mappedUrl.isErr()) {
      return Result.Err(mappedUrl);
    }
    const ret = await super.buildUrl(ctx, mappedUrl.Ok(), key);
    return ret;
  }
  async start(ctx: SerdeGatewayCtx, url: URI): Promise<Result<SerdeGatewayStartReturn>> {
    const mappedUrl = await this.#map(url);
    if (mappedUrl.isErr()) {
      return Result.Err(mappedUrl);
    }
    const ret = await super.start(ctx, mappedUrl.Ok());
    return ret;
  }
  async close(ctx: SerdeGatewayCtx, url: URI): Promise<Result<SerdeGatewayCloseReturn>> {
    const mappedUrl = await this.#map(url);
    if (mappedUrl.isErr()) {
      return Result.Err(mappedUrl);
    }
    const ret = await super.close(ctx, mappedUrl.Ok());
    return ret;
  }
  async delete(ctx: SerdeGatewayCtx, url: URI): Promise<Result<SerdeGatewayDeleteReturn>> {
    const mappedUrl = await this.#map(url);
    if (mappedUrl.isErr()) {
      return Result.Err(mappedUrl);
    }
    const ret = await super.delete(ctx, mappedUrl.Ok());
    return ret;
  }
  async destroy(ctx: SerdeGatewayCtx, url: URI): Promise<Result<SerdeGatewayDestroyReturn>> {
    const mappedUrl = await this.#map(url);
    if (mappedUrl.isErr()) {
      return Result.Err(mappedUrl);
    }
    const ret = await super.destroy(ctx, mappedUrl.Ok());
    return ret;
  }
  async put<T>(ctx: SerdeGatewayCtx, url: URI, body: FPEnvelope<T>): Promise<Result<SerdeGatewayPutReturn<T>>> {
    const mappedUrl = await this.#map(url);
    if (mappedUrl.isErr()) {
      return Result.Err(mappedUrl);
    }
    const ret = await super.put<T>(ctx, mappedUrl.Ok(), body);
    return ret;
  }
  async get<S>(ctx: SerdeGatewayCtx, url: URI): Promise<Result<SerdeGatewayGetReturn<S>>> {
    const mappedUrl = await this.#map(url);
    if (mappedUrl.isErr()) {
      return Result.Err(mappedUrl);
    }
    const ret = await super.get<S>(ctx, mappedUrl.Ok());
    return ret;
  }
  async subscribe(
    ctx: SerdeGatewayCtx,
    url: URI,
    callback: (meta: FPEnvelopeMeta) => Promise<void>,
  ): Promise<Result<SerdeGatewaySubscribeReturn>> {
    const mappedUrl = await this.#map(url);
    if (mappedUrl.isErr()) {
      return Result.Err(mappedUrl);
    }
    const ret = await super.subscribe(ctx, mappedUrl.Ok(), callback);
    return ret;
  }
}
