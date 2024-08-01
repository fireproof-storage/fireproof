import { bs, rt } from "@fireproof/core";
import { Logger, MockLogger } from "@adviser/cement";
import { base58btc } from "multiformats/bases/base58";
import { runtimeFn } from "../../src/runtime";

describe("KeyBag", () => {
  let url: string;
  beforeAll(async () => {
    await rt.SysContainer.start();
    if (runtimeFn().isBrowser) {
      url = "indexdb://fp-keybag";
    } else {
      url = `file://./dist/tests/key.bag`;
    }
  });
  it("default-path", async () => {
    const old = rt.SysContainer.env.get("FP_KEYBAG_URL");
    rt.SysContainer.env.delete("FP_KEYBAG_URL");
    const kb = await rt.kb.getKeyBag();
    if (runtimeFn().isBrowser) {
      expect(kb.rt.url.toString()).toBe(`indexdb://fp-keybag`);
    } else {
      expect(kb.rt.url.toString()).toBe(`file://${rt.SysContainer.env.get("HOME")}/.fireproof/keybag`);
    }
    rt.SysContainer.env.set("FP_KEYBAG_URL", old);
  });
  it("from env", async () => {
    const old = rt.SysContainer.env.get("FP_KEYBAG_URL");
    rt.SysContainer.env.set("FP_KEYBAG_URL", url);
    const kb = await rt.kb.getKeyBag();
    expect(kb.rt.url.toString()).toBe(url);
    rt.SysContainer.env.set("FP_KEYBAG_URL", old);
  });
  it("simple add", async () => {
    const kb = await rt.kb.getKeyBag({
      url,
      crypto: rt.crypto.toCryptoRuntime({
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
      const p = provider as rt.kb.KeyBagProviderIndexDB;
      diskBag = await p._prepare().then((db) => db.get("bag", name));
      diskBag2 = await p._prepare().then((db) => db.get("bag", name2));
    } else {
      const p = provider as rt.kb.KeyBagProviderFile;
      diskBag = await rt.SysContainer.readfile((await p._prepare(name)).fName).then((data) => {
        return JSON.parse(new TextDecoder().decode(data)) as rt.kb.KeyItem;
      });
      diskBag2 = await rt.SysContainer.readfile((await p._prepare(name2)).fName).then((data) => {
        return JSON.parse(new TextDecoder().decode(data)) as rt.kb.KeyItem;
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
  let kb: rt.kb.KeyBag;
  let logger: Logger;
  let baseUrl: string;
  beforeEach(async () => {
    await rt.SysContainer.start();
    logger = MockLogger().logger;
    let kbUrl: string;
    if (runtimeFn().isBrowser) {
      kbUrl = "indexdb://fp-keybag";
      baseUrl = "indexdb://fp-keyed-crypto-store";
    } else {
      kbUrl = `file://./dist/tests/key.bag`;
      baseUrl = "file://./dist/tests/keyed-crypto-store";
    }
    kb = await rt.kb.getKeyBag({
      url: kbUrl,
    });
  });
  it("no crypto", async () => {
    const loader = {
      name: "test",
      ebOpts: {
        keyBag: {
          keyRuntime: kb.rt,
        },
        store: {
          stores: {
            base: `${baseUrl}?storekey=insecure`,
          },
        },
      },
    } as unknown as bs.Loadable;
    const strt = bs.toStoreRuntime({}, logger);

    for (const pstore of [strt.makeDataStore(loader), strt.makeMetaStore(loader), strt.makeWALStore(loader)]) {
      const store = await pstore;
      // await store.start();
      const kc = await store.keyedCrypto();
      expect(kc.isEncrypting).toBe(false);
    }
  });

  it("create key", async () => {
    const loader = {
      name: "test",
      ebOpts: {
        keyBag: {
          keyRuntime: kb.rt,
        },
        store: {
          stores: {
            base: `${baseUrl}`,
          },
        },
      },
    } as unknown as bs.Loadable;
    const strt = bs.toStoreRuntime({}, logger);
    for (const pstore of [strt.makeDataStore(loader), strt.makeMetaStore(loader), strt.makeWALStore(loader)]) {
      const store = await pstore;
      // await store.start();
      const kc = await store.keyedCrypto();
      expect(kc.isEncrypting).toBe(true);
      expect(store.url.searchParams.get("storekey")).toBe(`@test:${store.url.searchParams.get("store")}@`);
    }
  });

  it("key ref keybag", async () => {
    const key = base58btc.encode(kb.rt.crypto.randomBytes(kb.rt.keyLength));
    const genKey = await kb.setNamedKey("@heute@", key);
    const loader = {
      name: "test",
      ebOpts: {
        keyBag: {
          keyRuntime: kb.rt,
        },
        store: {
          stores: {
            base: `${baseUrl}?storekey=@heute@`,
          },
        },
      },
    } as unknown as bs.Loadable;
    const strt = bs.toStoreRuntime({}, logger);
    for (const pstore of [strt.makeDataStore(loader), strt.makeMetaStore(loader), strt.makeWALStore(loader)]) {
      const store = await pstore;
      // await store.start();
      expect(store.url.searchParams.get("storekey")).toBe(`@heute@`);
      const kc = await store.keyedCrypto();
      expect(kc.isEncrypting).toBe(true);
      const testData = kb.rt.crypto.randomBytes(1024);
      const iv = kb.rt.crypto.randomBytes(12);
      const blk = await kc._encrypt({ bytes: testData, iv });
      expect(blk).not.toEqual(testData);
      const dec = await kc.crypto.decrypt(kc.algo(iv), genKey.Ok().key, blk);
      expect(dec).not.toEqual(testData);
    }
  });

  it("key", async () => {
    const key = base58btc.encode(kb.rt.crypto.randomBytes(kb.rt.keyLength));
    const loader = {
      name: "test",
      ebOpts: {
        keyBag: {
          keyRuntime: kb.rt,
        },
        store: {
          stores: {
            base: `${baseUrl}?storekey=${key}`,
          },
        },
      },
    } as unknown as bs.Loadable;
    const strt = bs.toStoreRuntime({}, logger);
    for (const pstore of [strt.makeDataStore(loader), strt.makeMetaStore(loader), strt.makeWALStore(loader)]) {
      const store = await pstore;
      // await store.start();
      expect(store.url.searchParams.get("storekey")).toBe(`@test:${store.url.searchParams.get("store")}@`);
      const kc = await store.keyedCrypto();
      expect(kc.isEncrypting).toBe(true);
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
  beforeEach(async () => {
    const logger = MockLogger().logger;
    let url: string;
    if (runtimeFn().isBrowser) {
      url = "indexdb://fp-keybag";
    } else {
      url = `file://./dist/tests/key.bag`;
    }
    kb = await rt.kb.getKeyBag({
      url,
    });
    keyStr = base58btc.encode(kb.rt.crypto.randomBytes(kb.rt.keyLength));
    kycr = await rt.kc.keyedCryptoFactory(new URL(`test://bla?storekey=${keyStr}`), kb, logger);
  });
  it("codec explict iv", async () => {
    const testData = kb.rt.crypto.randomBytes(1024);
    const iv = kb.rt.crypto.randomBytes(12);
    const codec = kycr.codec(iv);
    const blk = await codec.encode(testData);
    expect(blk.length).toBeGreaterThanOrEqual(iv.length + testData.length);
    expect(blk.slice(1, 1 + 12)).toEqual(iv);
    expect(base58btc.encode(blk.slice(1 + 12 + 1, 1 + 12 + 1 + 256 / 8))).toEqual(await kycr.fingerPrint());
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
});

describe("KeyedCryptoStore RunLength", () => {
  const logger = MockLogger().logger;
  it("de/encode", () => {
    for (const data of [
      new Uint8Array(),
      new Uint8Array(10).fill(10),
      new Uint8Array(127).fill(127),
      new Uint8Array(128).fill(128),
      new Uint8Array(1024).fill(17),
    ]) {
      const res = rt.kc.encodeRunLength(data, logger);
      expect(res.length).toBeLessThanOrEqual(data.length + (data.length > 127 ? 4 : 1));
      for (let ofs = 0; ofs < 1024; ofs += 61) {
        const ofsRes = new Uint8Array([...new Uint8Array(ofs).fill(23), ...res]);
        const dec = rt.kc.decodeRunLength(ofsRes, ofs, logger);
        expect(dec.data).toEqual(data);
        expect(dec.data.length).toBe(data.length);
        expect(dec.next).toBe(ofs + data.length + (data.length > 127 ? 4 : 1));
      }
    }
  });
});
