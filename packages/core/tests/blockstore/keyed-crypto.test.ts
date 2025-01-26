import { bs, ensureSuperThis, PARAM, rt } from "@fireproof/core";
import { BuildURI, runtimeFn, toCryptoRuntime, URI } from "@adviser/cement";
import { base58btc } from "multiformats/bases/base58";
import { sha256 as hasher } from "multiformats/hashes/sha2";
import * as dagCodec from "@ipld/dag-cbor";
import type { KeyBagProviderIndexDB } from "@fireproof/core/web";
import { MockSuperThis, mockSuperThis } from "../helpers.js";

describe("KeyBag", () => {
  let url: URI;
  let sthis: MockSuperThis;

  beforeEach(async () => {
    sthis = mockSuperThis();
    await sthis.start();
    if (runtimeFn().isBrowser) {
      url = URI.from("indexdb://fp-keybag");
    } else {
      url = URI.merge(`file://./dist/tests/key.bag`, sthis.env.get("FP_KEYBAG_URL"));
    }
  });
  it("default-path", async () => {
    const old = sthis.env.get("FP_KEYBAG_URL");
    sthis.env.delete("FP_KEYBAG_URL");
    const kb = await rt.kb.getKeyBag(sthis);
    if (runtimeFn().isBrowser) {
      expect(kb.rt.url.toString()).toBe(`indexdb://fp-keybag`);
    } else {
      expect(kb.rt.url.toString()).toBe(`file://${sthis.env.get("HOME")}/.fireproof/keybag`);
    }
    sthis.env.set("FP_KEYBAG_URL", old);
  });
  it("from env", async () => {
    const old = sthis.env.get("FP_KEYBAG_URL");
    sthis.env.set("FP_KEYBAG_URL", url.toString());
    const kb = await rt.kb.getKeyBag(sthis);
    expect(kb.rt.url.toString()).toBe(url.toString());
    sthis.env.set("FP_KEYBAG_URL", old);
  });

  it("extract keyMaterial", async () => {
    const dkb = await rt.kb.getKeyBag(sthis);
    const old = sthis.env.get("FP_KEYBAG_URL");
    sthis.env.set("FP_KEYBAG_URL", BuildURI.from(dkb.rt.url).setParam("extractKey", "_deprecated_internal_api").toString());
    const kb = await rt.kb.getKeyBag(sthis);
    const key = kb.rt.crypto.randomBytes(kb.rt.keyLength);
    const keyStr = base58btc.encode(key);
    const res = await kb.setNamedKey("extract.test", keyStr);
    expect(res.isOk()).toBeTruthy();
    const gkb = await kb.getNamedExtractableKey("extract.test", true);
    expect(gkb.isOk()).toBeTruthy();
    expect(await gkb.Ok().extract()).toEqual({
      key,
      keyStr,
    });
    sthis.env.set("FP_KEYBAG_URL", old);
    await sthis.logger.Flush();
    expect(sthis.ctx.logCollector.Logs()).toEqual([
      {
        level: "warn",
        module: "KeyBag",
        msg: "extractKey is enabled via _deprecated_internal_api --- handle keys safely!!!",
      },
    ]);
  });

  it("simple add", async () => {
    const kb = await rt.kb.getKeyBag(sthis, {
      url: url.toString(),
      crypto: toCryptoRuntime({
        randomBytes: (size) => new Uint8Array(size).map((_, i) => i),
      }),
    });
    const name = "setkey" + Math.random();
    expect((await kb.getNamedKey(name, true)).isErr()).toBeTruthy();

    const key = base58btc.encode(kb.rt.crypto.randomBytes(kb.rt.keyLength));
    const res = await kb.setNamedKey(name, key);
    expect(res.isOk()).toBeTruthy();
    expect((await kb.getNamedKey(name, true)).Ok()).toEqual(res.Ok());

    const name2 = "implicit";
    const created = await kb.getNamedKey(name2);
    expect(created.isOk()).toBeTruthy();

    expect((await kb.getNamedKey(name2)).Ok()).toEqual(created.Ok());

    let diskBag: rt.kb.KeyItem;
    let diskBag2: rt.kb.KeyItem;
    const provider = await kb.rt.getBag();
    if (runtimeFn().isBrowser) {
      const p = provider as KeyBagProviderIndexDB;
      diskBag = await p._prepare().then((db) => db.get("bag", name));
      diskBag2 = await p._prepare().then((db) => db.get("bag", name2));
    } else {
      const p = provider as rt.gw.file.KeyBagProviderFile;
      if (typeof p._prepare !== "function") {
        return;
      }
      const { sysFS } = await p._prepare(name);

      diskBag = await sysFS.readfile((await p._prepare(name)).fName).then((data) => {
        return JSON.parse(sthis.txt.decode(data)) as rt.kb.KeyItem;
      });
      diskBag2 = await sysFS.readfile((await p._prepare(name2)).fName).then((data) => {
        return JSON.parse(sthis.txt.decode(data)) as rt.kb.KeyItem;
      });
    }
    expect(await kb.toKeyWithFingerPrint(diskBag.key)).toEqual(res);
    expect(await kb.toKeyWithFingerPrint(diskBag2.key)).toEqual(created);
    const algo = {
      name: "AES-GCM",
      iv: kb.rt.crypto.randomBytes(12),
      tagLength: 128,
    };
    const data = kb.rt.crypto.randomBytes(122);
    expect(await kb.rt.crypto.encrypt(algo, res.Ok().key, data)).toEqual(await kb.rt.crypto.encrypt(algo, created.Ok().key, data));
    expect(await kb.rt.crypto.encrypt(algo, await kb.subtleKey(diskBag.key), data)).toEqual(
      await kb.rt.crypto.encrypt(algo, created.Ok().key, data),
    );
    expect(await kb.rt.crypto.encrypt(algo, await kb.subtleKey(diskBag2.key), data)).toEqual(
      await kb.rt.crypto.encrypt(algo, created.Ok().key, data),
    );
  });
});

describe("KeyedCryptoStore", () => {
  let loader: bs.Loadable;
  let kb: rt.kb.KeyBag;
  // let logger: Logger;
  let baseUrl: URI;
  const sthis = ensureSuperThis();
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
  const sthis = ensureSuperThis();
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
