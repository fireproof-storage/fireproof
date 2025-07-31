import { Result, URI } from "@adviser/cement";
import { getKeyBag, KeyBagProviderMemory } from "@fireproof/core-keybag";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { KeyBagIf, V2KeysItem, V2StorageKeyItem } from "@fireproof/core-types-base";
import { isKeyUpsertResultModified, KeysByFingerprint } from "@fireproof/core-types-blockstore";
import { base58btc } from "multiformats/bases/base58";
import { assert, describe, expect, it } from "vitest";

// const v2Keybag = {
//   name: "@test-v1-keys-wal@",
//   keys: {
//     z7oNYUrGpALe6U5ePvhdD3ufHdLerw4wPWHJERE3383zJ: {
//       default: true,
//       fingerPrint: "z7oNYUrGpALe6U5ePvhdD3ufHdLerw4wPWHJERE3383zJ",
//       key: "zL89nmBmogeRptW9b7e9j7L",
//     },
//   },
// };

const v1Keybag = {
  name: "@test-v1-keys-wal@",
  key: "zL89nmBmogeRptW9b7e9j7L",
};

async function keyExtracted(
  rKbf: Result<KeysByFingerprint>,
  fingerPrint?: string,
): Promise<{ fingerPrint: string; key: string } | undefined> {
  const kbf = await rKbf.Ok().get(fingerPrint);
  if (!kbf) {
    return undefined;
  }
  return {
    fingerPrint: kbf.fingerPrint,
    key: (await kbf.extract()).keyStr,
  };
}

async function calculateFingerprint(rKbf: Result<KeysByFingerprint>, kb: KeyBagIf): Promise<string> {
  const item = await rKbf.Ok().get();
  const v2Item = await (
    item as unknown as {
      asV2StorageKeyItem: () => Promise<V2StorageKeyItem>;
    }
  ).asV2StorageKeyItem();
  const keyBytes = base58btc.decode(v2Item.key);
  const hash = await kb.rt.crypto.digestSHA256(keyBytes);
  return base58btc.encode(new Uint8Array(hash));
}

describe("KeyBag", () => {
  it("v1 migration", async () => {
    const sthis = ensureSuperThis();
    await sthis.start();

    const kp = new KeyBagProviderMemory(URI.from("memory://./dist/tests/"), sthis);
    kp.set(v1Keybag as unknown as V2KeysItem);

    const kb = await getKeyBag(sthis, {
      url: "memory://./dist/tests/?extractKey=_deprecated_internal_api",
    });
    const rKbf = await kb.getNamedKey("@test-v1-keys-wal@");
    expect(rKbf.isOk()).toBeTruthy();

    const fpr = await calculateFingerprint(rKbf, kb);

    expect(await rKbf.Ok().asV2KeysItem()).toEqual({
      keys: {
        z7oNYUrGpALe6U5ePvhdD3ufHdLerw4wPWHJERE3383zJ: {
          default: true,
          fingerPrint: fpr,
          key: "zL89nmBmogeRptW9b7e9j7L",
        },
      },
      name: "@test-v1-keys-wal@",
    });

    const kb2 = await getKeyBag(sthis, {
      url: "memory://./dist/tests/?extractKey=_deprecated_internal_api",
    });
    for (const rkbf of [rKbf, await kb2.getNamedKey("@test-v1-keys-wal@")]) {
      expect(await keyExtracted(rkbf)).toEqual({
        fingerPrint: "z7oNYUrGpALe6U5ePvhdD3ufHdLerw4wPWHJERE3383zJ",
        key: "zL89nmBmogeRptW9b7e9j7L",
      });
      expect(await keyExtracted(rkbf, "z7oNYUrGpALe6U5ePvhdD3ufHdLerw4wPWHJERE3383zJ")).toEqual({
        fingerPrint: "z7oNYUrGpALe6U5ePvhdD3ufHdLerw4wPWHJERE3383zJ",
        key: "zL89nmBmogeRptW9b7e9j7L",
      });
      expect(await keyExtracted(rkbf, "kaputt-x")).toBeUndefined();
    }
    expect(await kp.get(v1Keybag.name)).toEqual({
      keys: {
        z7oNYUrGpALe6U5ePvhdD3ufHdLerw4wPWHJERE3383zJ: {
          default: true,
          fingerPrint: "z7oNYUrGpALe6U5ePvhdD3ufHdLerw4wPWHJERE3383zJ",
          key: "zL89nmBmogeRptW9b7e9j7L",
        },
      },
      name: "@test-v1-keys-wal@",
    });
  });

  it("implicit creation", async () => {
    const sthis = ensureSuperThis();
    await sthis.start();

    const kp = new KeyBagProviderMemory(URI.from("memory://./dist/tests/"), sthis);
    kp.set(v1Keybag as unknown as V2KeysItem);

    const kb = await getKeyBag(sthis, {
      url: "memory://./dist/tests/?extractKey=_deprecated_internal_api",
    });
    const key1Material = kb.rt.crypto.randomBytes(kb.rt.keyLength);
    const rKbf = await kb.getNamedKey("kaputt", false, key1Material);
    expect(rKbf.isOk()).toBeTruthy();
    const one = await rKbf.Ok().asV2KeysItem();
    expect(Object.keys(one.keys).length).toBe(1);
    const key1Fpr = (await rKbf.Ok().get())?.fingerPrint;
    expect(await keyExtracted(rKbf)).toEqual({
      fingerPrint: key1Fpr,
      key: base58btc.encode(key1Material),
    });

    const key2Material = kb.rt.crypto.randomBytes(kb.rt.keyLength);
    const rKey2 = await rKbf.Ok().upsert(key2Material);
    const key2 = rKey2.Ok();
    if (!isKeyUpsertResultModified(key2)) {
      assert("key2 not modified");
      return;
    }

    const keys2 = await rKbf.Ok().asV2KeysItem();
    expect(Object.keys(keys2.keys).length).toBe(2);

    expect(await kp.get("kaputt")).toEqual(keys2);

    const rKbf2 = await kb.getNamedKey("kaputt");

    expect(Object.keys(await rKbf2.Ok().asV2KeysItem()).length).toBe(2);

    expect((await rKbf2.Ok().get())?.fingerPrint).toEqual(key1Fpr);

    const asKeysItem = await rKbf.Ok().asV2KeysItem();
    expect(asKeysItem.name).toEqual("kaputt");
    expect(Array.from(Object.values(asKeysItem.keys))).toEqual([
      {
        default: true,
        fingerPrint: key1Fpr,
        key: base58btc.encode(key1Material),
      },
      {
        default: false,
        fingerPrint: key2.kfp.fingerPrint,
        key: base58btc.encode(key2Material),
      },
    ]);

    const key3Material = kb.rt.crypto.randomBytes(kb.rt.keyLength);
    const rKey3 = await rKbf2.Ok().upsert(key3Material, true);
    const key3 = rKey3.Ok();
    if (!isKeyUpsertResultModified(key3)) {
      assert("key3 not modified");
      return;
    }

    expect(
      Object.keys(
        await rKbf2
          .Ok()
          .asV2KeysItem()
          .then((i) => i.keys),
      ).length,
    ).toBe(3);
    const v2Key3 = await (key3.kfp as unknown as { asV2StorageKeyItem: () => Promise<V2StorageKeyItem> }).asV2StorageKeyItem();

    expect(await kp.get("kaputt")).toEqual({
      keys: {
        ...resetDefault(one.keys),
        ...resetDefault(keys2.keys),
        [v2Key3.fingerPrint]: v2Key3,
      },
      name: "kaputt",
    });
  });

  it("simple default", async () => {
    const sthis = ensureSuperThis();
    await sthis.start();

    const kb = await getKeyBag(sthis);

    const keyName = "simple" + sthis.nextId().str;

    const rKbf1 = await kb.getNamedKey(keyName);
    const kfp1 = await rKbf1
      .Ok()
      .get()
      .then((i) => (i as unknown as { asV2StorageKeyItem: () => Promise<V2StorageKeyItem> }).asV2StorageKeyItem());
    expect(kfp1?.fingerPrint).toBeTypeOf("string");

    const rKbf2 = await kb.getNamedKey(keyName);
    expect(await rKbf2.Ok().get()).toBeDefined();
    const kfp2 = await rKbf2.Ok().get();
    expect(kfp1?.fingerPrint).toBe(kfp2?.fingerPrint);

    expect(await kb.rt.getBagProvider().then((i) => i.get(keyName))).toEqual({
      keys: {
        [kfp1?.fingerPrint as string]: {
          default: true,
          fingerPrint: kfp1?.fingerPrint,
          key: kfp1?.key,
        },
      },
      name: keyName,
    });
  });
  it("test stable id", async () => {
    const sthis = ensureSuperThis();
    await sthis.start();

    const kp = new KeyBagProviderMemory(URI.from("memory://./dist/tests/"), sthis);
    kp.set(v1Keybag as unknown as V2KeysItem);

    const kb = await getKeyBag(sthis, {
      url: "memory://./dist/tests/?extractKey=_deprecated_internal_api",
    });

    const name = "default-key" + Math.random();
    const rMyKey = await kb.getNamedKey(name);

    for (let i = 0; i < 10; ++i) {
      expect(await kb.getNamedKey(name).then((i) => i.Ok().id)).toEqual(rMyKey.Ok().id);
    }
  });
});

function resetDefault(keys: Record<string, V2StorageKeyItem>) {
  return Array.from(Object.values(keys)).reduce(
    (acc, i) => ({ ...acc, [i.fingerPrint]: { ...i, default: false } }),
    {} as Record<string, V2StorageKeyItem>,
  );
}
