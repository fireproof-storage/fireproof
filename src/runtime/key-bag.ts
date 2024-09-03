import {
  CoerceURI,
  CryptoRuntime,
  KeyedResolvOnce,
  Logger,
  ResolveSeq,
  Result,
  runtimeFn,
  toCryptoRuntime,
  URI,
} from "@adviser/cement";
import { KeyWithFingerPrint } from "../blockstore/types.js";
import { ensureLogger } from "../utils.js";
import { base58btc } from "multiformats/bases/base58";
import { SuperThis } from "../types.js";

export type { KeyBagProviderFile } from "./key-bag-file.js";
export type { KeyBagProviderIndexDB } from "./key-bag-indexdb.js";

export class KeyBag {
  readonly logger: Logger;
  constructor(readonly rt: KeyBagRuntime) {
    this.logger = ensureLogger(rt.sthis, "KeyBag", {
      id: rt.id(),
    });
    this.logger.Debug().Msg("KeyBag created");
  }
  async subtleKey(key: string) {
    return await this.rt.crypto.importKey(
      "raw", // raw or jwk
      base58btc.decode(key),
      // hexStringToUint8Array(key), // raw data
      "AES-GCM",
      false, // extractable
      ["encrypt", "decrypt"],
    );
  }

  async ensureKeyFromUrl(url: URI, keyFactory: () => string): Promise<Result<URI>> {
    // add storekey to url
    const storeKey = url.getParam("storekey");
    if (storeKey === "insecure") {
      return Result.Ok(url);
    }
    if (!storeKey) {
      const keyName = `@${keyFactory()}@`;
      const ret = await this.getNamedKey(keyName);
      if (ret.isErr()) {
        return ret as unknown as Result<URI>;
      }
      const urb = url.build().setParam("storekey", keyName);
      return Result.Ok(urb.URI());
    }
    if (storeKey.startsWith("@") && storeKey.endsWith("@")) {
      const ret = await this.getNamedKey(storeKey);
      if (ret.isErr()) {
        return ret as unknown as Result<URI>;
      }
    }
    return Result.Ok(url);
  }

  async toKeyWithFingerPrint(keyStr: string): Promise<Result<KeyWithFingerPrint>> {
    const material = base58btc.decode(keyStr); //
    const key = await this.subtleKey(keyStr);
    const fpr = await this.rt.crypto.digestSHA256(material);
    return Result.Ok({
      key,
      fingerPrint: base58btc.encode(new Uint8Array(fpr)),
    });
  }

  readonly _seq = new ResolveSeq<Result<KeyWithFingerPrint>>();
  async setNamedKey(name: string, key: string): Promise<Result<KeyWithFingerPrint>> {
    return this._seq.add(() => this._setNamedKey(name, key));
  }

  // avoid deadlock
  async _setNamedKey(name: string, key: string): Promise<Result<KeyWithFingerPrint>> {
    const item = {
      name,
      key: key,
    };
    const bag = await this.rt.getBag();
    this.logger.Debug().Str("name", name).Msg("setNamedKey");
    await bag.set(name, item);
    return await this.toKeyWithFingerPrint(item.key);
  }

  async getNamedKey(name: string, failIfNotFound = false): Promise<Result<KeyWithFingerPrint>> {
    const id = this.rt.sthis.nextId();
    return this._seq.add(async () => {
      const bag = await this.rt.getBag();
      const named = await bag.get(name);
      if (named) {
        const fpr = await this.toKeyWithFingerPrint(named.key);
        this.logger.Debug().Str("id", id).Str("name", name).Result("fpr", fpr).Msg("fingerPrint getNamedKey");
        return fpr;
      }
      if (failIfNotFound) {
        this.logger.Debug().Str("id", id).Str("name", name).Msg("failIfNotFound getNamedKey");
        return Result.Err(new Error(`Key not found: ${name}`));
      }
      // this.logger.Debug().Str("id", id).Str("name", name).Msg("createKey getNamedKey-pre");
      const ret = await this._setNamedKey(name, base58btc.encode(this.rt.crypto.randomBytes(this.rt.keyLength)));
      this.logger.Debug().Str("id", id).Str("name", name).Result("fpr", ret).Msg("createKey getNamedKey-post");
      return ret;
    });
  }
}

export interface KeyItem {
  readonly name: string;
  readonly key: string;
}
export type KeyBagFile = Record<string, KeyItem>;

export interface KeyBagOpts {
  // in future you can encrypt the keybag with ?masterkey=xxxxx
  readonly url: CoerceURI;
  // readonly key: string; // key to encrypt the keybag
  readonly crypto: CryptoRuntime;
  readonly keyLength: number; // default: 16
  // readonly logger: Logger;
  readonly keyRuntime: KeyBagRuntime;
}

export interface KeyBagProvider {
  get(id: string): Promise<KeyItem | undefined>;
  set(id: string, item: KeyItem): Promise<void>;
}
export interface KeyBagRuntime {
  readonly url: URI;
  readonly crypto: CryptoRuntime;
  readonly logger: Logger;
  readonly sthis: SuperThis;
  readonly keyLength: number;
  // readonly key?: FPCryptoKey;
  getBag(): Promise<KeyBagProvider>;
  id(): string;
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
        const { KeyBagProviderFile } = await import("./key-bag-file.js");
        return new KeyBagProviderFile(url, sthis);
      },
    },
    {
      protocol: "indexdb:",
      factory: async (url: URI, sthis: SuperThis) => {
        const { KeyBagProviderIndexDB } = await import("./key-bag-indexdb.js");
        return new KeyBagProviderIndexDB(url, sthis);
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

function defaultKeyBagOpts(sthis: SuperThis, kbo: Partial<KeyBagOpts>): KeyBagRuntime {
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
      url = URI.from(bagFnameOrUrl || "indexdb://fp-keybag");
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
  let keyProviderFactory: () => Promise<KeyBagProvider>;
  switch (url.protocol) {
    case "file:":
      keyProviderFactory = async () => {
        const { KeyBagProviderFile } = await import("./key-bag-file.js");
        return new KeyBagProviderFile(url, sthis);
      };
      break;
    case "indexdb:":
      keyProviderFactory = async () => {
        const { KeyBagProviderIndexDB } = await import("./key-bag-indexdb.js");
        return new KeyBagProviderIndexDB(url, sthis);
      };
      break;
    default:
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
    getBag: keyProviderFactory,
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
