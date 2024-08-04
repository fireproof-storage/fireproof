import { bs, rt } from "@fireproof/core";
import { Logger, MockLogger, runtimeFn, toCryptoRuntime, URI } from "@adviser/cement";
import { base58btc } from "multiformats/bases/base58";
import { sha256 as hasher } from "multiformats/hashes/sha2";
import * as dagCodec from "@ipld/dag-cbor";
import { IvKeyIdData } from "../../src/blockstore";

describe("KeyBag", () => {
  let url: URI;
  beforeAll(async () => {
    await rt.SysContainer.start();
    if (runtimeFn().isBrowser) {
      url = URI.from("indexdb://fp-keybag");
    } else {
      url = URI.merge(`file://./dist/tests/key.bag`,  rt.SysContainer.env.get("FP_KEYBAG_URL"));
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
    rt.SysContainer.env.set("FP_KEYBAG_URL", url.toString());
    const kb = await rt.kb.getKeyBag();
    expect(kb.rt.url.toString()).toBe(url.toString());
    rt.SysContainer.env.set("FP_KEYBAG_URL", old);
  });
  it("simple add", async () => {
    const kb = await rt.kb.getKeyBag({
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
      const p = provider as rt.kb.KeyBagProviderIndexDB;
      diskBag = await p._prepare().then((db) => db.get("bag", name));
      diskBag2 = await p._prepare().then((db) => db.get("bag", name2));
    } else {
      const p = provider as rt.kb.KeyBagProviderFile;
      const {sysFS } = await p._prepare(name);

      diskBag = await sysFS.readfile((await p._prepare(name)).fName).then((data) => {
        return JSON.parse(new TextDecoder().decode(data)) as rt.kb.KeyItem;
      });
      diskBag2 = await sysFS.readfile((await p._prepare(name2)).fName).then((data) => {
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
  let baseUrl: URI;
  beforeEach(async () => {
    await rt.SysContainer.start();
    logger = MockLogger().logger;
    let kbUrl: URI;
    if (runtimeFn().isBrowser) {
      kbUrl = URI.from("indexdb://fp-keybag");
      baseUrl = URI.from("indexdb://fp-keyed-crypto-store");
    } else {
      kbUrl = URI.merge(`file://./dist/tests/key.bag`, rt.SysContainer.env.get("FP_KEYBAG_URL"));
      baseUrl = URI.merge("file://./dist/tests/keyed-crypto-store", rt.SysContainer.env.get("FP_STORAGE_URL"));
    }
    kb = await rt.kb.getKeyBag({
      url: kbUrl
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
            base: baseUrl.build().setParam("storekey", "insecure").URI(),
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
            base: baseUrl,
          },
        },
      },
    } as unknown as bs.Loadable;
    const strt = bs.toStoreRuntime({}, logger);
    for (const pstore of [strt.makeDataStore(loader), strt.makeMetaStore(loader), strt.makeWALStore(loader)]) {
      const store = await pstore;
      // await store.start();
      console.log("store", store.url().toString(), baseUrl.toString());
      const kc = await store.keyedCrypto();
      expect(kc.isEncrypting).toBe(true);
      expect(store.url().getParam("storekey")).toBe(`@test:${store.url().getParam("store")}@`);
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
            base: baseUrl.build().setParam("storekey", "@heute@").URI(),
          },
        },
      },
    } as unknown as bs.Loadable;
    const strt = bs.toStoreRuntime({}, logger);
    for (const pstore of [strt.makeDataStore(loader), strt.makeMetaStore(loader), strt.makeWALStore(loader)]) {
      const store = await pstore;
      // await store.start();
      expect(store.url().getParam("storekey")).toBe(`@heute@`);
      const kc = await store.keyedCrypto();
      expect(kc.isEncrypting).toBe(true);
      const testData = kb.rt.crypto.randomBytes(1024);
      const iv = kb.rt.crypto.randomBytes(12);
      const blk = await kc._encrypt({ bytes: testData, iv });
      expect(blk).not.toEqual(testData);
      const fpkey = genKey.Ok()
      expect(fpkey.fingerPrint).toEqual(await kc.fingerPrint());
      const dec = new Uint8Array(await kc.crypto.decrypt(kc.algo(iv), fpkey.key, blk));
      expect(dec).toEqual(testData);
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
      expect(store.url().getParam("storekey")).toBe(`@test:${store.url().getParam("store")}@`);
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
    let url: URI;
    if (runtimeFn().isBrowser) {
      url = URI.from("indexdb://fp-keybag");
    } else {
      url = URI.merge(`file://./dist/tests/key.bag`, rt.SysContainer.env.get("FP_KEYBAG_URL"));
    }
    kb = await rt.kb.getKeyBag({
      url,
    });
    keyStr = base58btc.encode(kb.rt.crypto.randomBytes(kb.rt.keyLength));
    kycr = await rt.kc.keyedCryptoFactory(URI.from(`test://bla?storekey=${keyStr}`), kb, logger);
  });
  it("codec explict iv", async () => {
    const testData = kb.rt.crypto.randomBytes(1024);
    const iv = kb.rt.crypto.randomBytes(12);
    const codec = kycr.codec(iv);
    const blk = (await codec.encode(testData)) as Uint8Array;
    const myDec = await rt.mf.block.decode<IvKeyIdData, number,number>({bytes: blk, hasher, codec: dagCodec });
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
});

// describe("KeyedCryptoStore RunLength", () => {
//   const logger = MockLogger().logger;
//   it("de/encode", () => {
//     for (const data of [
//       new Uint8Array(),
//       new Uint8Array(10).fill(10),
//       new Uint8Array(127).fill(127),
//       new Uint8Array(128).fill(128),
//       new Uint8Array(1024).fill(17),
//     ]) {
//       const res = rt.kc.encodeRunLength(data, logger);
//       expect(res.length).toBeLessThanOrEqual(data.length + (data.length > 127 ? 4 : 1));
//       for (let ofs = 0; ofs < 1024; ofs += 61) {
//         const ofsRes = new Uint8Array([...new Uint8Array(ofs).fill(23), ...res]);
//         const dec = rt.kc.decodeRunLength(ofsRes, ofs, logger);
//         expect(dec.data).toEqual(data);
//         expect(dec.data.length).toBe(data.length);
//         expect(dec.next).toBe(ofs + data.length + (data.length > 127 ? 4 : 1));
//       }
//     }
//   });
// });
