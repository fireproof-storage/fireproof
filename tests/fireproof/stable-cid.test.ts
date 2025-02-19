import { sha256 } from "multiformats/hashes/sha2";
import { ensureSuperThis, rt, bs } from "@fireproof/core";
import { base58btc } from "multiformats/bases/base58";
import { URI, toCryptoRuntime } from "@adviser/cement";
import * as cborg from "cborg";
import { ByteView } from "multiformats";

describe("regression of stable cid encoding", () => {
  let kycr: bs.CryptoAction;
  let keyStr: string;
  const sthis = ensureSuperThis();
  beforeEach(async () => {
    // let url: URI;
    // if (runtimeFn().isBrowser) {
    //   url = URI.from("indexeddb://fp-keybag");
    // } else {
    //   url = URI.merge(`file://./dist/tests/key.bag`, sthis.env.get("FP_KEYBAG_URL"));
    // }
    const kb = await rt.kb.getKeyBag(sthis, {
      // url,
    });
    keyStr = base58btc.encode(toCryptoRuntime().randomBytes(kb.rt.keyLength));
    kycr = await rt.kc.keyedCryptoFactory(URI.from(`test://bla?storekey=${keyStr}`), kb, sthis);
  });

  it("should encode and decode a stable cid", async () => {
    const x1 = await rt.mf.block.encode({
      value: cborg.encode({ hello: "world" }),
      hashBytes: {
        as: (x: Uint8Array<ArrayBufferLike>): Promise<ByteView<Uint8Array>> => Promise.resolve(x),
      },
      hasher: sha256,
      codec: kycr.codec(toCryptoRuntime().randomBytes(12)),
    });
    const x2 = await rt.mf.block.encode({
      value: cborg.encode({ hello: "world" }),
      hashBytes: {
        as: (x: Uint8Array<ArrayBufferLike>): Promise<ByteView<Uint8Array>> => Promise.resolve(x),
      },
      hasher: sha256,
      codec: kycr.codec(toCryptoRuntime().randomBytes(12)),
    });
    expect(x1.cid).toEqual(x2.cid);
  });
  it("decode stable cid", async () => {
    const x1 = await rt.mf.block.encode({
      value: cborg.encode({ hello: "world" }),
      hashBytes: {
        as: (x: Uint8Array<ArrayBufferLike>): Promise<ByteView<Uint8Array>> => Promise.resolve(x),
      },
      hasher: sha256,
      codec: kycr.codec(),
    });
    const x = await rt.mf.block.decode<bs.IvKeyIdData, 24, 18>({
      bytes: x1.bytes,
      hashBytes: {
        get: (x: bs.IvKeyIdData): Promise<ByteView<Uint8Array>> => Promise.resolve(x.data as ByteView<Uint8Array<ArrayBufferLike>>),
      },
      codec: kycr.codec(),
      hasher: sha256,
    });
    expect(x.cid.toString()).toEqual(x1.cid.toString());
    expect(cborg.decode(x.value.data)).toEqual({ hello: "world" });
  }, 1000000);
});
