import { BuildURI, Result, URI } from "@adviser/cement";
import { DeviceIdKey } from "@fireproof/core-device-id";
import { getKeyBag, KeyBag, KeyBagProviderMemory } from "@fireproof/core-keybag";
import { ensureSuperThis } from "@fireproof/core-runtime";
import {
  IssueCertificateResult,
  JWKPrivate,
  JWTResult,
  KeyBagIf,
  KeyedV2StorageKeyItem,
  KeyedV2StorageKeyItemSchema,
  KeysByFingerprint,
  KeyWithFingerPrint,
} from "@fireproof/core-types-base";
import { isKeyUpsertResultModified } from "@fireproof/core-types-blockstore";
import { UnsecuredJWT } from "jose";
import { base58btc } from "multiformats/bases/base58";
import { assert, beforeEach, describe, expect, it } from "vitest";

const v2Keybag = {
  name: "@test-v1-keys-wal@",
  keys: {
    z7oNYUrGpALe6U5ePvhdD3ufHdLerw4wPWHJERE3383zJ: {
      default: true,
      fingerPrint: "z7oNYUrGpALe6U5ePvhdD3ufHdLerw4wPWHJERE3383zJ",
      key: "zL89nmBmogeRptW9b7e9j7L",
    },
  },
};

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
  const item = (await rKbf.Ok().get()) as KeyWithFingerPrint;
  const v2Item = await item.asKeysItem();
  const keyBytes = base58btc.decode(v2Item.key);
  const hash = await kb.rt.crypto.digestSHA256(keyBytes);
  return base58btc.encode(new Uint8Array(hash));
}

describe("KeyBag", () => {
  it("v1 migration", async () => {
    const sthis = ensureSuperThis();
    await sthis.start();

    const kp = new KeyBagProviderMemory(URI.from("memory://./dist/tests/"), sthis);
    await kp.set(v1Keybag.name, v1Keybag);

    const kb = await getKeyBag(sthis, {
      url: "memory://./dist/tests/?extractKey=_deprecated_internal_api",
    });
    const rKbf = await kb.getNamedKey("@test-v1-keys-wal@");
    expect(rKbf.isOk()).toBeTruthy();

    const fpr = await calculateFingerprint(rKbf, kb);

    expect(await rKbf.Ok().asV2StorageKeyItem()).toEqual({
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
    expect(await kp.get(v1Keybag.name)).toEqual(v1Keybag);
  });

  it("v2 migration", async () => {
    const sthis = ensureSuperThis();
    await sthis.start();

    const kp = new KeyBagProviderMemory(URI.from("memory://./dist/tests/"), sthis);
    kp.set(v2Keybag.name, v2Keybag);

    const kb = await getKeyBag(sthis, {
      url: "memory://./dist/tests/?extractKey=_deprecated_internal_api",
    });
    const rKbf = await kb.getNamedKey("@test-v1-keys-wal@");
    expect(rKbf.isOk()).toBeTruthy();

    const fpr = await calculateFingerprint(rKbf, kb);

    expect(await rKbf.Ok().asV2StorageKeyItem()).toEqual({
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

  it("don't write if on read only v1", async () => {
    const sthis = ensureSuperThis();
    await sthis.start();

    const kp = new KeyBagProviderMemory(URI.from("memory://./dist/tests/"), sthis);
    kp.set(v1Keybag.name, v1Keybag);

    const kb = await getKeyBag(sthis, {
      url: "memory://./dist/tests/",
    });
    const rKbf = await kb.getNamedKey(v1Keybag.name);
    expect(rKbf.isOk()).toBeTruthy();
    const orig = await kp.get(v1Keybag.name);
    expect(orig).toEqual(v1Keybag);
  });

  it("don't write if on read only v2", async () => {
    const sthis = ensureSuperThis();
    await sthis.start();

    const kp = new KeyBagProviderMemory(URI.from("memory://./dist/tests/"), sthis);
    kp.set(v2Keybag.name, v2Keybag);

    const kb = await getKeyBag(sthis, {
      url: "memory://./dist/tests/",
    });
    const rKbf = await kb.getNamedKey(v2Keybag.name);
    expect(rKbf.isOk()).toBeTruthy();
    const orig = await kp.get(v2Keybag.name);
    expect(orig).toEqual(v2Keybag);
  });

  it("implicit creation", async () => {
    const sthis = ensureSuperThis();
    await sthis.start();

    const kp = new KeyBagProviderMemory(URI.from("memory://./dist/tests/"), sthis);
    kp.set(v1Keybag.name, v1Keybag);

    const kb = await getKeyBag(sthis, {
      url: "memory://./dist/tests/?extractKey=_deprecated_internal_api",
    });
    const key1Material = kb.rt.crypto.randomBytes(kb.rt.keyLength);
    const rKbf = await kb.getNamedKey("kaputt", false, key1Material);
    expect(rKbf.isOk()).toBeTruthy();
    const one = await rKbf.Ok().asV2StorageKeyItem();
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

    const keys2 = await rKbf.Ok().asV2StorageKeyItem();
    expect(Object.keys(keys2.keys).length).toBe(2);

    expect(KeyedV2StorageKeyItemSchema.parse(await kp.get("kaputt")).item).toEqual(keys2);

    const rKbf2 = await kb.getNamedKey("kaputt");

    expect(Object.keys((await rKbf2.Ok().asV2StorageKeyItem()).keys).length).toBe(2);

    expect((await rKbf2.Ok().get())?.fingerPrint).toEqual(key1Fpr);

    const asKeysItem = await rKbf.Ok().asV2StorageKeyItem();
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
    const rKey3 = await rKbf2.Ok().upsert(key3Material, { def: true });
    const key3 = rKey3.Ok();
    if (!isKeyUpsertResultModified(key3)) {
      assert("key3 not modified");
      return;
    }

    expect(
      Object.keys(
        await rKbf2
          .Ok()
          .asV2StorageKeyItem()
          .then((i) => i.keys),
      ).length,
    ).toBe(3);
    const v2Key3 = await key3.kfp.asKeysItem();

    expect(KeyedV2StorageKeyItemSchema.parse(await kp.get("kaputt")).item).toEqual({
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

    const kb = (await getKeyBag(sthis)) as KeyBag;

    const keyName = "simple" + sthis.nextId().str;

    const rKbf1 = await kb.getNamedKey(keyName);
    const kfp1 = await rKbf1
      .Ok()
      .get()
      .then((i) => i?.asKeysItem());
    expect(kfp1?.fingerPrint).toBeTypeOf("string");

    const rKbf2 = await kb.getNamedKey(keyName);
    expect(await rKbf2.Ok().get()).toBeDefined();
    const kfp2 = await rKbf2.Ok().get();
    expect(kfp1?.fingerPrint).toBe(kfp2?.fingerPrint);

    expect(
      await kb.rt
        .getBagProvider()
        .then((i) => i.get(keyName))
        .then((i) => KeyedV2StorageKeyItemSchema.parse(i).item),
    ).toEqual({
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
    await kp.set(v1Keybag.name, v1Keybag);

    const kb = await getKeyBag(sthis, {
      url: "memory://./dist/tests/?extractKey=_deprecated_internal_api",
    });

    const name = "default-key" + Math.random();
    const rMyKey = await kb.getNamedKey(name);

    for (let i = 0; i < 10; ++i) {
      expect(await kb.getNamedKey(name).then((i) => i.Ok().id)).toEqual(rMyKey.Ok().id);
    }
  });

  describe("test device id", async () => {
    const sthis = ensureSuperThis();
    let kb: KeyBagIf;
    let key: JWKPrivate;
    const fakeCert: IssueCertificateResult = {
      certificateJWT: "JWT",
      certificatePayload: {
        iss: "",
        sub: "",
        aud: "",
        iat: 0,
        nbf: 0,
        exp: 0,
        jti: "",
        certificate: {
          version: "3",
          serialNumber: "4711",
          subject: {
            commonName: "Subject",
          },
          issuer: {
            commonName: "Issuer",
          },
          validity: {
            notBefore: new Date().toISOString(),
            notAfter: new Date().toISOString(),
          },
          subjectPublicKeyInfo: {
            kty: "EC",
            crv: "P-256",
            x: "x",
            y: "y",
          },
          signatureAlgorithm: "ES256",
          keyUsage: [],
          extendedKeyUsage: [],
        },
      },
      format: "JWS",
      serialNumber: "",
      issuer: "",
      subject: "",
      validityPeriod: {
        notBefore: new Date(),
        notAfter: new Date(),
      },
      publicKey: {
        kty: "EC",
        crv: "P-256",
        x: "x",
        y: "y",
      },
    };
    beforeEach(async () => {
      await sthis.start();
      const id = sthis.nextId().str;
      const url = BuildURI.from(`memory://./dist/tests/${id}`).setParam("extractKey", "_deprecated_internal_api").URI();
      kb = await getKeyBag(sthis, { url });
      key = await DeviceIdKey.create().then((i) => i.exportPrivateJWK());
    });
    it("return none if not set", async () => {
      const devId = await kb.getDeviceId();
      expect(devId.deviceId.IsNone()).toBeTruthy();
      expect(devId.cert.IsNone()).toBeTruthy();
    });
    it("set and get device id", async () => {
      const rSet = await kb.setDeviceId(key);
      expect(rSet.deviceId.IsSome()).toBeTruthy();
      expect(rSet.deviceId.Unwrap()).toEqual(key);
      expect(rSet.cert.IsNone()).toBeTruthy();

      const rGet = await kb.getDeviceId();
      expect(rGet.deviceId.IsSome()).toBeTruthy();
      expect(rGet.deviceId.Unwrap()).toEqual(key);
      expect(rGet.cert.IsNone()).toBeTruthy();
    });

    it("set and get device id with cert", async () => {
      const rSet = await kb.setDeviceId(key, fakeCert);
      expect(rSet.deviceId.Unwrap()).toEqual({
        kty: "EC",
        crv: "P-256",
        d: expect.any(String),
        x: expect.any(String),
        y: expect.any(String),
      });
      expect(rSet.cert.IsSome()).toBeTruthy();
      expect(rSet.cert.Unwrap()).toEqual(fakeCert);

      const rGet = await kb.getDeviceId();
      expect(rSet.deviceId.Unwrap()).toEqual({
        kty: "EC",
        crv: "P-256",
        d: expect.any(String),
        x: expect.any(String),
        y: expect.any(String),
      });
      expect(rGet.cert.IsNone()).toBeFalsy();
      expect(rGet.cert.Unwrap()).toEqual(fakeCert);
    });

    it("set and get device id stepped cert", async () => {
      await kb.setDeviceId(key);
      const rSet = await kb.setDeviceId(key, fakeCert);
      expect(rSet.deviceId.Unwrap()).toEqual(key);
      expect(rSet.cert.IsSome()).toBeTruthy();
      expect(rSet.cert.Unwrap()).toEqual(fakeCert);

      const rGet = await kb.getDeviceId();
      expect(rGet.deviceId.Unwrap()).toEqual(key);
      expect(rGet.cert.Unwrap()).toEqual(fakeCert);
    });
  });
  describe("jwt", () => {
    const sthis = ensureSuperThis();

    let kb: KeyBagIf;
    beforeEach(async () => {
      await sthis.start();
      kb = await getKeyBag(sthis, {
        url: "memory://./dist/murks/?extractKey=_deprecated_internal_api",
      });
    });

    it("set and get jwt", async () => {
      const rNotForundGet = await kb.getJwt("test");
      expect(rNotForundGet.isOk()).toBeFalsy();

      const jwt = new UnsecuredJWT({ hello: "world" })
        .setIssuedAt()
        .setIssuer("fpcloud")
        .setAudience("fpcloud-app")
        .setExpirationTime("24h")
        .setSubject("Test")
        .encode();

      const rSet = await kb.setJwt("test", jwt);
      expect(rSet.isOk()).toBeTruthy();

      const rGet = await kb.getJwt("test");
      expect(rGet.isOk()).toBeTruthy();
      expect(rGet.Ok()).toEqual({
        key: "test",
        jwt,
        claims: {
          hello: "world",
          iss: "fpcloud",
          aud: "fpcloud-app",
          sub: "Test",
          iat: expect.any(Number),
          exp: expect.any(Number),
        },
      } satisfies JWTResult);
    });
  });
});

function resetDefault(keys: KeyedV2StorageKeyItem["item"]["keys"]) {
  return Array.from(Object.values(keys)).reduce(
    (acc, i) => ({ ...acc, [i.fingerPrint]: { ...i, default: false } }),
    {} as KeyedV2StorageKeyItem["item"]["keys"],
  );
}
