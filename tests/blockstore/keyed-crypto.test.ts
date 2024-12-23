import { bs, PARAM, rt } from "@fireproof/core";
import { URI } from "@adviser/cement";
import { base58btc } from "multiformats/bases/base58";
import { sha256 as hasher } from "multiformats/hashes/sha2";
import * as dagCodec from "@fireproof/vendor/@ipld/dag-cbor";
import { mockSuperThis } from "../helpers.js";

describe("KeyedCryptoStore", () => {
  let loader: bs.Loadable;
  let kb: rt.kb.KeyBag;
  // let logger: Logger;
  let baseUrl: URI;
  const sthis = mockSuperThis();
  beforeEach(async () => {
    await sthis.start();
    // logger = MockLogger().logger;
    // let kbUrl: URI;
    // if (runtimeFn().isBrowser) {
    //   kbUrl = URI.from("indexdb://fp-keybag");
    //   baseUrl = URI.from("indexdb://fp-keyed-crypto-store");
    // } else {
    //   kbUrl = URI.merge(`file://./dist/tests/key.bag`, sthis.env.get("FP_KEYBAG_URL"));
    //   baseUrl = URI.merge("file://./dist/tests/keyed-crypto-store", sthis.env.get("FP_STORAGE_URL"));
    // }
    // baseUrl = baseUrl.build().defParam(PARAM.NAME, "test").URI();

    const envURL = sthis.env.get("FP_KEYBAG_URL");
    if (envURL) {
      baseUrl = bs.getDefaultURI(sthis, URI.from(envURL).protocol);
    } else {
      baseUrl = bs.getDefaultURI(sthis);
    }
    baseUrl = baseUrl.build().setParam(PARAM.NAME, "test").URI();
    kb = await rt.kb.getKeyBag(sthis, {});
    loader = {
      keyBag: async () => kb,
    } as bs.Loadable;
  });
  it("no crypto", async () => {
    const strt = bs.toStoreRuntime(sthis);
    const url = baseUrl.build().setParam(PARAM.STORE_KEY, "insecure").URI();

    for (const pstore of [
      strt.makeDataStore({ sthis, url, loader }),
      strt.makeMetaStore({ sthis, url, loader }),
      strt.makeWALStore({ sthis, url, loader }),
    ]) {
      const store = await pstore;
      // await store.start();
      const kc = await store.keyedCrypto();
      expect(kc.constructor.name).toBe("noCrypto");
      // expect(kc.isEncrypting).toBe(false);
      expect(kc.constructor.name).toBe("noCrypto");
      // expect(kc.isEncrypting).toBe(false);
    }
  });

  it("create key", async () => {
    const strt = bs.toStoreRuntime(sthis);
    for (const pstore of [
      strt.makeDataStore({ sthis, url: baseUrl, loader }),
      strt.makeMetaStore({ sthis, url: baseUrl, loader }),
      strt.makeWALStore({ sthis, url: baseUrl, loader }),
    ]) {
      const store = await pstore; // await bs.ensureStart(await pstore, logger);
      const kc = await store.keyedCrypto();
      expect(kc.constructor.name).toBe("keyedCrypto");
      // expect(kc.isEncrypting).toBe(true);
      expect(store.url().getParam(PARAM.STORE_KEY)).toBe(`@test:${store.url().getParam(PARAM.STORE)}@`);
    }
  });

  it("key ref keybag", async () => {
    const key = base58btc.encode(kb.rt.crypto.randomBytes(kb.rt.keyLength));
    const genKey = await kb.setNamedKey("@heute@", key);
    const url = baseUrl.build().setParam(PARAM.STORE_KEY, "@heute@").URI();
    const strt = bs.toStoreRuntime(sthis);
    for (const pstore of [
      strt.makeDataStore({ sthis, url, loader }),
      strt.makeMetaStore({ sthis, url, loader }),
      strt.makeWALStore({ sthis, url, loader }),
    ]) {
      const store = await pstore;
      // await store.start();
      expect(store.url().getParam(PARAM.STORE_KEY)).toBe(`@heute@`);
      const kc = await store.keyedCrypto();
      expect(kc.constructor.name).toBe("keyedCrypto");
      const testData = kb.rt.crypto.randomBytes(1024);
      const iv = kb.rt.crypto.randomBytes(12);
      const blk = await kc._encrypt({ bytes: testData, iv });
      expect(blk).not.toEqual(testData);
      const fpkey = genKey.Ok();
      expect(fpkey.fingerPrint).toEqual(await kc.fingerPrint());
      const dec = new Uint8Array(await kc.crypto.decrypt(kc.algo(iv), fpkey.key, blk));
      expect(dec).toEqual(testData);
    }
  });

  it("key", async () => {
    const key = base58btc.encode(kb.rt.crypto.randomBytes(kb.rt.keyLength));
    const strt = bs.toStoreRuntime(sthis);
    const url = baseUrl.build().setParam(PARAM.STORE_KEY, key).URI();
    for (const pstore of [
      strt.makeDataStore({ sthis, url, loader }),
      strt.makeMetaStore({ sthis, url, loader }),
      strt.makeWALStore({ sthis, url, loader }),
    ]) {
      // for (const pstore of [strt.makeDataStore(loader), strt.makeMetaStore(loader), strt.makeWALStore(loader)]) {
      const store = await pstore;
      // await store.start();
      expect(store.url().getParam(PARAM.STORE_KEY)).toBe(key);
      const kc = await store.keyedCrypto();
      expect(kc.constructor.name).toBe("keyedCrypto");
      const testData = kb.rt.crypto.randomBytes(1024);
      const iv = kb.rt.crypto.randomBytes(12);
      const blk = await kc._encrypt({ bytes: testData, iv });
      expect(blk).not.toEqual(testData);
      const dec = await kc._decrypt({ bytes: blk, iv });
      expect(dec).toEqual(testData);
    }
  });
});

describe("KeyedCrypto", () => {
  let kb: rt.kb.KeyBag;
  let kycr: bs.KeyedCrypto;
  let keyStr: string;
  const sthis = mockSuperThis();
  beforeEach(async () => {
    // let url: URI;
    // if (runtimeFn().isBrowser) {
    //   url = URI.from("indexdb://fp-keybag");
    // } else {
    //   url = URI.merge(`file://./dist/tests/key.bag`, sthis.env.get("FP_KEYBAG_URL"));
    // }
    kb = await rt.kb.getKeyBag(sthis, {
      // url,
    });
    keyStr = base58btc.encode(kb.rt.crypto.randomBytes(kb.rt.keyLength));
    kycr = await rt.kc.keyedCryptoFactory(URI.from(`test://bla?storekey=${keyStr}`), kb, sthis);
  });
  it("codec explict iv", async () => {
    const testData = kb.rt.crypto.randomBytes(1024);
    const iv = kb.rt.crypto.randomBytes(12);
    const codec = kycr.codec(iv, { noIVVerify: true });
    const blk = (await codec.encode(testData)) as Uint8Array;
    const myDec = await rt.mf.block.decode<bs.IvKeyIdData, number, number>({ bytes: blk, hasher, codec: dagCodec });
    expect(myDec.value.iv).toEqual(iv);
    expect(base58btc.encode(myDec.value.keyId)).toEqual(await kycr.fingerPrint());
    const dec = await codec.decode(blk);
    expect(dec).toEqual(testData);
  });

  it("codec implict iv", async () => {
    const testData = kb.rt.crypto.randomBytes(1024);
    const codec = kycr.codec();
    const blk = await codec.encode(testData);
    expect(blk.length).toBeGreaterThanOrEqual(12 + testData.length);
    const dec = await codec.decode(blk);
    expect(dec).toEqual(testData);
  });

  it("codec implict iv same for multiple clients", async () => {
    const testData = kb.rt.crypto.randomBytes(1024);
    const codec = kycr.codec();
    const blk = await codec.encode(testData);
    const blk2 = await codec.encode(testData);
    expect(blk).toEqual(blk2);
  });
});
