import {
  V1StorageKeyItem,
  V2StorageKeyItem,
  V2KeysItem,
  LegacyKeyedItem,
  KeyedItemSchema,
  V1StorageKeyItemSchema,
  KeyedItem,
  KeyBagIf,
} from "@fireproof/core-types-base";
import { toKeyWithFingerPrint, coerceMaterial } from "./key-with-fingerprint.js";
import { Logger } from "@adviser/cement";

export type ModifiedKeyedItem = KeyedItem & { modified?: boolean };

export interface CoerceCtx {
  readonly keybag: KeyBagIf;
  readonly logger: Logger;
}

async function toV2KeysItem(ctx: CoerceCtx, ki: Partial<V1StorageKeyItem | V2StorageKeyItem>): Promise<ModifiedKeyedItem> {
  if (!ki.name) {
    throw ctx.logger.Error().Msg("toV2KeysItem: name is missing").AsError();
  }
  if ("key" in ki && ki.key && ki.name) {
    // v1
    const fpr = (await toKeyWithFingerPrint(ctx.keybag, coerceMaterial(ctx.keybag, ki.key), true)).Ok().fingerPrint;
    return {
      modified: true,
      id: ki.name,
      clazz: "V2StorageKeyItem",
      item: {
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
  let defKI: V2KeysItem | undefined;
  let foundDefKI = false;
  let result: V2StorageKeyItem;
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
      ctx.logger.Warn().Str("name", ki.name).Msg("fingerPrint mismatch fixed");
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
    id: result.name,
    clazz: "V2StorageKeyItem",
    item: result,
  };
}

export async function coerceKeyedItem(ctx: CoerceCtx, item: LegacyKeyedItem | undefined): Promise<ModifiedKeyedItem | undefined> {
  if (!item) {
    return undefined;
  }
  if ("clazz" in item) {
    const r = KeyedItemSchema.safeParse(item);
    return r.success ? item : undefined;
  }
  // very private only for legacy
  function isV1StorageKeyItem(item: LegacyKeyedItem | undefined): item is V1StorageKeyItem {
    if (!item) {
      return false;
    }
    const r = V1StorageKeyItemSchema.safeParse(item);
    return r.success;
  }
  function isV2StorageKeysItem(item: LegacyKeyedItem): item is V2StorageKeyItem {
    return !!(item as V2StorageKeyItem).keys;
  }

  if (isV1StorageKeyItem(item)) {
    return toV2KeysItem(ctx, item);
  }

  if (isV2StorageKeysItem(item)) {
    return {
      id: item.name,
      clazz: "V2StorageKeyItem",
      item,
    };
  }
  return undefined;
}
