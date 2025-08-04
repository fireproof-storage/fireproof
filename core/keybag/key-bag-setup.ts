import { URI, runtimeFn, toCryptoRuntime, KeyedResolvOnce } from "@adviser/cement";
import { KeyBagProviderFile } from "@fireproof/core-gateways-file";
import { ensureLogger } from "@fireproof/core-runtime";
import {
  KeyedItem,
  KeyedDeviceIdKeyBagItem,
  KeyedDeviceIdKeyBagItemSchema,
  KeyedV2StorageKeyItem,
  KeyedV2StorageKeyItemSchema,
  SuperThis,
  KeyBagProvider,
  KeyBagOpts,
  KeyBagRuntime,
  KeyBagIf,
} from "@fireproof/core-types-base";
import { KeyBagProviderMemory } from "./key-bag-memory.js";
import { KeyBag } from "./key-bag.js";

export function isDeviceIdKeyBagItem(item: KeyedItem | undefined): item is KeyedDeviceIdKeyBagItem {
  if (!item) {
    return false;
  }
  const r = KeyedDeviceIdKeyBagItemSchema.safeParse(item);
  return r.success;
}

export function isV2StorageKeyItem(item: KeyedItem | undefined): item is KeyedV2StorageKeyItem {
  if (!item) {
    return false;
  }
  const r = KeyedV2StorageKeyItemSchema.safeParse(item);
  return r.success;
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

const _keyBags = new KeyedResolvOnce<KeyBagIf>();
export async function getKeyBag(sthis: SuperThis, kbo: Partial<KeyBagOpts> = {}): Promise<KeyBagIf> {
  await sthis.start();
  const rt = defaultKeyBagOpts(sthis, kbo);
  return _keyBags.get(rt.id()).once(() => KeyBag.create(rt));
}
