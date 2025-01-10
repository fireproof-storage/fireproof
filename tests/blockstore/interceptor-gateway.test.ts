import { Result, URI } from "@adviser/cement";
import { bs, fireproof } from "@fireproof/core";

class TestInterceptor extends bs.PassThroughGateway {
  readonly fn = vitest.fn();

  async buildUrl(baseUrl: URI, key: string): Promise<Result<bs.GatewayBuildUrlReturn>> {
    const ret = await super.buildUrl(baseUrl, key);
    this.fn("buildUrl", ret);
    return ret;
  }

  async start(baseUrl: URI): Promise<Result<bs.GatewayStartReturn>> {
    const ret = await super.start(baseUrl);
    this.fn("start", ret);
    return ret;
  }
  async close(baseUrl: URI): Promise<Result<bs.GatewayCloseReturn>> {
    const ret = await super.close(baseUrl);
    this.fn("close", ret);
    return ret;
  }
  async delete(baseUrl: URI): Promise<Result<bs.GatewayDeleteReturn>> {
    const ret = await super.delete(baseUrl);
    this.fn("delete", ret);
    return ret;
  }
  async destroy(baseUrl: URI): Promise<Result<bs.GatewayDestroyReturn>> {
    const ret = await super.destroy(baseUrl);
    this.fn("destroy", ret);
    return ret;
  }
  async put<T>(url: URI, body: bs.FPEnvelope<T>): Promise<Result<bs.GatewayPutReturn<T>>> {
    const ret = await super.put<T>(url, body);
    this.fn("put", ret);
    return ret;
  }
  async get<S>(url: URI): Promise<Result<bs.GatewayGetReturn<S>>> {
    const ret = await super.get<S>(url);
    this.fn("get", ret);
    return ret;
  }
  async subscribe(url: URI, callback: (meta: bs.FPEnvelopeMeta) => Promise<void>): Promise<Result<bs.GatewaySubscribeReturn>> {
    const ret = await super.subscribe(url, callback);
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
