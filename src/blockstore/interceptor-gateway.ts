import { Logger, Result, URI } from "@adviser/cement";

import {
  Gateway,
  GatewayBuildUrlReturn,
  GatewayCloseReturn,
  GatewayDeleteReturn,
  GatewayDestroyReturn,
  GatewayGetReturn,
  GatewayInterceptor,
  GatewayPutReturn,
  GatewayStartReturn,
  GatewaySubscribeReturn,
  GetResult,
  UnsubscribeResult,
  VoidResult,
} from "./gateway.js";
import { SuperThis } from "../types.js";
import { ensureSuperLog } from "../utils.js";
import { FPEnvelope, FPEnvelopeMeta } from "./fp-envelope.js";

export class PassThroughGateway implements GatewayInterceptor {
  async buildUrl(url: URI, key: string): Promise<Result<GatewayBuildUrlReturn>> {
    const op = { url, key };
    return Result.Ok({ op });
  }
  async start(url: URI): Promise<Result<GatewayStartReturn>> {
    const op = { url };
    return Result.Ok({ op });
  }
  async close(url: URI): Promise<Result<GatewayCloseReturn>> {
    const op = { url };
    return Result.Ok({ op });
  }
  async delete(url: URI): Promise<Result<GatewayDeleteReturn>> {
    const op = { url };
    return Result.Ok({ op });
  }
  async destroy(url: URI): Promise<Result<GatewayDestroyReturn>> {
    const op = { url };
    return Result.Ok({ op });
  }
  async put<T>(url: URI, body: FPEnvelope<T>): Promise<Result<GatewayPutReturn<T>>> {
    const op = { url, body };
    return Result.Ok({ op });
  }
  async get<S>(url: URI): Promise<Result<GatewayGetReturn<S>>> {
    const op = { url };
    return Result.Ok({ op });
  }
  async subscribe(url: URI, callback: (meta: FPEnvelopeMeta) => Promise<void>): Promise<Result<GatewaySubscribeReturn>> {
    const op = { url, callback };
    return Result.Ok({ op });
  }
}

const passThrougthGateway = new PassThroughGateway();

export class InterceptorGateway implements Gateway {
  readonly sthis: SuperThis;
  readonly logger: Logger;

  readonly innerGW: Gateway;
  readonly interceptor: GatewayInterceptor;

  constructor(sthis: SuperThis, innerGW: Gateway, interceptor: GatewayInterceptor | undefined) {
    this.sthis = ensureSuperLog(sthis, "InterceptorGateway");
    this.logger = this.sthis.logger;
    this.innerGW = innerGW;
    this.interceptor = interceptor || passThrougthGateway;
  }

  async buildUrl(baseUrl: URI, key: string): Promise<Result<URI>> {
    const rret = await this.interceptor.buildUrl(baseUrl, key);
    if (rret.isErr()) {
      return Result.Err(rret.Err());
    }
    const ret = rret.unwrap();
    if (ret.stop && ret.value) {
      return ret.value;
    }
    return this.innerGW.buildUrl(ret.op.url, ret.op.key);
  }

  async destroy(iurl: URI): Promise<Result<void>> {
    const rret = await this.interceptor.destroy(iurl);
    if (rret.isErr()) {
      return Result.Err(rret.Err());
    }
    const ret = rret.unwrap();
    if (ret.stop && ret.value) {
      return ret.value;
    }
    return this.innerGW.destroy(ret.op.url);
  }

  async start(url: URI): Promise<Result<URI>> {
    const rret = await this.interceptor.start(url);
    if (rret.isErr()) {
      return Result.Err(rret.Err());
    }
    const ret = rret.unwrap();
    if (ret.stop && ret.value) {
      return ret.value;
    }
    return this.innerGW.start(ret.op.url);
  }

  async close(url: URI): Promise<VoidResult> {
    const rret = await this.interceptor.start(url);
    if (rret.isErr()) {
      return Result.Err(rret.Err());
    }
    const ret = rret.unwrap();
    if (ret.stop && ret.value) {
      return ret.value;
    }
    return this.innerGW.close(ret.op.url);
  }

  async put<T>(url: URI, fpEnv: FPEnvelope<T>): Promise<VoidResult> {
    const rret = await this.interceptor.put(url, fpEnv);
    if (rret.isErr()) {
      return Result.Err(rret.Err());
    }
    const ret = rret.unwrap();
    if (ret.stop && ret.value) {
      return ret.value;
    }
    return this.innerGW.put(ret.op.url, ret.op.body);
  }

  async get<S>(url: URI): Promise<GetResult<S>> {
    const rret = await this.interceptor.get<S>(url);
    if (rret.isErr()) {
      return Result.Err(rret.Err());
    }
    const ret = rret.unwrap();
    if (ret.stop && ret.value) {
      return ret.value;
    }
    return this.innerGW.get(ret.op.url);
  }

  async subscribe(url: URI, callback: (msg: FPEnvelopeMeta) => Promise<void>): Promise<UnsubscribeResult> {
    if (!this.innerGW.subscribe) {
      return Result.Err(this.logger.Error().Url(url).Msg("subscribe not supported").AsError());
    }
    const rret = await this.interceptor.subscribe(url, callback);
    if (rret.isErr()) {
      return Result.Err(rret.Err());
    }
    const ret = rret.unwrap();
    if (ret.stop && ret.value) {
      return ret.value;
    }
    return this.innerGW.subscribe(ret.op.url, ret.op.callback);
  }

  async delete(url: URI): Promise<VoidResult> {
    const rret = await this.interceptor.delete(url);
    if (rret.isErr()) {
      return Result.Err(rret.Err());
    }
    const ret = rret.unwrap();
    if (ret.stop && ret.value) {
      return ret.value;
    }
    return this.innerGW.delete(url);
  }
}
