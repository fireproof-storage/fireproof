import { bs, PARAM, rt } from "@fireproof/core";
import { runtimeFn, toCryptoRuntime, URI } from "@adviser/cement";
import { base58btc } from "multiformats/bases/base58";
import { mockSuperThis } from "../helpers.js";
import { KeyBagProviderIndexDB } from "@fireproof/core/indexdb";

describe("KeyBag indexdb and file", () => {
  let url: URI;
  const sthis = mockSuperThis();
  beforeAll(async () => {
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
  // let logger: Logger;
  let baseUrl: URI;
  const sthis = mockSuperThis();
  beforeEach(async () => {
    await sthis.start();
    // logger = MockLogger().logger;
    let kbUrl: URI;
    if (runtimeFn().isBrowser) {
      kbUrl = URI.from("indexdb://fp-keybag");
      baseUrl = URI.from("indexdb://fp-keyed-crypto-store");
    } else {
      kbUrl = URI.merge(`file://./dist/tests/key.bag`, sthis.env.get("FP_KEYBAG_URL"));
      baseUrl = URI.merge("file://./dist/tests/keyed-crypto-store", sthis.env.get("FP_STORAGE_URL"));
    }
    baseUrl = baseUrl.build().defParam(PARAM.NAME, "test").URI();
    loader = {
      keyBag: () => rt.kb.getKeyBag(sthis, { url: kbUrl }),
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
    }
  });
});
