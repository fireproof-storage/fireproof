import { Result, URI } from "@adviser/cement";
import type {
  SerdeGateway,
  SerdeGatewayBuildUrlReturn,
  SerdeGatewayCloseReturn,
  SerdeGatewayCtx,
  SerdeGatewayDeleteReturn,
  SerdeGatewayDestroyReturn,
  SerdeGatewayGetReturn,
  SerdeGatewayInterceptor,
  SerdeGatewayPutReturn,
  SerdeGatewayStartReturn,
  SerdeGatewaySubscribeReturn,
  SerdeGetResult,
  UnsubscribeResult,
  VoidResult,
} from "./serde-gateway.js";
import type { SuperThis } from "../types.js";
import { FPEnvelope, FPEnvelopeMeta } from "./fp-envelope.js";

export class PassThroughGateway implements SerdeGatewayInterceptor {
  async buildUrl(ctx: SerdeGatewayCtx, url: URI, key: string): Promise<Result<SerdeGatewayBuildUrlReturn>> {
    const op = { url, key };
    return Result.Ok({ op });
  }
  async start(ctx: SerdeGatewayCtx, url: URI): Promise<Result<SerdeGatewayStartReturn>> {
    const op = { url };
    return Result.Ok({ op });
  }
  async close(ctx: SerdeGatewayCtx, url: URI): Promise<Result<SerdeGatewayCloseReturn>> {
    const op = { url };
    return Result.Ok({ op });
  }
  async delete(ctx: SerdeGatewayCtx, url: URI): Promise<Result<SerdeGatewayDeleteReturn>> {
    const op = { url };
    return Result.Ok({ op });
  }
  async destroy(ctx: SerdeGatewayCtx, url: URI): Promise<Result<SerdeGatewayDestroyReturn>> {
    const op = { url };
    return Result.Ok({ op });
  }
  async put<T>(ctx: SerdeGatewayCtx, url: URI, body: FPEnvelope<T>): Promise<Result<SerdeGatewayPutReturn<T>>> {
    const op = { url, body };
    return Result.Ok({ op });
  }
  async get<S>(ctx: SerdeGatewayCtx, url: URI): Promise<Result<SerdeGatewayGetReturn<S>>> {
    const op = { url };
    return Result.Ok({ op });
  }
  async subscribe(
    ctx: SerdeGatewayCtx,
    url: URI,
    callback: (meta: FPEnvelopeMeta) => Promise<void>,
  ): Promise<Result<SerdeGatewaySubscribeReturn>> {
    const op = { url, callback };
    return Result.Ok({ op });
  }
}

const passThrougthGateway = new PassThroughGateway();

export class InterceptorGateway implements SerdeGateway {
  readonly innerGW: SerdeGateway;
  readonly interceptor: SerdeGatewayInterceptor;

  constructor(sthis: SuperThis, innerGW: SerdeGateway, interceptor: SerdeGatewayInterceptor | undefined) {
    this.innerGW = innerGW;
    this.interceptor = interceptor || passThrougthGateway;
  }

  async buildUrl(ctx: SerdeGatewayCtx, baseUrl: URI, key: string): Promise<Result<URI>> {
    const rret = await this.interceptor.buildUrl(ctx, baseUrl, key);
    if (rret.isErr()) {
      return Result.Err(rret.Err());
    }
    const ret = rret.unwrap();
    if (ret.stop && ret.value) {
      return ret.value;
    }
    return this.innerGW.buildUrl(ctx, ret.op.url, ret.op.key);
  }

  async destroy(ctx: SerdeGatewayCtx, iurl: URI): Promise<Result<void>> {
    const rret = await this.interceptor.destroy(ctx, iurl);
    if (rret.isErr()) {
      return Result.Err(rret.Err());
    }
    const ret = rret.unwrap();
    if (ret.stop && ret.value) {
      return ret.value;
    }
    return this.innerGW.destroy(ctx, ret.op.url);
  }

  async start(ctx: SerdeGatewayCtx, url: URI): Promise<Result<URI>> {
    const rret = await this.interceptor.start(ctx, url);
    if (rret.isErr()) {
      return Result.Err(rret.Err());
    }
    const ret = rret.unwrap();
    if (ret.stop && ret.value) {
      return ret.value;
    }
    return await this.innerGW.start(ctx, ret.op.url);
  }

  async close(ctx: SerdeGatewayCtx, url: URI): Promise<VoidResult> {
    const rret = await this.interceptor.close(ctx, url);
    if (rret.isErr()) {
      return Result.Err(rret.Err());
    }
    const ret = rret.unwrap();
    if (ret.stop && ret.value) {
      return ret.value;
    }
    return await this.innerGW.close(ctx, ret.op.url);
  }

  async put<T>(ctx: SerdeGatewayCtx, url: URI, fpEnv: FPEnvelope<T>): Promise<VoidResult> {
    const rret = await this.interceptor.put(ctx, url, fpEnv);
    if (rret.isErr()) {
      return Result.Err(rret.Err());
    }
    const ret = rret.unwrap();
    if (ret.stop && ret.value) {
      return ret.value;
    }
    return this.innerGW.put(ctx, ret.op.url, ret.op.body);
  }

  async get<S>(ctx: SerdeGatewayCtx, url: URI): Promise<SerdeGetResult<S>> {
    const rret = await this.interceptor.get<S>(ctx, url);
    if (rret.isErr()) {
      return Result.Err(rret.Err());
    }
    const ret = rret.unwrap();
    if (ret.stop && ret.value) {
      return ret.value;
    }
    return this.innerGW.get(ctx, ret.op.url);
  }

  async subscribe(ctx: SerdeGatewayCtx, url: URI, callback: (msg: FPEnvelopeMeta) => Promise<void>): Promise<UnsubscribeResult> {
    if (!this.innerGW.subscribe) {
      return Result.Err(ctx.loader.sthis.logger.Error().Url(url).Msg("subscribe not supported").AsError());
    }
    const rret = await this.interceptor.subscribe(ctx, url, callback);
    if (rret.isErr()) {
      return Result.Err(rret.Err());
    }
    const ret = rret.unwrap();
    if (ret.stop && ret.value) {
      return ret.value;
    }
    return this.innerGW.subscribe(ctx, ret.op.url, ret.op.callback);
  }

  async delete(ctx: SerdeGatewayCtx, url: URI): Promise<VoidResult> {
    const rret = await this.interceptor.delete(ctx, url);
    if (rret.isErr()) {
      return Result.Err(rret.Err());
    }
    const ret = rret.unwrap();
    if (ret.stop && ret.value) {
      return ret.value;
    }
    return this.innerGW.delete(ctx, url);
  }

  async getPlain(ctx: SerdeGatewayCtx, url: URI, key: string): Promise<Result<Uint8Array>> {
    return this.innerGW.getPlain(ctx, url, key);
  }
}
