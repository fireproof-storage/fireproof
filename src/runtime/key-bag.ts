import { CoerceURI, CryptoRuntime, KeyedResolvOnce, Logger, ResolveSeq, Result, runtimeFn, toCryptoRuntime, URI } from "@adviser/cement";
import { KeyWithFingerPrint } from "../blockstore/types.js";
import { SysContainer } from "./sys-container.js";
import { ensureLogger } from "../utils.js";
import { base58btc } from "multiformats/bases/base58";
// import { getFileSystem } from "./gateways/file/gateway.js";

export type { KeyBagProviderFile } from "./key-bag-file.js";
export type { KeyBagProviderIndexDB } from "./key-bag-indexdb.js";

export class KeyBag {
  readonly logger: Logger;
  constructor(readonly rt: KeyBagRuntime) {
    this.logger = ensureLogger(rt, "KeyBag", {
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

  async toKeyWithFingerPrint(key: string): Promise<Result<KeyWithFingerPrint>> {
    const material = base58btc.decode(key); //
    return Result.Ok({
      key: await this.subtleKey(key),
      fingerPrint: base58btc.encode(new Uint8Array(await this.rt.crypto.digestSHA256(material))),
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
    return this._seq.add(async () => {
      const bag = await this.rt.getBag();
      const named = await bag.get(name);
      if (named) {
        this.logger.Debug().Str("name", name).Msg("found getNamedKey");
        return await this.toKeyWithFingerPrint(named.key);
      }
      if (failIfNotFound) {
        this.logger.Debug().Str("name", name).Msg("failIfNotFound getNamedKey");
        return Result.Err(new Error(`Key not found: ${name}`));
      }
      this.logger.Debug().Str("name", name).Msg("createKey getNamedKey");
      return this._setNamedKey(name, base58btc.encode(this.rt.crypto.randomBytes(this.rt.keyLength)));
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
  readonly logger: Logger;
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
  readonly keyLength: number;
  // readonly key?: FPCryptoKey;
  getBag(): Promise<KeyBagProvider>;
  id(): string;
}

function defaultKeyBagOpts(kbo: Partial<KeyBagOpts>): KeyBagRuntime {
  if (kbo.keyRuntime) {
    return kbo.keyRuntime;
  }
  const logger = ensureLogger(kbo, "KeyBag");
  let url: URI;
  if (kbo.url) {
    url = URI.from(kbo.url);
  } else {
    let bagFnameOrUrl = SysContainer.env.get("FP_KEYBAG_URL");
    if (runtimeFn().isBrowser) {
      url = URI.from(bagFnameOrUrl || "indexdb://fp-keybag");
    } else {
      if (!bagFnameOrUrl) {
        const home = SysContainer.env.get("HOME");
        bagFnameOrUrl = `${home}/.fireproof/keybag`;
        url = URI.from(`file://${bagFnameOrUrl}`);
      } else {
        url = URI.from(bagFnameOrUrl);
      }
    }
  }
  let keyProviderFactory: () => Promise<KeyBagProvider>;
  switch (url.protocol) {
    case "file:":
      keyProviderFactory = async () => {
        const { KeyBagProviderFile } = await import("./key-bag-file.js");
        return new KeyBagProviderFile(url, logger);
      };
      break;
    case "indexdb:":
      keyProviderFactory = async () => {
        const { KeyBagProviderIndexDB } = await import("./key-bag-indexdb.js");
        return new KeyBagProviderIndexDB(url, logger);
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
    logger,
    keyLength: kbo.keyLength || 16,
    getBag: keyProviderFactory,
    id: () => {
      return url.toString();
    },
  };
}

const _keyBags = new KeyedResolvOnce<KeyBag>();
export async function getKeyBag(kbo: Partial<KeyBagOpts> = {}): Promise<KeyBag> {
  await SysContainer.start();
  const rt = defaultKeyBagOpts(kbo);
  return _keyBags.get(rt.id()).once(async () => new KeyBag(rt));
}
