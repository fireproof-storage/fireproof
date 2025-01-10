import { Result, URI } from "@adviser/cement";
import {
  SerdeGateway,
  SerdeGatewayBuildUrlReturn,
  SerdeGatewayCloseReturn,
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
import { SuperThis } from "../types.js";
import { FPEnvelope, FPEnvelopeMeta } from "./fp-envelope.js";
import { Loadable } from "./types.js";

export class PassThroughGateway implements SerdeGatewayInterceptor {
  async buildUrl(sthis: SuperThis, url: URI, key: string): Promise<Result<SerdeGatewayBuildUrlReturn>> {
    const op = { url, key };
    return Result.Ok({ op });
  }
  async start(sthis: SuperThis, url: URI): Promise<Result<SerdeGatewayStartReturn>> {
    const op = { url };
    return Result.Ok({ op });
  }
  async close(sthis: SuperThis, url: URI): Promise<Result<SerdeGatewayCloseReturn>> {
    const op = { url };
    return Result.Ok({ op });
  }
  async delete(sthis: SuperThis, url: URI): Promise<Result<SerdeGatewayDeleteReturn>> {
    const op = { url };
    return Result.Ok({ op });
  }
  async destroy(sthis: SuperThis, url: URI): Promise<Result<SerdeGatewayDestroyReturn>> {
    const op = { url };
    return Result.Ok({ op });
  }
  async put<T>(sthis: SuperThis, url: URI, body: FPEnvelope<T>): Promise<Result<SerdeGatewayPutReturn<T>>> {
    const op = { url, body };
    return Result.Ok({ op });
  }
  async get<S>(sthis: SuperThis, url: URI): Promise<Result<SerdeGatewayGetReturn<S>>> {
    const op = { url };
    return Result.Ok({ op });
  }
  async subscribe(
    sthis: SuperThis,
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

  async buildUrl(sthis: SuperThis, baseUrl: URI, key: string, loader: Loadable): Promise<Result<URI>> {
    const rret = await this.interceptor.buildUrl(sthis, baseUrl, key, loader);
    if (rret.isErr()) {
      return Result.Err(rret.Err());
    }
    const ret = rret.unwrap();
    if (ret.stop && ret.value) {
      return ret.value;
    }
    return this.innerGW.buildUrl(sthis, ret.op.url, ret.op.key, loader);
  }

  async destroy(sthis: SuperThis, iurl: URI, loader: Loadable): Promise<Result<void>> {
    const rret = await this.interceptor.destroy(sthis, iurl, loader);
    if (rret.isErr()) {
      return Result.Err(rret.Err());
    }
    const ret = rret.unwrap();
    if (ret.stop && ret.value) {
      return ret.value;
    }
    return this.innerGW.destroy(sthis, ret.op.url, loader);
  }

  async start(sthis: SuperThis, url: URI, loader: Loadable): Promise<Result<URI>> {
    const rret = await this.interceptor.start(sthis, url, loader);
    if (rret.isErr()) {
      return Result.Err(rret.Err());
    }
    const ret = rret.unwrap();
    if (ret.stop && ret.value) {
      return ret.value;
    }
    return await this.innerGW.start(sthis, ret.op.url, loader);
  }

  async close(sthis: SuperThis, url: URI, loader: Loadable): Promise<VoidResult> {
    const rret = await this.interceptor.close(sthis, url, loader);
    if (rret.isErr()) {
      return Result.Err(rret.Err());
    }
    const ret = rret.unwrap();
    if (ret.stop && ret.value) {
      return ret.value;
    }
    return await this.innerGW.close(sthis, ret.op.url, loader);
  }

  async put<T>(sthis: SuperThis, url: URI, fpEnv: FPEnvelope<T>, loader: Loadable): Promise<VoidResult> {
    const rret = await this.interceptor.put(sthis, url, fpEnv, loader);
    if (rret.isErr()) {
      return Result.Err(rret.Err());
    }
    const ret = rret.unwrap();
    if (ret.stop && ret.value) {
      return ret.value;
    }
    return this.innerGW.put(sthis, ret.op.url, ret.op.body, loader);
  }

  async get<S>(sthis: SuperThis, url: URI, loader: Loadable): Promise<SerdeGetResult<S>> {
    const rret = await this.interceptor.get<S>(sthis, url, loader);
    if (rret.isErr()) {
      return Result.Err(rret.Err());
    }
    const ret = rret.unwrap();
    if (ret.stop && ret.value) {
      return ret.value;
    }
    return this.innerGW.get(sthis, ret.op.url, loader);
  }

  async subscribe(
    sthis: SuperThis,
    url: URI,
    callback: (msg: FPEnvelopeMeta) => Promise<void>,
    loader: Loadable,
  ): Promise<UnsubscribeResult> {
    if (!this.innerGW.subscribe) {
      return Result.Err(sthis.logger.Error().Url(url).Msg("subscribe not supported").AsError());
    }
    const rret = await this.interceptor.subscribe(sthis, url, callback, loader);
    if (rret.isErr()) {
      return Result.Err(rret.Err());
    }
    const ret = rret.unwrap();
    if (ret.stop && ret.value) {
      return ret.value;
    }
    return this.innerGW.subscribe(sthis, ret.op.url, ret.op.callback, loader);
  }

  async delete(sthis: SuperThis, url: URI, loader: Loadable): Promise<VoidResult> {
    const rret = await this.interceptor.delete(sthis, url, loader);
    if (rret.isErr()) {
      return Result.Err(rret.Err());
    }
    const ret = rret.unwrap();
    if (ret.stop && ret.value) {
      return ret.value;
    }
    return this.innerGW.delete(sthis, url, loader);
  }

  async getPlain(sthis: SuperThis, url: URI, key: string, loader?: Loadable): Promise<Result<Uint8Array>> {
    return this.innerGW.getPlain(sthis, url, key, loader);
  }
}
