import { bs, ensureSuperThis, PARAM, rt, StoreType, storeType2DataMetaWal } from "@fireproof/core";
import { BuildURI, runtimeFn, toCryptoRuntime, URI } from "@adviser/cement";
import { base58btc } from "multiformats/bases/base58";
// import { sha256 as hasher } from "multiformats/hashes/sha2";
// import * as dagCodec from "@ipld/dag-cbor";
import * as cborg from "cborg";
import type { KeyBagProviderIndexedDB } from "@fireproof/core/indexeddb";
import { mockLoader, MockSuperThis, mockSuperThis } from "../helpers.js";

describe("KeyBag", () => {
  let url: URI;
  let sthis: MockSuperThis;

  beforeEach(async () => {
    sthis = mockSuperThis();
    await sthis.start();
    if (runtimeFn().isBrowser) {
      url = URI.from("indexeddb://fp-keybag");
    } else {
      url = URI.merge(`file://./dist/tests/key.bag`, sthis.env.get("FP_KEYBAG_URL"));
    }
  });
  it("default-path", async () => {
    const old = sthis.env.get("FP_KEYBAG_URL");
    sthis.env.delete("FP_KEYBAG_URL");
    const kb = await rt.kb.getKeyBag(sthis);
    if (runtimeFn().isBrowser) {
      expect(kb.rt.url.toString()).toBe(`indexeddb://fp-keybag`);
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
    const keyName = "extract.test" + Math.random();
    const res = await kb.getNamedKey(keyName, false, keyStr);
    expect(res.isOk()).toBeTruthy();
    const gkb = await kb.getNamedKey(keyName, true);
    expect(gkb.isOk()).toBeTruthy();

    expect(
      await gkb
        .Ok()
        .get()
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        .then((i) => i!.extract()),
    ).toEqual({
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
    });
    const name = "setkey" + Math.random();
    expect((await kb.getNamedKey(name, true)).isErr()).toBeTruthy();

    const key = base58btc.encode(kb.rt.crypto.randomBytes(kb.rt.keyLength));
    const res = await kb.getNamedKey(name, false, key);
    expect(res.isOk()).toBeTruthy();
    expect((await kb.getNamedKey(name, true)).Ok()).toEqual(res.Ok());

    const name2 = "implicit" + Math.random();
    const created = await kb.getNamedKey(name2);
    expect(created.isOk()).toBeTruthy();

    expect((await kb.getNamedKey(name2)).Ok()).toEqual(created.Ok());

    let diskBag: rt.kb.KeysItem;
    let diskBag2: rt.kb.KeysItem;
    const provider = await kb.rt.getBagProvider();
    if (runtimeFn().isBrowser) {
      const p = provider as KeyBagProviderIndexedDB;
      diskBag = await p._prepare().then((db) => db.get("bag", name));
      diskBag2 = await p._prepare().then((db) => db.get("bag", name2));
    } else {
      const p = provider as rt.gw.file.KeyBagProviderFile;
      if (typeof p._prepare !== "function") {
        return;
      }
      const { sysFS } = await p._prepare(name);

      diskBag = await sysFS.readfile((await p._prepare(name)).fName).then((data) => {
        return JSON.parse(sthis.txt.decode(data)) as rt.kb.KeysItem;
      });
      diskBag2 = await sysFS.readfile((await p._prepare(name2)).fName).then((data) => {
        return JSON.parse(sthis.txt.decode(data)) as rt.kb.KeysItem;
      });
    }
    expect((await rt.toKeyWithFingerPrint(kb, Object.values(diskBag.keys)[0].key)).Ok().fingerPrint).toEqual(
      (await res.Ok().get())?.fingerPrint,
    );
    expect((await rt.toKeyWithFingerPrint(kb, Object.values(diskBag2.keys)[0].key)).Ok().fingerPrint).toEqual(
      (await created.Ok().get())?.fingerPrint,
    );
    const algo = {
      name: "AES-GCM",
      iv: kb.rt.crypto.randomBytes(12),
      tagLength: 128,
    };
    const data = kb.rt.crypto.randomBytes(122);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(await kb.rt.crypto.encrypt(algo, (await res.Ok().get())!.key, data))
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      .toEqual(await kb.rt.crypto.encrypt(algo, (await created.Ok().get())!.key, data));
    const kf = (await created.Ok().get()) as bs.KeyWithFingerPrint;
    expect(await kb.rt.crypto.encrypt(algo, await kb.subtleKey(Object.values(diskBag.keys)[0].key), data)).toEqual(
      await kb.rt.crypto.encrypt(algo, kf.key, data),
    );
    expect(await kb.rt.crypto.encrypt(algo, await kb.subtleKey(Object.values(diskBag2.keys)[0].key), data)).toEqual(
      await kb.rt.crypto.encrypt(algo, kf.key, data),
    );
  });

  it("default key", async () => {
    const kb = await rt.kb.getKeyBag(sthis, {
      url: url.build().setParam("extractKey", "_deprecated_internal_api"),
    });
    const name = "default-key" + Math.random();
    const rMyKey = await kb.getNamedKey(name);

    for (let i = 0; i < 10; ++i) {
      expect(await kb.getNamedKey(name).then((i) => i.Ok().id)).toEqual(rMyKey.Ok().id);
    }
    expect(Object.keys((await kb.getNamedKey(name).then((i) => i.Ok().asKeysItem())).keys).length).toBe(1);

    const myKey = (await rMyKey.Ok().get()) as bs.KeyWithFingerPrint;
    expect(myKey.fingerPrint).toMatch(/^z/);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await rMyKey.Ok().upsert((await myKey.extract())!.key);
    const myKey1 = (await rMyKey.Ok().get()) as bs.KeyWithFingerPrint;
    expect(myKey.fingerPrint).toEqual(myKey1.fingerPrint);

    expect(Object.keys((await kb.getNamedKey(name).then((i) => i.Ok().asKeysItem())).keys).length).toBe(1);

    const rMyKey1 = await kb.getNamedKey(name);
    expect(rMyKey1.Ok()).toEqual(rMyKey.Ok());
    const res1 = await rMyKey1.Ok().upsert(kb.rt.crypto.randomBytes(kb.rt.keyLength));
    expect(res1.isOk()).toBeTruthy();

    const myKey2 = (await rMyKey1.Ok().get()) as bs.KeyWithFingerPrint;
    expect(myKey.fingerPrint).toEqual(myKey2.fingerPrint);
    expect(Object.keys((await kb.getNamedKey(name).then((i) => i.Ok().asKeysItem())).keys).length).toBe(2);

    const res = await rMyKey1.Ok().upsert(kb.rt.crypto.randomBytes(kb.rt.keyLength), true);
    expect(res.isOk()).toBeTruthy();
    const myKey3 = (await rMyKey.Ok().get()) as bs.KeyWithFingerPrint;
    expect(Object.keys((await kb.getNamedKey(name).then((i) => i.Ok().asKeysItem())).keys).length).toBe(3);

    expect(myKey.fingerPrint).not.toEqual(myKey3.fingerPrint);
  });

  it("default and multiple fingerprints", async () => {
    const kb = await rt.kb.getKeyBag(sthis, {
      url: url.toString(),
      crypto: toCryptoRuntime({
        randomBytes: (size) => new Uint8Array(size).map((_, i) => i),
      }),
    });
    const key = base58btc.encode(kb.rt.crypto.randomBytes(kb.rt.keyLength));
    const name = "default-key" + Math.random();
    const fpr = (await rt.toKeyWithFingerPrint(kb, key)).Ok().fingerPrint;
    const rMyKey = await kb.getNamedKey(name, false, key);
    expect(rMyKey.isOk()).toBeTruthy();
    const myKey = rMyKey.Ok();

    const rUpsert1 = await myKey.upsert(key, true);
    expect(rUpsert1.Ok().modified).toBeFalsy();

    expect((await myKey.get())?.fingerPrint).toEqual(fpr);
    expect((await myKey.get(fpr))?.fingerPrint).toEqual(fpr);

    const keys = [{ key, fpr }];
    for (let i = 0; i < 10; ++i) {
      const key = base58btc.encode(kb.rt.crypto.randomBytes(kb.rt.keyLength));
      const fpr = (await rt.toKeyWithFingerPrint(kb, key)).Ok().fingerPrint;
      keys.push({ key, fpr });
      const rUpsert = await myKey.upsert(key, true);
      expect(rUpsert.Ok().modified).toBeTruthy();
      for (const { fpr } of keys) {
        expect((await myKey.get(fpr))?.fingerPrint).toEqual(fpr);
      }
      expect((await myKey.get())?.fingerPrint).toEqual(fpr);
    }
    await kb.flush();
    const provider = await kb.rt.getBagProvider();
    let diskBag: rt.kb.KeysItem;
    if (!("_prepare" in provider)) {
      diskBag = (await provider.get(name)) as rt.kb.KeysItem;
    } else {
      if (runtimeFn().isBrowser) {
        const p = provider as KeyBagProviderIndexedDB;
        diskBag = await p._prepare().then((db) => db.get("bag", name));
      } else {
        const p = provider as rt.gw.file.KeyBagProviderFile;
        const { sysFS } = await p._prepare(name);
        diskBag = await sysFS.readfile((await p._prepare(name)).fName).then((data) => {
          return JSON.parse(sthis.txt.decode(data)) as rt.kb.KeysItem;
        });
      }
    }
    expect(Object.values(diskBag.keys).length).toEqual(keys.length);
  });
});

describe("KeyedCryptoStore", () => {
  let kb: rt.kb.KeyBag;
  // let logger: Logger;
  let baseUrl: URI;
  const sthis = ensureSuperThis();
  let loader: bs.Loadable;
  beforeEach(async () => {
    await sthis.start();
    // logger = MockLogger().logger;
    // let kbUrl: URI;
    // if (runtimeFn().isBrowser) {
    //   kbUrl = URI.from("indexeddb://fp-keybag");
    //   baseUrl = URI.from("indexeddb://fp-keyed-crypto-store");
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
    loader = mockLoader(sthis);
  });
  it("no crypto", async () => {
    const url = baseUrl.build().setParam(PARAM.STORE_KEY, "insecure").URI();

    for (const pstore of (await bs.createAttachedStores(url, loader, "insecure")).stores.baseStores) {
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
    for (const pstore of (await bs.createAttachedStores(baseUrl, loader, "insecure")).stores.baseStores) {
      const store = await pstore; // await bs.ensureStart(await pstore, logger);
      const kc = await store.keyedCrypto();
      expect(kc.constructor.name).toBe("cryptoAction");
      // expect(kc.isEncrypting).toBe(true);
      expect(store.url().getParam(PARAM.STORE_KEY)).toBe(
        `@test-${storeType2DataMetaWal(store.url().getParam(PARAM.STORE) as StoreType)}@`,
      );
    }
  });

  it("key ref keybag", async () => {
    const key = base58btc.encode(kb.rt.crypto.randomBytes(kb.rt.keyLength));
    const genKey = await kb.getNamedKey("@heute@", false, key);
    const url = baseUrl.build().setParam(PARAM.STORE_KEY, "@heute@").URI();
    for (const pstore of (await bs.createAttachedStores(url, loader, "insecure")).stores.baseStores) {
      const store = await pstore;
      // await store.start();
      expect(store.url().getParam(PARAM.STORE_KEY)).toBe(`@heute@`);
      const kc = await store.keyedCrypto();
      expect(kc.constructor.name).toBe("cryptoAction");
      const testData = kb.rt.crypto.randomBytes(1024);
      const iv = kb.rt.crypto.randomBytes(12);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const blk = await kc._encrypt({ bytes: testData, key: (await kc.key.get())!.key, iv });
      expect(blk).not.toEqual(testData);
      const fpkey = (await genKey.Ok().get()) as bs.KeyWithFingerPrint;
      expect(fpkey.fingerPrint).toEqual(fpkey.fingerPrint);
      const dec = new Uint8Array(await kc.crypto.decrypt(kc.algo(iv), fpkey.key, blk));
      expect(dec).toEqual(testData);
    }
  });

  it("key", async () => {
    const key = base58btc.encode(kb.rt.crypto.randomBytes(kb.rt.keyLength));
    const url = baseUrl.build().setParam(PARAM.STORE_KEY, key).URI();
    for (const pstore of (await bs.createAttachedStores(url, loader, "insecure")).stores.baseStores) {
      // for (const pstore of [strt.makeDataStore(loader), strt.makeMetaStore(loader), strt.makeWALStore(loader)]) {
      const store = await pstore;
      // await store.start();
      expect(store.url().getParam(PARAM.STORE_KEY)).toBe(key);
      const kc = await store.keyedCrypto();
      expect(kc.constructor.name).toBe("cryptoAction");
      const testData = kb.rt.crypto.randomBytes(1024);
      const iv = kb.rt.crypto.randomBytes(12);
      const ks = (await kc.key.get()) as bs.KeyWithFingerPrint;
      const blk = await kc._encrypt({ bytes: testData, key: ks.key, iv });
      expect(blk).not.toEqual(testData);
      const dec = await kc._decrypt({ bytes: blk, key: ks.key, iv });
      expect(dec).toEqual(testData);
    }
  });
});

describe("KeyedCrypto", () => {
  let kb: rt.kb.KeyBag;
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
    const myDec = cborg.decode(blk) as bs.IvKeyIdData;
    expect(myDec.iv).toEqual(iv);
    const kc = (await kycr.key.get()) as bs.KeyWithFingerPrint;
    expect(base58btc.encode(myDec.keyId)).toEqual(kc.fingerPrint);
    const dec = await codec.decode(blk);
    expect(dec.data).toEqual(testData);
  });

  it("codec implict iv", async () => {
    const testData = kb.rt.crypto.randomBytes(1024);
    const codec = kycr.codec();
    const blk = await codec.encode(testData);
    expect(blk.length).toBeGreaterThanOrEqual(12 + testData.length);
    const dec = await codec.decode(blk);
    expect(dec.data).toEqual(testData);
  });

  it("codec implict iv same for multiple clients", async () => {
    const testData = kb.rt.crypto.randomBytes(1024);
    const codec = kycr.codec();
    const blk = await codec.encode(testData);
    const blk2 = await codec.encode(testData);
    expect(blk).toEqual(blk2);
  });
});
