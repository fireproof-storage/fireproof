import {
  CTCryptoKey,
  KeyedResolvOnce,
  Logger,
  ResolveOnce,
  ResolveSeq,
  Result,
  Option,
  runtimeFn,
  toCryptoRuntime,
  URI,
} from "@adviser/cement";
import {
  isKeyUpsertResultModified,
  KeyMaterial,
  KeysByFingerprint,
  KeyUpsertResult,
  KeyWithFingerPrint,
} from "@fireproof/core-types-blockstore";
import { ensureLogger, hashObject } from "@fireproof/core-runtime";
import { base58btc } from "multiformats/bases/base58";
import {
  KeyBagIf,
  KeyBagOpts,
  KeyBagProvider,
  KeyBagRuntime,
  V2KeysItem,
  PARAM,
  SuperThis,
  V1StorageKeyItem,
  V2StorageKeyItem,
  KeysItem,
  type JWKPrivate,
  type CertificatePayload,
} from "@fireproof/core-types-base";
import { KeyBagProviderFile } from "@fireproof/core-gateways-file";
import { KeyBagProviderMemory } from "./key-bag-memory.js";

class keyWithFingerPrint implements KeyWithFingerPrint {
  readonly default: boolean;
  readonly fingerPrint: string;
  readonly key: CTCryptoKey;
  #material: KeyMaterial;

  constructor(fpr: string, key: CTCryptoKey, material: KeyMaterial, def: boolean) {
    this.fingerPrint = fpr;
    this.default = def;
    this.key = key;
    this.#material = material;
  }

  extract(): Promise<KeyMaterial> {
    if (this.key.extractable) {
      return Promise.resolve(this.#material);
    }
    throw new Error("Key is not extractable");
  }

  async asV2StorageKeyItem(): Promise<V2StorageKeyItem> {
    return {
      default: this.default,
      fingerPrint: this.fingerPrint,
      key: this.#material.keyStr,
    };
  }
}
type keysItem = Omit<KeysItem, "keys"> & {
  readonly keys: Record<string, keyWithFingerPrint>;
  readonly id: string;
};

export function coerceMaterial(kb: KeyBagIf, material: string | Uint8Array): KeyMaterial {
  let keyMaterial: Uint8Array;
  if (typeof material === "string") {
    keyMaterial = base58btc.decode(material);
  } else if (material instanceof Uint8Array) {
    keyMaterial = material;
  } else {
    throw kb.logger.Error().Msg("material must be string or Uint8Array").AsError();
  }
  return {
    key: keyMaterial,
    keyStr: base58btc.encode(keyMaterial),
  };
}

export async function toKeyWithFingerPrint(
  keybag: KeyBagIf,
  material: KeyMaterial,
  def: boolean,
): Promise<Result<keyWithFingerPrint>> {
  const key = await keybag.subtleKey(material.key);
  const fpr = base58btc.encode(new Uint8Array(await keybag.rt.crypto.digestSHA256(material.key)));
  return Result.Ok(new keyWithFingerPrint(fpr, key, material, def));
}

export async function toV2StorageKeyItem(keybag: KeyBagIf, material: KeyMaterial, def: boolean): Promise<V2StorageKeyItem> {
  const rKfp = await toKeyWithFingerPrint(keybag, material, def);
  if (rKfp.isErr()) {
    throw rKfp;
  }
  return {
    default: def,
    fingerPrint: rKfp.Ok().fingerPrint,
    key: material.keyStr,
  };
}

function coerceFingerPrint(kb: KeyBagIf, fingerPrint?: string | Uint8Array): string | undefined {
  if (fingerPrint instanceof Uint8Array) {
    fingerPrint = base58btc.encode(fingerPrint);
  }
  return fingerPrint;
}

interface KeysByFingerprintFromOpts {
  readonly keybag: KeyBag;
  readonly prov: KeyBagProvider;
  readonly keysItem: keysItem;
  readonly modified?: boolean;
  readonly opts: {
    readonly materialStrOrUint8?: string | Uint8Array;
    readonly def?: boolean;
  };
}

class keysByFingerprint implements KeysByFingerprint {
  readonly keybag: KeyBag;
  readonly keysItem: keysItem;
  readonly prov: KeyBagProvider;

  static async from(kbo: KeysByFingerprintFromOpts): Promise<Result<KeysByFingerprint>> {
    const kbf = new keysByFingerprint(kbo.keybag, kbo.prov, kbo.keysItem);
    let modified = !!kbo.modified;
    // reverse to keep the first key as default

    for (const [_, ki] of Object.entries(kbo.keysItem.keys).reverse()) {
      const result = await kbf.upsertNoStore((await ki.asV2StorageKeyItem()).key, ki.default);
      if (result.isErr()) {
        throw result;
      }
      modified = modified || result.Ok().modified;
      // if (result.Ok().modified) {
      //   throw keyBag.logger.Error().Msg("KeyBag: keysByFingerprint: mismatch unexpected").AsError();
      // }
      const kur = result.Ok();
      if (isKeyUpsertResultModified(kur)) {
        if (kur.kfp.fingerPrint !== ki.fingerPrint) {
          throw kbo.keybag.logger
            .Error()
            .Any("fprs", {
              fromStorage: ki.fingerPrint,
              calculated: kur.kfp.fingerPrint,
            })
            .Msg("KeyBag: keysByFingerprint: mismatch")
            .AsError();
        }
      }
    }
    let rKur: Result<KeyUpsertResult> | undefined;
    if (kbo.opts.materialStrOrUint8) {
      // key created if needed
      rKur = await kbf.upsertNoStore(kbo.opts.materialStrOrUint8, kbo.opts.def);
      if (rKur.isErr()) {
        throw rKur;
      }
    }
    if (rKur?.Ok().modified || modified) {
      // persit
      await kbo.prov.set(await kbf.asV2KeysItem());
    }
    return Result.Ok(kbf);
  }

  private constructor(keyBag: KeyBag, prov: KeyBagProvider, keysItem: keysItem) {
    this.prov = prov;
    this.keybag = keyBag;
    this.keysItem = keysItem;
  }

  get id(): string {
    return this.keysItem.id;
  }

  get name(): string {
    return this.keysItem.name;
  }

  async get(fingerPrint?: string | Uint8Array): Promise<KeyWithFingerPrint | undefined> {
    fingerPrint = coerceFingerPrint(this.keybag, fingerPrint) || "*";
    const found = this.keysItem.keys[fingerPrint];
    if (found) {
      return found;
    }
    this.keybag.logger
      .Warn()
      .Any({ fprs: Object.keys(this.keysItem.keys), fpr: fingerPrint, name: this.name, id: this.id })
      .Msg("keysByFingerprint:get: not found");
    return undefined;
  }
  async upsert(materialStrOrUint8: string | Uint8Array, def?: boolean): Promise<Result<KeyUpsertResult>> {
    const rKur = await this.upsertNoStore(materialStrOrUint8, def);
    if (rKur.isErr()) {
      return Result.Err(rKur);
    }
    if (rKur.Ok().modified) {
      await this.prov.set(await this.asV2KeysItem());
    }
    return rKur;
  }

  async upsertNoStore(materialStrOrUint8: string | Uint8Array, def?: boolean): Promise<Result<KeyUpsertResult>> {
    if (!materialStrOrUint8) {
      return Result.Ok({
        modified: false,
      });
    }
    const material = coerceMaterial(this.keybag, materialStrOrUint8);
    def = !!def;
    const rKfp = await toKeyWithFingerPrint(this.keybag, material, !!def);
    if (rKfp.isErr()) {
      return Result.Err(rKfp);
    }
    const preHash = await hashObject(await this.asV2KeysItem());
    const kfp = rKfp.Ok();
    let found = this.keysItem.keys[kfp.fingerPrint];
    if (found) {
      if (found.default === def) {
        return Result.Ok({
          modified: false,
          kfp: found,
        });
      }
    } else {
      found = new keyWithFingerPrint(kfp.fingerPrint, kfp.key, material, def);
    }
    if (def) {
      for (const i of Object.values(this.keysItem.keys)) {
        (i as { default: boolean }).default = false;
      }
    }
    if (def || Object.keys(this.keysItem.keys).length === 0) {
      (found as { default: boolean }).default = true;
      this.keysItem.keys["*"] = found;
    }
    this.keysItem.keys[kfp.fingerPrint] = found;

    const postHash = await hashObject(this.asV2KeysItem());
    return Result.Ok({
      modified: preHash !== postHash,
      kfp: found,
    });
  }

  async asV2KeysItem(): Promise<V2KeysItem> {
    const my = { ...this.keysItem.keys };
    delete my["*"];
    const kis = await Promise.all(Object.values(my).map((i) => i.asV2StorageKeyItem()));
    return {
      name: this.name,
      keys: kis.reduce(
        (acc, i) => {
          acc[i.fingerPrint] = i;
          return acc;
        },
        {} as Record<string, V2StorageKeyItem>,
      ),
    };
  }

  // async extract() {
  //   const ext = new Uint8Array((await this.rt.crypto.exportKey("raw", named.key)) as ArrayBuffer);
  //   return {
  //     key: ext,
  //     keyStr: base58btc.encode(ext),
  //   };
  // }
}

interface keyBagFingerprintItemGetOpts {
  readonly failIfNotFound: boolean;
  readonly materialStrOrUint8?: string | Uint8Array;
  readonly def?: boolean;
}

export interface V2KeysItemUpdated {
  readonly modified: boolean;
  readonly keysItem: V2KeysItem;
}

class KeyBagFingerprintItem {
  readonly name: string;
  readonly keybag: KeyBag;
  readonly prov: KeyBagProvider;
  readonly logger: Logger;
  keysItem?: keysItem;

  readonly #seq: ResolveSeq<Result<KeysByFingerprint>> = new ResolveSeq<Result<KeysByFingerprint>>();

  constructor(keybag: KeyBag, prov: KeyBagProvider, name: string) {
    this.keybag = keybag;
    this.logger = ensureLogger(keybag.rt.sthis, `KeyBagFingerprintItem:${name}`);
    this.name = name;
    this.prov = prov;
  }

  // implicit migration from V1 to V2
  private async toV2KeysItem(ki: Partial<V1StorageKeyItem | V2KeysItem>): Promise<V2KeysItemUpdated> {
    if (!ki.name) {
      throw this.logger.Error().Msg("toV2KeysItem: name is missing").AsError();
    }
    if ("key" in ki && ki.key && ki.name) {
      const fpr = (await toKeyWithFingerPrint(this.keybag, coerceMaterial(this.keybag, ki.key), true)).Ok().fingerPrint;
      return {
        modified: true,
        keysItem: {
          name: ki.name,
          keys: {
            [fpr]: {
              key: ki.key,
              fingerPrint: fpr,
              default: true,
            },
          },
        },
      };
    }
    // fix default
    let defKI: V2StorageKeyItem | undefined;
    let foundDefKI = false;
    let result: V2KeysItem;
    if ("keys" in ki && ki.keys) {
      result = {
        name: ki.name,
        keys: ki.keys,
      };
    } else {
      result = {
        name: ki.name,
        keys: {},
      };
    }
    for (const i of Object.entries(result.keys)) {
      if (i[0] !== i[1].fingerPrint) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete result.keys[i[0]];
        result.keys[i[1].fingerPrint] = i[1];
        this.logger.Warn().Str("name", ki.name).Msg("fingerPrint mismatch fixed");
      }
      if (defKI === undefined) {
        defKI = i[1];
      }
      if (!foundDefKI && i[1].default) {
        defKI = i[1];
        foundDefKI = true;
      } else {
        (i[1] as { default: boolean }).default = false;
      }
    }
    // if (defKI) {
    //   result.keys["*"] = defKI;
    // }
    return {
      modified: false,
      keysItem: result,
    };
  }

  private async toKeysItem(ki: V2KeysItem, id: string): Promise<keysItem> {
    const keys = (
      await Promise.all(
        Array.from(Object.values(ki.keys)).map(
          async (i) =>
            [
              i.fingerPrint,
              await this.keybag.subtleKey(i.key),
              { key: base58btc.decode(i.key), keyStr: i.key },
              i.default,
            ] satisfies [string, CTCryptoKey, KeyMaterial, boolean],
        ),
      ).then((i) => i.map((j) => new keyWithFingerPrint(...j)))
    ).reduce(
      (acc, i) => {
        acc[i.fingerPrint] = i;
        if (i.default) {
          acc["*"] = i;
        }
        return acc;
      },
      {} as keysItem["keys"],
    );
    return {
      id,
      name: ki.name,
      keys,
    };
  }

  async getNamedKey(opts: keyBagFingerprintItemGetOpts): Promise<Result<KeysByFingerprint>> {
    return this.#seq.add(async () => {
      if (this.keysItem) {
        // is loaded from provider
        return keysByFingerprint.from({ ...this, keysItem: this.keysItem, opts });
      }
      const id = this.keybag.rt.sthis.nextId(4).str; //debug
      // read from provider and make it a KeysItem (name, keys)

      let provKeysItem = await this.prov.get(this.name);
      if (!provKeysItem) {
        provKeysItem = {
          name: this.name,
          keys: {},
        };
      }
      const v2KeysItem = await this.toV2KeysItem(provKeysItem);
      const keys = Object.values(v2KeysItem.keysItem.keys).length;
      if (opts.failIfNotFound && keys === 0) {
        return Result.Err(this.logger.Debug().Str("id", id).Str("name", this.name).Msg("failIfNotFound getNamedKey").AsError());
      }
      this.keysItem = await this.toKeysItem(v2KeysItem.keysItem, id);
      if (keys > 0) {
        this.logger
          .Debug()
          .Str("id", id)
          .Str("name", this.name)
          .Any("fprs", Object.keys(v2KeysItem))
          .Msg("fingerPrint getNamedKey");
        return keysByFingerprint.from({ ...this, keysItem: this.keysItem, opts, modified: v2KeysItem.modified });
      }
      if (!this.keysItem && opts.failIfNotFound) {
        // do not cache
        return this.logger.Debug().Str("id", id).Str("name", this.name).Msg("failIfNotFound getNamedKey").ResultError();
      }
      this.keysItem = { name: this.name, keys: {}, id };
      const rKbfp = await keysByFingerprint.from({
        ...this,
        keysItem: this.keysItem,
        opts: {
          materialStrOrUint8: opts.materialStrOrUint8 ?? this.keybag.rt.crypto.randomBytes(this.keybag.rt.keyLength),
          def: true,
        },
        modified: v2KeysItem.modified,
      });
      if (rKbfp.isErr()) {
        return rKbfp;
      }
      this.logger
        .Debug()
        .Str("id", id)
        .Str("name", this.name)
        .Any("KeyItems", await rKbfp.Ok().asV2KeysItem())
        .Msg("createKey getNamedKey-post");
      return rKbfp;
    });
  }
}

export class KeyBag implements KeyBagIf {
  readonly logger: Logger;
  readonly rt: KeyBagRuntime;

  constructor(rt: KeyBagRuntime) {
    this.rt = rt;
    this.logger = ensureLogger(rt.sthis, "KeyBag");
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

  // flush(): Promise<void> {
  //   return this._seq.flush();
  // }

  // async setNamedKey(name: string, key: string, def?: boolean): Promise<Result<KeysByFingerprint>> {
  //   return this._seq.add(() => this._upsertNamedKey(name, key, !!def));
  // }

  // async getNamedExtractableKey(name: string, failIfNotFound = false): Promise<Result<KeysByFingerprint>> {
  //   const ret = await this.getNamedKey(name, failIfNotFound);
  //   if (ret.isErr()) {
  //     return Result.Err(ret)
  //   }
  //   const named = ret.Ok();
  //   return Result.Ok({
  //     ...named,
  //     extract: async () => {
  //       const ext = new Uint8Array((await this.rt.crypto.exportKey("raw", named.key)) as ArrayBuffer);
  //       return {
  //         key: ext,
  //         keyStr: base58btc.encode(ext),
  //       };
  //     },
  //   });
  // }

  async getDeviceId(): Promise<{ readonly deviceId: Option<JWKPrivate>; readonly cert: Option<CertificatePayload> }> {
    return {
      deviceId: Option.None(),
      cert: Option.None(),
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async setDeviceId(deviceId: JWKPrivate): Promise<ReturnType<typeof this.getDeviceId>> {
    throw new Error("Not implemented");
  }

  private _namedKeyItems = new KeyedResolvOnce<KeyBagFingerprintItem>();

  async getNamedKey(
    name: string,
    failIfNotFound = false,
    materialStrOrUint8?: string | Uint8Array,
  ): Promise<Result<KeysByFingerprint>> {
    const kItem = await this._namedKeyItems.get(name).once(async () => {
      // const id = this.rt.sthis.nextId(4).str; //debug
      const prov = await this.rt.getBagProvider();
      return new KeyBagFingerprintItem(this, prov, name);
    });
    return kItem.getNamedKey({ failIfNotFound, materialStrOrUint8 });
  }
}

export type KeyBagFile = Record<string, V2KeysItem>;

export function isV1StorageKeyItem(item: V1StorageKeyItem | V2KeysItem): item is V1StorageKeyItem {
  return !!(item as V1StorageKeyItem).key;
}

export function isKeysItem(item: V1StorageKeyItem | V2KeysItem): item is V2KeysItem {
  return !!(item as V2KeysItem).keys;
}

export type KeyBackProviderFactory = (url: URI, sthis: SuperThis) => Promise<KeyBagProvider>;

export interface KeyBagProviderFactoryItem {
  readonly protocol: string;
  // if this is set the default protocol selection is overridden
  readonly override?: boolean;
  readonly factory: KeyBackProviderFactory;
}

const keyBagProviderFactories = new Map<string, KeyBagProviderFactoryItem>(
  [
    {
      protocol: "file:",
      factory: async (url: URI, sthis: SuperThis) => {
        return new KeyBagProviderFile(url, sthis);
      },
    },
    {
      protocol: "indexeddb:",
      factory: async (url: URI, sthis: SuperThis) => {
        const { KeyBagProviderImpl } = await import("@fireproof/core-gateways-indexeddb");
        return new KeyBagProviderImpl(url, sthis);
      },
    },
    {
      protocol: "memory:",
      factory: async (url: URI, sthis: SuperThis) => {
        return new KeyBagProviderMemory(url, sthis);
      },
    },
  ].map((i) => [i.protocol, i]),
);

export function registerKeyBagProviderFactory(item: KeyBagProviderFactoryItem) {
  const protocol = item.protocol.endsWith(":") ? item.protocol : item.protocol + ":";
  keyBagProviderFactories.set(protocol, {
    ...item,
    protocol,
  });
}

export function defaultKeyBagUrl(sthis: SuperThis): URI {
  let bagFnameOrUrl = sthis.env.get("FP_KEYBAG_URL");
  let url: URI;
  if (runtimeFn().isBrowser) {
    url = URI.from(bagFnameOrUrl || "indexeddb://fp-keybag");
  } else {
    if (!bagFnameOrUrl) {
      const home = sthis.env.get("HOME");
      bagFnameOrUrl = `${home}/.fireproof/keybag`;
      url = URI.from(`file://${bagFnameOrUrl}`);
    } else {
      url = URI.from(bagFnameOrUrl);
    }
  }
  const logger = ensureLogger(sthis, "defaultKeyBagUrl");
  logger.Debug().Url(url).Msg("from env");
  return url;
}

export function defaultKeyBagOpts(sthis: SuperThis, kbo?: Partial<KeyBagOpts>): KeyBagRuntime {
  kbo = kbo || {};
  if (kbo.keyRuntime) {
    return kbo.keyRuntime;
  }
  const logger = ensureLogger(sthis, "KeyBag");
  let url: URI;
  if (kbo.url) {
    url = URI.from(kbo.url);
    logger.Debug().Url(url).Msg("from opts");
  } else {
    let bagFnameOrUrl = sthis.env.get("FP_KEYBAG_URL");
    if (runtimeFn().isBrowser) {
      url = URI.from(bagFnameOrUrl || "indexeddb://fp-keybag");
    } else {
      if (!bagFnameOrUrl) {
        const home = sthis.env.get("HOME");
        bagFnameOrUrl = `${home}/.fireproof/keybag`;
        url = URI.from(`file://${bagFnameOrUrl}`);
      } else {
        url = URI.from(bagFnameOrUrl);
      }
    }
    logger.Debug().Url(url).Msg("from env");
  }
  const kitem = keyBagProviderFactories.get(url.protocol);
  if (!kitem) {
    throw logger.Error().Url(url).Msg("unsupported protocol").AsError();
  }

  if (url.hasParam("masterkey")) {
    throw logger.Error().Url(url).Msg("masterkey is not supported").AsError();
  }

  return {
    url,
    crypto: kbo.crypto || toCryptoRuntime({}),
    sthis,
    logger,
    keyLength: kbo.keyLength || 16,
    getBagProvider: () => kitem.factory(url, sthis),
    id: () => {
      return url.toString();
    },
  };
}

const _keyBags = new KeyedResolvOnce<KeyBag>();
export async function getKeyBag(sthis: SuperThis, kbo: Partial<KeyBagOpts> = {}): Promise<KeyBag> {
  await sthis.start();
  const rt = defaultKeyBagOpts(sthis, kbo);
  return _keyBags.get(rt.id()).once(async () => new KeyBag(rt));
}
