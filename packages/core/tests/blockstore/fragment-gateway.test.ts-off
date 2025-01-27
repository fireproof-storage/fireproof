import { Result, URI } from "@adviser/cement";
import { bs, ensureSuperThis } from "@fireproof/core";

class TraceGateway implements bs.Gateway {
  readonly buildUrlFn = vitest.fn();

  readonly fragSize: number;
  constructor(fragSize = 0) {
    this.fragSize = fragSize;
  }

  buildUrl(baseUrl: URI, key: string): Promise<Result<URI>> {
    this.buildUrlFn(baseUrl, key);
    return Promise.resolve(Result.Ok(baseUrl.build().setParam("key", key).URI()));
  }
  readonly startFn = vitest.fn();
  start(baseUrl: URI): Promise<Result<URI>> {
    this.startFn(baseUrl);
    const burl = baseUrl.build();
    if (this.fragSize) {
      burl.setParam("fragSize", this.fragSize.toString());
    }
    return Promise.resolve(Result.Ok(burl.URI()));
  }
  readonly closeFn = vitest.fn();
  close(baseUrl: URI): Promise<bs.VoidResult> {
    this.closeFn(baseUrl);
    return Promise.resolve(Result.Ok(undefined));
  }
  readonly destroyFn = vitest.fn();
  destroy(baseUrl: URI): Promise<bs.VoidResult> {
    this.destroyFn(baseUrl);
    return Promise.resolve(Result.Ok(undefined));
  }
  readonly getFn = vitest.fn();
  putCalls = 0;
  async get(url: URI): Promise<Result<Uint8Array>> {
    const idx = this.putCalls++;
    this.getFn(url);
    return Result.Ok(this.putFn.mock.calls[idx][1]);
  }
  readonly putFn = vitest.fn();
  async put(url: URI, data: Uint8Array): Promise<Result<void>> {
    this.putFn(url, data);
    return Result.Ok(undefined);
  }
  readonly deleteFn = vitest.fn();
  async delete(url: URI): Promise<Result<void>> {
    this.deleteFn(url);
    return Result.Ok(undefined);
  }
}

describe("FragmentGateway", () => {
  const sthis = ensureSuperThis();
  it("passthrough", async () => {
    const innerGW = new TraceGateway();
    const fgw = new bs.FragmentGateway(sthis, innerGW);
    const url = URI.from("http://example.com?key=3333");

    expect(await fgw.put(url, new Uint8Array([1, 2, 3, 4]))).toEqual(Result.Ok(undefined));
    expect(innerGW.putFn).toHaveBeenCalledWith(url, new Uint8Array([1, 2, 3, 4]));

    expect(await fgw.get(url)).toEqual(Result.Ok(new Uint8Array([1, 2, 3, 4])));
    expect(innerGW.getFn).toHaveBeenCalledWith(url);
  });

  function slice(total: number, headerSize: number, fragSize: number): { len?: string; ofs: string }[] {
    const res = [];
    for (let ofs = 0; ofs < total; ofs += fragSize - headerSize) {
      res.push({ len: total.toString(), ofs: ofs.toString() });
    }
    return res;
  }

  it("enable frag", async () => {
    const innerGW = new TraceGateway(128);
    const fgw = new bs.FragmentGateway(sthis, innerGW);
    const url = (await fgw.start(URI.from("http://example.com?key=3333"))).Ok();
    const buf = new Uint8Array(1024).fill(1).map((_, i) => i);

    expect(await fgw.put(url, buf)).toEqual(Result.Ok(undefined));

    const ref = slice(1024, fgw.headerSize, 128);

    expect(
      innerGW.putFn.mock.calls.map((i) => {
        return {
          len: i[0].getParam("len"),
          ofs: i[0].getParam("ofs"),
        };
      }),
    ).toEqual(ref);

    expect((await fgw.get(url)).Ok()).toEqual(buf);
    ref[0].len = undefined;
    expect(
      innerGW.getFn.mock.calls.map((i) => {
        return {
          len: i[0].getParam("len"),
          ofs: i[0].getParam("ofs"),
        };
      }),
    ).toEqual(ref);
  });
});
