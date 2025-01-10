import { Result, URI } from "@adviser/cement";
import { bs, fireproof, SuperThis } from "@fireproof/core";

class TestInterceptor extends bs.PassThroughGateway {
  readonly fn = vitest.fn();

  async buildUrl(sthis: SuperThis, baseUrl: URI, key: string): Promise<Result<bs.SerdeGatewayBuildUrlReturn>> {
    const ret = await super.buildUrl(sthis, baseUrl, key);
    this.fn("buildUrl", ret);
    return ret;
  }

  async start(sthis: SuperThis, baseUrl: URI): Promise<Result<bs.SerdeGatewayStartReturn>> {
    const ret = await super.start(sthis, baseUrl);
    this.fn("start", ret);
    return ret;
  }
  async close(sthis: SuperThis, baseUrl: URI): Promise<Result<bs.SerdeGatewayCloseReturn>> {
    const ret = await super.close(sthis, baseUrl);
    this.fn("close", ret);
    return ret;
  }
  async delete(sthis: SuperThis, baseUrl: URI): Promise<Result<bs.SerdeGatewayDeleteReturn>> {
    const ret = await super.delete(sthis, baseUrl);
    this.fn("delete", ret);
    return ret;
  }
  async destroy(sthis: SuperThis, baseUrl: URI): Promise<Result<bs.SerdeGatewayDestroyReturn>> {
    const ret = await super.destroy(sthis, baseUrl);
    this.fn("destroy", ret);
    return ret;
  }
  async put<T>(sthis: SuperThis, url: URI, body: bs.FPEnvelope<T>): Promise<Result<bs.SerdeGatewayPutReturn<T>>> {
    const ret = await super.put<T>(sthis, url, body);
    this.fn("put", ret);
    return ret;
  }
  async get<S>(sthis: SuperThis, url: URI): Promise<Result<bs.SerdeGatewayGetReturn<S>>> {
    const ret = await super.get<S>(sthis, url);
    this.fn("get", ret);
    return ret;
  }
  async subscribe(
    sthis: SuperThis,
    url: URI,
    callback: (meta: bs.FPEnvelopeMeta) => Promise<void>,
  ): Promise<Result<bs.SerdeGatewaySubscribeReturn>> {
    const ret = await super.subscribe(sthis, url, callback);
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
    expect(gwi.fn.mock.calls.length).toBe(42);
    // might be a stupid test
    expect(gwi.fn.mock.calls.map((i) => i[0]).sort() /* not ok there are some operation */).toEqual(
      [
        "start",
        "start",
        "buildUrl",
        "get",
        "buildUrl",
        "get",
        "start",
        "start",
        "buildUrl",
        "get",
        "buildUrl",
        "put",
        "buildUrl",
        "put",
        "buildUrl",
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
