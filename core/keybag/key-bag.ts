import { Lazy, ResolveOnce, Logger, URI, Result, Option, KeyedResolvOnce, exception2Result } from "@adviser/cement";
import { hashString, ensureLogger, hashObject } from "@fireproof/core-runtime";
import {
  KeyBagIf,
  KeyBagRuntime,
  PARAM,
  DeviceIdResult,
  JWKPrivate,
  DeviceIdKeyBagItem,
  KeysByFingerprint,
  LegacyKeyedItemSchema,
  KeyedItem,
  KeyedItemSchema,
  JWTPayload,
  KeyedJwtKeyBagItem,
  JWTResult,
  KeyedJwtKeyBagItemSchema,
  KeyedDeviceIdKeyBagItem,
  KeyedDeviceIdKeyBagItemSchema,
} from "@fireproof/core-types-base";
import { base58btc } from "multiformats/bases/base58";
import { InternalKeyBagFingerprintItem } from "./key-bag-fingerprint-item.js";
import { decodeJwt, JWK, jwtVerify, JWTVerifyOptions, KeyObject } from "jose";

// this should help to prevent that a the key of the device id is human readable
// thats only a Hausfrauensicherung(german might been offending)
const deviceIdKey = Lazy(() => hashString("FIREProof:deviceId"));

// this is type vise a little weak --- hopefully this will not slash back
type KeyBagItem = InternalKeyBagFingerprintItem | DeviceIdResult | Result<JWTResult>; // | DeviceIdItem | JWTItem

const namedKeyItemsPerUrl = new Map<string, KeyedResolvOnce<KeyBagItem>>();

export class KeyBag implements KeyBagIf {
  readonly logger: Logger;
  readonly rt: KeyBagRuntime;
  readonly #namedKeyItems: KeyedResolvOnce<KeyBagItem>;

  static async create(rt: KeyBagRuntime) {
    const urlHash = await hashObject(rt.url.toJSON());
    const namedKeyItems = namedKeyItemsPerUrl.get(urlHash) ?? new KeyedResolvOnce();
    return new KeyBag(rt, namedKeyItems);
  }

  private constructor(rt: KeyBagRuntime, namedKeyItems: KeyedResolvOnce<KeyBagItem>) {
    this.logger = ensureLogger(rt.sthis, "KeyBag");
    this.rt = rt;
    this.#namedKeyItems = namedKeyItems;
  }

  readonly _warnOnce: ResolveOnce<void> = new ResolveOnce<void>();
  async subtleKey(materialStrOrUint8: string | Uint8Array): Promise<CryptoKey> {
    const extractable = this.rt.url.getParam(PARAM.EXTRACTKEY) === "_deprecated_internal_api";
    if (extractable) {
      this._warnOnce.once(() => {
        this.logger.Warn().Msg("extractKey is enabled via _deprecated_internal_api --- handle keys safely!!!");
      });
    }
    let material: Uint8Array;
    if (typeof materialStrOrUint8 === "string") {
      material = base58btc.decode(materialStrOrUint8);
    } else {
      material = materialStrOrUint8;
    }
    return await this.rt.crypto.importKey(
      "raw", // raw or jwk
      material,
      // hexStringToUint8Array(key), // raw data
      "AES-GCM",
      extractable,
      ["encrypt", "decrypt"],
    );
  }

  async ensureKeyFromUrl(url: URI, keyFactory: () => string): Promise<Result<URI>> {
    // add storekey to url
    const storeKey = url.getParam(PARAM.STORE_KEY);
    if (storeKey === "insecure") {
      return Result.Ok(url);
    }
    if (!storeKey) {
      const keyName = `@${keyFactory()}@`;
      const ret = await this.getNamedKey(keyName);
      if (ret.isErr()) {
        return Result.Err(ret);
      }
      const urb = url.build().setParam(PARAM.STORE_KEY, keyName);
      return Result.Ok(urb.URI());
    }
    if (storeKey.startsWith("@") && storeKey.endsWith("@")) {
      const ret = await this.getNamedKey(storeKey);
      if (ret.isErr()) {
        return Result.Err(ret);
      }
    }
    return Result.Ok(url);
  }

  async getDeviceId(): Promise<DeviceIdResult> {
    const id = await deviceIdKey();
    return this.#namedKeyItems.get(id).once(async () => {
      const raw = await this.provider().then((p) => p.get(id));
      const r = KeyedDeviceIdKeyBagItemSchema.safeParse(raw);
      if (!r.success) {
        this.logger
          .Error()
          .Any({
            item: raw,
            errors: r,
          })
          .Msg("getDeviceId: unexpected item");
        return {
          deviceId: Option.None(),
          cert: Option.None(),
        };
      }
      return {
        deviceId: Option.Some(r.data.item.deviceId),
        cert: Option.From(r.data.item.cert),
      };
    });
  }
  async setDeviceId(_deviceId: JWKPrivate, _cert?: DeviceIdKeyBagItem["cert"]): Promise<DeviceIdResult> {
    const id = await deviceIdKey()
    this.#namedKeyItems.unget(id);
    return this.#namedKeyItems.get(id).once(async () => {
      await this.provider().then((p) =>
        p.set(id, {
          id,
          clazz: "DeviceIdKeyBagItem",
          item: {
            deviceId: _deviceId,
            cert: _cert,
          },
        } satisfies KeyedDeviceIdKeyBagItem),
      );
      const ret = {
        deviceId: Option.Some(_deviceId),
        cert: Option.From(_cert),
      };
      return ret;
    });
  }

  setJwt(name: string, jwtStr: string): Promise<Result<boolean>> {
    // const val = this.#namedKeyItems.get(name).value
    return this.#namedKeyItems.get(name).once(() => {
      return exception2Result(() =>
        this.provider().then((prov) =>
          prov
            .set(name, {
              id: name,
              clazz: "JwtKeyBagItem",
              item: {
                jwtStr,
              },
            } satisfies KeyedJwtKeyBagItem)
            .then((_) => true),
        ),
      );
    });
  }
  async getJwt(name: string, key?: CryptoKey | KeyObject | JWK | Uint8Array, opts?: JWTVerifyOptions): Promise<Result<JWTResult>> {
    if (this.#namedKeyItems.has(name)) {
      const ret = await this.#namedKeyItems.get(name).once(() => {
        throw new Error("Should never called");
      });
      const p = KeyedJwtKeyBagItemSchema.safeParse(ret);
      if (!p.success) {
        return Result.Err(p.error);
      }
      let claims = undefined;
      try {
        if (key) {
          claims = await jwtVerify(p.data.item.jwtStr, key, opts);
        } else {
          claims = decodeJwt(p.data.item.jwtStr);
        }
      } catch (e) {
        /* */
      }
      return Result.Ok({
        key: name,
        jwt: p.data.item.jwtStr,
        claims: claims as JWTPayload,
      });
    }
    return this.logger.Error().Str("name", name).Msg("not found").ResultError();
  }

  async delete(name: string): Promise<boolean> {
    if (this.#namedKeyItems.has(name)) {
      await this.provider().then((p) => p.del(name));
      this.#namedKeyItems.unget(name);
      return true;
    }
    return false;
  }

  readonly provider = Lazy(() => this.rt.getBagProvider());

  // getNamedKey(name: string, failIfNotFound?: boolean, material?: string | Uint8Array): Promise<Result<KeysByFingerprint>>;
  async getNamedKey(
    name: string,
    failIfNotFound = false,
    materialStrOrUint8?: string | Uint8Array,
  ): Promise<Result<KeysByFingerprint>> {
    const kItem = await this.#namedKeyItems.get(name).once(async () => {
      return new InternalKeyBagFingerprintItem(this, name);
    });
    return kItem.getNamedKey({ failIfNotFound, materialStrOrUint8 });
  }

  async getRawObj(name: string): Promise<Option<ReturnType<typeof LegacyKeyedItemSchema.safeParse>>> {
    const rawObj = await this.provider().then((p) => p.get(name));
    if (!rawObj) {
      return Option.None();
    }
    return Option.Some(LegacyKeyedItemSchema.safeParse(rawObj));
  }

  async setRawObj(k: KeyedItem): Promise<Result<KeyedItem>> {
    const r = KeyedItemSchema.safeParse(k);
    if (!r.success) {
      return Result.Err(r.error);
    }
    return exception2Result(() => this.provider().then((p) => p.set(r.data.id, r.data).then((_) => r.data)));
  }
}
