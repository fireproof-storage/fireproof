import { bs, ensureSuperThis, PARAM, rt } from "@fireproof/core";
import { runtimeFn, toCryptoRuntime, URI } from "@adviser/cement";
import { base58btc } from "multiformats/bases/base58";
import { mockLoader, mockSuperThis } from "../helpers.js";
import { KeyBagProviderIndexedDB } from "@fireproof/core/indexeddb";

describe("KeyBag indexeddb and file", () => {
  let url: URI;
  const sthis = mockSuperThis();
  beforeAll(async () => {
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
      const { sysFS } = await p._prepare(name);

      diskBag = await sysFS.readfile((await p._prepare(name)).fName).then((data) => {
        return JSON.parse(sthis.txt.decode(data)) as rt.kb.KeysItem;
      });
      diskBag2 = await sysFS.readfile((await p._prepare(name2)).fName).then((data) => {
        return JSON.parse(sthis.txt.decode(data)) as rt.kb.KeysItem;
      });
    }
    expect((await rt.kb.toKeyWithFingerPrint(kb, Object.values(diskBag.keys)[0].key)).Ok().fingerPrint).toEqual(
      (await res.Ok().get())?.fingerPrint,
    );
    expect((await rt.kb.toKeyWithFingerPrint(kb, Object.values(diskBag2.keys)[0].key)).Ok().fingerPrint).toEqual(
      (await created.Ok().get())?.fingerPrint,
    );
    const algo = {
      name: "AES-GCM",
      iv: kb.rt.crypto.randomBytes(12),
      tagLength: 128,
    };
    const data = kb.rt.crypto.randomBytes(122);
    const rkc = (await res.Ok().get()) as bs.KeyWithFingerPrint;
    const ckc = (await created.Ok().get()) as bs.KeyWithFingerPrint;
    expect(await kb.rt.crypto.encrypt(algo, rkc.key, data)).toEqual(await kb.rt.crypto.encrypt(algo, ckc.key, data));
    expect(await kb.rt.crypto.encrypt(algo, await kb.subtleKey(Object.values(diskBag.keys)[0].key), data)).toEqual(
      await kb.rt.crypto.encrypt(algo, ckc.key, data),
    );
    expect(await kb.rt.crypto.encrypt(algo, await kb.subtleKey(Object.values(diskBag2.keys)[0].key), data)).toEqual(
      await kb.rt.crypto.encrypt(algo, ckc.key, data),
    );
  });
});

describe("KeyedCryptoStore", () => {
  let loader: bs.Loadable;
  // let logger: Logger;
  let baseUrl: URI;
  const sthis = ensureSuperThis();
  beforeEach(async () => {
    await sthis.start();
    // logger = MockLogger().logger;
    // let kbUrl: URI;
    if (runtimeFn().isBrowser) {
      // kbUrl = URI.from("indexeddb://fp-keybag");
      baseUrl = URI.from("indexeddb://fp-keyed-crypto-store");
    } else {
      // kbUrl = URI.merge(`file://./dist/tests/key.bag`, sthis.env.get("FP_KEYBAG_URL"));
      baseUrl = URI.merge("file://./dist/tests/keyed-crypto-store", sthis.env.get("FP_STORAGE_URL"));
    }
    baseUrl = baseUrl.build().defParam(PARAM.NAME, "test").URI();
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
    }
  });
});
