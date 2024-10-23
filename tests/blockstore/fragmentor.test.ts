import { Result, URI } from "@adviser/cement";
import { mockSuperThis } from "../helpers";
import { bs, PARAM } from "@fireproof/core";
import { Fragment, FragmentData } from "../../src/blockstore";
import { base58btc } from "multiformats/bases/base58";

class TraceTransport implements bs.Transport {
  readonly buildUrlFn = vitest.fn();

  readonly fragSize: number;
  constructor(fragSize = 0) {
    this.fragSize = fragSize;
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
  async get(url: URI, frag: Fragment): Promise<Result<FragmentData>> {
    const idx = this.putCalls++;
    this.getFn(url, frag);
    return Result.Ok(this.putFn.mock.calls[idx][1]);
  }
  readonly putFn = vitest.fn();
  async put(url: URI, data: FragmentData): Promise<Result<void>> {
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
  const sthis = {
    ...mockSuperThis(),
    nextId: () => ({ bin: new Uint8Array([65, 65, 65, 65]), str: "AAAA" }),
  };

  it("passthrough", async () => {
    const transport = new TraceTransport();
    const fgw = new bs.Fragmentor(sthis, transport);
    const url = URI.from("http://example.com?key=3333");

    expect(await fgw.put(url, new Uint8Array([1, 2, 3, 4]))).toEqual(Result.Ok(undefined));
    expect(transport.putFn).toHaveBeenCalledWith(url, {
      fid: new Uint8Array([65, 65, 65, 65]),
      data: new Uint8Array([1, 2, 3, 4]),
      len: 4,
      ofs: 0,
    });

    expect(await fgw.get(url)).toEqual(Result.Ok(new Uint8Array([1, 2, 3, 4])));
    expect(transport.getFn).toHaveBeenCalledWith(url, {
      fid: new Uint8Array(),
      len: 0,
      ofs: 0,
    });
  });

  function slice(total: number, headerSize: number, fragSize: number): { len?: number; ofs: number; fid: Uint8Array }[] {
    const res = [];
    for (let ofs = 0; ofs < total; ofs += fragSize - headerSize) {
      res.push({ len: total, ofs: ofs, fid: new Uint8Array([65, 65, 65, 65]) });
    }
    return res;
  }

  it("enable frag", async () => {
    const transport = new TraceTransport(128);
    const fgw = new bs.Fragmentor(sthis, transport);
    const url = (await fgw.start(URI.from("http://example.com?key=3333"))).Ok();
    const buf = new Uint8Array(1024).fill(1).map((_, i) => i);

    expect(await fgw.put(url, buf)).toEqual(Result.Ok(undefined));

    const ref = slice(1024, fgw.headerSize, 128);

    expect(
      transport.putFn.mock.calls.map((i) => {
        return {
          fid: sthis.txt.encode(i[0].getParam(PARAM.FRAG_FID)),
          len: parseInt(i[0].getParam(PARAM.FRAG_LEN)),
          ofs: parseInt(i[0].getParam(PARAM.FRAG_OFS)),
        };
      }),
    ).toEqual(ref);

    expect(
      transport.putFn.mock.calls.map((i) => {
        return {
          fid: i[1].fid,
          len: i[1].len,
          ofs: i[1].ofs,
        };
      }),
    ).toEqual(ref);

    expect((await fgw.get(url)).Ok()).toEqual(buf);
    ref[0].len = undefined;
    const firstUrl = transport.getFn.mock.calls[0][0];
    expect({
      fid: sthis.txt.encode(firstUrl.getParam(PARAM.FRAG_FID)),
      len: parseInt(firstUrl.getParam(PARAM.FRAG_LEN)),
      ofs: parseInt(firstUrl.getParam(PARAM.FRAG_OFS)),
    }).toEqual({
      fid: new Uint8Array(),
      len: NaN,
      ofs: 0,
    });
    const firstFrag = transport.getFn.mock.calls[0][1];
    expect({
      fid: firstFrag.fid,
      len: firstFrag.len,
      ofs: firstFrag.ofs,
    }).toEqual({
      fid: new Uint8Array(),
      len: 0,
      ofs: 0,
    });

    expect(
      transport.getFn.mock.calls.slice(1).map((i) => {
        return {
          fid: base58btc.decode(i[0].getParam(PARAM.FRAG_FID)),
          len: parseInt(i[0].getParam(PARAM.FRAG_LEN)),
          ofs: parseInt(i[0].getParam(PARAM.FRAG_OFS)),
        };
      }),
    ).toEqual(ref.slice(1));

    expect(
      transport.getFn.mock.calls.slice(1).map((i) => {
        return {
          fid: i[1].fid,
          len: i[1].len,
          ofs: i[1].ofs,
        };
      }),
    ).toEqual(ref.slice(1));
  });
});
