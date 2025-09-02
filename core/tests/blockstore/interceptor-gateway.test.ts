import { BuildURI, Result, URI } from "@adviser/cement";
import { fireproof, SuperThis } from "@fireproof/core";
import * as bs from "@fireproof/core-types-blockstore";
import { describe, expect, it, vitest } from "vitest";
import { PassThroughGateway, URIInterceptor } from "@fireproof/core-gateways-base";
import { MemoryGateway } from "@fireproof/core-gateways-memory";
import { registerStoreProtocol } from "@fireproof/core-blockstore";
class TestInterceptor extends PassThroughGateway {
  readonly fn = vitest.fn();

  async buildUrl(ctx: bs.SerdeGatewayCtx, baseUrl: URI, key: string): Promise<Result<bs.SerdeGatewayBuildUrlReturn>> {
    const ret = await super.buildUrl(ctx, baseUrl, key);
    this.fn("buildUrl", ret);
    return ret;
  }

  async start(ctx: bs.SerdeGatewayCtx, baseUrl: URI): Promise<Result<bs.SerdeGatewayStartReturn>> {
    const ret = await super.start(ctx, baseUrl);
    this.fn("start", ret);
    return ret;
  }
  async close(ctx: bs.SerdeGatewayCtx, baseUrl: URI): Promise<Result<bs.SerdeGatewayCloseReturn>> {
    const ret = await super.close(ctx, baseUrl);
    this.fn("close", ret);
    return ret;
  }
  async delete(ctx: bs.SerdeGatewayCtx, baseUrl: URI): Promise<Result<bs.SerdeGatewayDeleteReturn>> {
    const ret = await super.delete(ctx, baseUrl);
    this.fn("delete", ret);
    return ret;
  }
  async destroy(ctx: bs.SerdeGatewayCtx, baseUrl: URI): Promise<Result<bs.SerdeGatewayDestroyReturn>> {
    const ret = await super.destroy(ctx, baseUrl);
    this.fn("destroy", ret);
    return ret;
  }
  async put<T>(ctx: bs.SerdeGatewayCtx, url: URI, body: bs.FPEnvelope<T>): Promise<Result<bs.SerdeGatewayPutReturn<T>>> {
    const ret = await super.put<T>(ctx, url, body);
    this.fn("put", ret);
    return ret;
  }
  async get<S>(ctx: bs.SerdeGatewayCtx, url: URI): Promise<Result<bs.SerdeGatewayGetReturn<S>>> {
    const ret = await super.get<S>(ctx, url);
    this.fn("get", ret);
    return ret;
  }
  async subscribe(
    ctx: bs.SerdeGatewayCtx,
    url: URI,
    callback: (meta: bs.FPEnvelopeMeta) => Promise<void>,
  ): Promise<Result<bs.SerdeGatewaySubscribeReturn>> {
    const ret = await super.subscribe(ctx, url, callback);
    this.fn("subscribe", ret);
    return ret;
  }
}

export class URITrackGateway implements bs.SerdeGateway {
  readonly uris: Set<string>;
  readonly memgw: MemoryGateway;

  constructor(sthis: SuperThis, memories: Map<string, bs.FPEnvelope<unknown>>, uris: Set<string>) {
    this.memgw = new MemoryGateway(sthis, memories);
    this.uris = uris;
  }

  uriAdd(uri: URI) {
    if (!uri.getParam("itis")) {
      throw new Error("itis not set");
    }
    if (this.uris.has(uri.toString())) {
      throw new Error(`uri already added:${uri.toString()}`);
    }
    this.uris.add(uri.toString());
  }

  buildUrl(ctx: bs.SerdeGatewayCtx, baseUrl: URI, key: string): Promise<Result<URI>> {
    this.uriAdd(baseUrl);
    return this.memgw.buildUrl(ctx, baseUrl, key);
  }
  start(ctx: bs.SerdeGatewayCtx, baseUrl: URI): Promise<Result<URI>> {
    this.uriAdd(baseUrl);
    return this.memgw.start(ctx, baseUrl);
  }
  close(ctx: bs.SerdeGatewayCtx, baseUrl: URI): Promise<bs.VoidResult> {
    this.uriAdd(baseUrl);
    return this.memgw.close(ctx, baseUrl);
  }
  destroy(ctx: bs.SerdeGatewayCtx, baseUrl: URI): Promise<bs.VoidResult> {
    this.uriAdd(baseUrl);
    return this.memgw.destroy(ctx, baseUrl);
  }

  async put<T>(ctx: bs.SerdeGatewayCtx, url: URI, body: bs.FPEnvelope<T>): Promise<bs.VoidResult> {
    this.uriAdd(url);
    return this.memgw.put(ctx, url.build().cleanParams("itis").URI(), body);
  }

  async get<S>(ctx: bs.SerdeGatewayCtx, url: URI): Promise<bs.SerdeGetResult<S>> {
    this.uriAdd(url);
    return this.memgw.get(ctx, url.build().cleanParams("itis").URI());
  }

  delete(ctx: bs.SerdeGatewayCtx, url: URI): Promise<bs.VoidResult> {
    this.uriAdd(url);
    return this.memgw.delete(ctx, url);
  }

  subscribe(ctx: bs.SerdeGatewayCtx, url: URI, _callback: (meta: bs.FPEnvelopeMeta) => Promise<void>): Promise<bs.UnsubscribeResult> {
    this.uriAdd(url);
    return Promise.resolve(
      Result.Ok(() => {
        /* noop */
      }),
    );
  }

  async getPlain(ctx: bs.SerdeGatewayCtx, url: URI, key: string): Promise<Result<Uint8Array>> {
    this.uriAdd(url);
    return this.memgw.getPlain(ctx, url, key);
  }
}

describe("InterceptorGateway", () => {
  it("passthrough", async () => {
    const gwi = new TestInterceptor();
    const db = fireproof("interceptor-gateway", {
      gatewayInterceptor: gwi,
    });
    expect(
      await db.put({
        _id: "foo",
        foo: 4,
      }),
    );
    expect(await db.get("foo")).toEqual({
      _id: "foo",
      foo: 4,
    });
    await db.close();
    await db.destroy();
    // await sleep(1000);
    expect(gwi.fn.mock.calls.length).toBe(54);
    // might be a stupid test
    expect(gwi.fn.mock.calls.map((i) => i[0]).sort() /* not ok there are some operation */).toEqual(
      [
        "start",
        "start",
        "buildUrl",
        "get",
        "buildUrl",
        "buildUrl",
        "buildUrl",
        "buildUrl",
        "buildUrl",
        "buildUrl",
        "buildUrl",
        "buildUrl",
        "get",
        "get",
        "start",
        "start",
        "buildUrl",
        "get",
        "get",
        "buildUrl",
        "put",
        "put",
        "buildUrl",
        "put",
        "buildUrl",
        "put",
        "put",
        "put",
        "put",
        "put",
        "start",
        "start",
        "start",
        "start",
        "close",
        "close",
        "close",
        "close",
        "buildUrl",
        "get",
        "close",
        "close",
        "close",
        "close",
        "destroy",
        "destroy",
        "destroy",
        "destroy",
        "destroy",
        "destroy",
        "destroy",
        "destroy",
        "subscribe",
        "subscribe",
      ].sort() /* not ok there are some operation */,
    );
  });

  it("use the uri-interceptor", async () => {
    let callCount = 0;
    const gwUris = new Set<string>();
    const unreg = registerStoreProtocol({
      protocol: "uriTest:",
      isDefault: false,
      defaultURI: () => {
        return BuildURI.from("uriTest://").pathname("ram").URI();
      },
      serdegateway: async (sthis) => {
        return new URITrackGateway(sthis, new Map<string, bs.FPEnvelope<unknown>>(), gwUris);
      },
    });
    const db = fireproof("interceptor-gateway", {
      storeUrls: {
        base: "uriTest://inspector-gateway",
      },
      gatewayInterceptor: URIInterceptor.withMapper(async (uri: URI) =>
        uri
          .build()
          .setParam("itis", "" + ++callCount)
          .URI(),
      ),
    });
    await Promise.all(
      Array(5)
        .fill(0)
        .map((_, i) => db.put({ _id: "foo" + i, foo: i })),
    );
    expect((await db.allDocs<{ foo: number }>()).rows.map((i) => i.value.foo)).toEqual(
      Array(5)
        .fill(0)
        .map((_, i) => i),
    );
    await db.close();
    expect(callCount).toBe(gwUris.size);
    expect(
      Array.from(gwUris)
        .map((i) => URI.from(i).getParam("itis"))
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        .sort((a, b) => +a! - +b!),
    ).toEqual(
      Array(gwUris.size)
        .fill(1)
        .map((_, i) => "" + (i + 1)),
    );
    unreg();
  });
});
