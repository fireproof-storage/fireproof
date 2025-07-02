import { sha256 } from "multiformats/hashes/sha2";
import { base58btc } from "multiformats/bases/base58";
import { URI, toCryptoRuntime } from "@adviser/cement";
import * as cborg from "cborg";
import { asyncBlockDecode, asyncBlockEncode, ensureSuperThis, keyedCryptoFactory } from "@fireproof/core-runtime";
import { describe, beforeEach, it, expect } from "vitest";
import { getKeyBag } from "@fireproof/core-keybag";
import { CryptoAction, IvKeyIdData } from "@fireproof/core-types-blockstore";

const sthis = ensureSuperThis();
describe.each([
  async () => {
    const kb = await getKeyBag(sthis, {});
    const keyStr = base58btc.encode(toCryptoRuntime().randomBytes(kb.rt.keyLength));
    return await keyedCryptoFactory(URI.from(`test://bla?storekey=${keyStr}`), kb, sthis);
  },
  async () => {
    const kb = await getKeyBag(sthis, {});
    return await keyedCryptoFactory(URI.from(`test://bla?storekey=insecure`), kb, sthis);
  },
])("regression of stable cid encoding", (factory) => {
  let kycr: CryptoAction;
  beforeEach(async () => {
    // let url: URI;
    // if (runtimeFn().isBrowser) {
    //   url = URI.from("indexeddb://fp-keybag");
    // } else {
    //   url = URI.merge(`file://./dist/tests/key.bag`, sthis.env.get("FP_KEYBAG_URL"));
    // }
    kycr = await factory();
  });

  it("should encode and decode a stable cid", async () => {
    const x1 = await asyncBlockEncode({
      value: cborg.encode({ hello: "world" }),
      // hashBytes: {
      //   as: (x: Uint8Array<ArrayBufferLike>): Promise<ByteView<Uint8Array>> => Promise.resolve(x),
      // },
      hasher: sha256,
      codec: kycr.codec(toCryptoRuntime().randomBytes(12)),
    });
    const x2 = await asyncBlockEncode({
      value: cborg.encode({ hello: "world" }),
      // hashBytes: {
      //   as: (x: Uint8Array<ArrayBufferLike>): Promise<ByteView<Uint8Array>> => Promise.resolve(x),
      // },
      hasher: sha256,
      codec: kycr.codec(toCryptoRuntime().randomBytes(12)),
    });
    expect(x1.cid).toEqual(x2.cid);
  });
  it("decode stable cid", async () => {
    const x1 = await asyncBlockEncode({
      value: cborg.encode({ hello: "world" }),
      // hashBytes: {
      //   as: (x: Uint8Array<ArrayBufferLike>): Promise<ByteView<Uint8Array>> => Promise.resolve(x),
      // },
      hasher: sha256,
      codec: kycr.codec(),
    });
    const x = await asyncBlockDecode<IvKeyIdData, 24, 18>({
      bytes: x1.bytes,
      // hashBytes: {
      //   get: (x:   IvKeyIdData): Promise<ByteView<Uint8Array>> => Promise.resolve(x.data as ByteView<Uint8Array<ArrayBufferLike>>),
      // },
      codec: kycr.codec(),
      hasher: sha256,
    });
    expect(x.cid.toString()).toEqual(x1.cid.toString());
    expect(cborg.decode(x.value.data)).toEqual({ hello: "world" });
  }, 1000000);
});
