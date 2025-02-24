import { Result, URI } from "@adviser/cement";
import { bs, fireproof } from "@fireproof/core";

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
    expect(gwi.fn.mock.calls.length).toBe(56);
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
      ].sort() /* not ok there are some operation */,
    );
  });
});
