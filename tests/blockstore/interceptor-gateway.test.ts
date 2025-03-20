import { BuildURI, Result, URI } from "@adviser/cement";
import { bs, rt, fireproof, SuperThis } from "@fireproof/core";

class TestInterceptor extends bs.PassThroughGateway {
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

export class URITrackGateway implements bs.Gateway {
  readonly uris: Set<string>;
  readonly memgw: rt.gw.memory.MemoryGateway;

  constructor(sthis: SuperThis, memorys: Map<string, Uint8Array>, uris: Set<string>) {
    this.memgw = new rt.gw.memory.MemoryGateway(sthis, memorys);
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

  buildUrl(baseUrl: URI, key: string): Promise<Result<URI>> {
    this.uriAdd(baseUrl);
    return this.memgw.buildUrl(baseUrl, key);
  }
  start(baseUrl: URI): Promise<Result<URI>> {
    this.uriAdd(baseUrl);
    return this.memgw.start(baseUrl);
  }
  close(uri: URI): Promise<bs.VoidResult> {
    this.uriAdd(uri);
    return this.memgw.close(uri);
  }
  destroy(baseUrl: URI): Promise<bs.VoidResult> {
    this.uriAdd(baseUrl);
    return this.memgw.destroy(baseUrl);
  }

  put(url: URI, bytes: Uint8Array): Promise<bs.VoidResult> {
    this.uriAdd(url);
    return this.memgw.put(url, bytes);
  }

  get(url: URI): Promise<bs.GetResult> {
    this.uriAdd(url);
    return this.memgw.get(url);
  }
  delete(url: URI): Promise<bs.VoidResult> {
    this.uriAdd(url);
    return this.memgw.delete(url);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  subscribe(url: URI, callback: (meta: Uint8Array) => void, sthis: SuperThis): Promise<bs.UnsubscribeResult> {
    this.uriAdd(url);
    return Promise.resolve(
      Result.Ok(() => {
        /* noop */
      }),
    );
  }

  async getPlain(url: URI, key: string): Promise<Result<Uint8Array>> {
    this.uriAdd(url);
    return this.memgw.getPlain(url, key);
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
    expect(gwi.fn.mock.calls.length).toBe(58);
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
    const unreg = bs.registerStoreProtocol({
      protocol: "uriTest:",
      isDefault: false,
      defaultURI: () => {
        return BuildURI.from("uriTest://").pathname("ram").URI();
      },
      gateway: async (sthis) => {
        return new URITrackGateway(sthis, new Map<string, Uint8Array>(), gwUris);
      },
    });
    const db = fireproof("interceptor-gateway", {
      storeUrls: {
        base: "uriTest://inspector-gateway",
      },
      gatewayInterceptor: bs.URIInterceptor.withMapper(async (uri: URI) => {
        // if (uri.getParam("itis")) {
        //   return uri;
        // }
        return uri
          .build()
          .setParam("itis", "" + ++callCount)
          .URI();
      }),
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
    // console.log(
    //   "gwUris",
    //   Array.from(gwUris).map((i) => URI.from(i).toString()),
    // );
    expect(callCount).toBe(gwUris.size);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(
      Array.from(gwUris)
        .map((i) => URI.from(i).getParam("itis"))
        .sort((a, b) => +a! - +b!),
    ).toEqual(
      Array(gwUris.size)
        .fill(1)
        .map((_, i) => "" + (i + 1)),
    );
    unreg();
  });
});
