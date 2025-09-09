import { Logger, Result } from "@adviser/cement";
import { ensureLogger, hashObjectSync } from "@fireproof/core-runtime";
import {
  isKeyUpsertResultModified,
  KeyedV2StorageKeyItem,
  KeyedV2StorageKeyItemSchema,
  KeysByFingerprint,
  KeysItem,
  KeyUpsertResult,
  KeyUpsertResultModified,
  KeyWithFingerPrint,
  UpSertOpts,
  V2StorageKeyItem,
} from "@fireproof/core-types-base";
import { coerceFingerPrint, coerceMaterial, InternalKeyWithFingerPrint, toKeyWithFingerPrint } from "./key-with-fingerprint.js";
import { KeyBag } from "./key-bag.js";
import { base58btc } from "multiformats/bases/base58";
import { coerceKeyedItem as coerceKeyedItemWithVersionUpdate } from "./coerce-keyed-item.js";
import z from "zod";

// export type InternalKeysItem = Omit<KeyedV2StorageKeyItem["item"], "keys"> & {
//   readonly keys: Record<string, InternalKeyWithFingerPrint>;
//   readonly id: string;
// };

interface InternalKeysByFingerprintFromOpts {
  readonly keybag: KeyBag;
  readonly name: string;
  // readonly keysItem: InternalKeysItem;
  readonly modified?: boolean;
  readonly opts: {
    readonly failIfNotFound?: boolean;
    readonly materialStrOrUint8?: string | Uint8Array;
    readonly def?: boolean;
  };
}

interface InternalKeysItem {
  readonly keyWithFingerPrint: InternalKeyWithFingerPrint;
  readonly keyMaterial: string;
}

interface InternalKeyUpsertResult {
  readonly result: Result<KeyUpsertResultModified>;
  readonly keyMaterial: string;
}

function isInternalKeyUpsertResult(i: { result: Result<KeyUpsertResult> }): i is InternalKeyUpsertResult {
  return i.result.isOk() && isKeyUpsertResultModified(i.result.Ok());
}

export class InternalKeysByFingerprint implements KeysByFingerprint {
  readonly keybag: KeyBag;
  readonly name: string;
  readonly id: string;
  // readonly lookUp = new KeyedResolvOnce<InternalKeyWithFingerPrint>();
  readonly lookup = new Map<string, InternalKeyWithFingerPrint>();
  // readonly keysItem: InternalKeysItem;
  readonly logger: Logger;

  async ensureMaterial(
    materialStrOrUint8: string | Uint8Array | undefined,
    opts: UpSertOpts,
  ): Promise<Result<InternalKeysByFingerprint>> {
    // if (!modified) {
    //   return Result.Ok(this);
    // }
    if (!materialStrOrUint8) {
      return Result.Ok(this);
    }
    const r = await this.upsert(materialStrOrUint8, opts);
    if (r.isErr()) {
      return Result.Err(r);
    }
    return Result.Ok(this);
  }

  // implicit migration from V1 to V2
  private async toKeysItem(ki: V2StorageKeyItem): Promise<InternalKeysItem[]> {
    return Promise.all(
      Array.from(Object.values(ki.keys)).map(async (i) => ({
        keyMaterial: i.key,
        keyWithFingerPrint: new InternalKeyWithFingerPrint({
          fingerPrint: i.fingerPrint,
          key: await this.keybag.subtleKey(i.key),
          material: { key: base58btc.decode(i.key), keyStr: i.key },
          default: i.default || false,
        }),
      })),
      // [
      //   i.fingerPrint,
      //   await this.keybag.subtleKey(i.key),
      //   { key: base58btc.decode(i.key), keyStr: i.key },
      //   i.default || false,
      // ] satisfies [string, CTCryptoKey, KeyMaterial, boolean],
    );
    // ).then((i) => i.map((j) => new InternalKeyWithFingerPrint(...j)))
    // ).reduce(
    //   (acc, i) => {
    //     acc[i.fingerPrint] = i;
    //     if (i.default) {
    //       acc["*"] = i;
    //     }
    //     return acc;
    //   },
    //   {} as KeysItem
    // );
    // return {
    //   id: this.id,
    //   name: ki.name,
    //   keys,
    // };
  }

  // is assuming it will not called concurrent or multiple per name
  async load(opts: InternalKeysByFingerprintFromOpts["opts"]): Promise<Result<InternalKeysByFingerprint>> {
    const oProvKeysResult = await this.keybag.getRawObj(this.name);
    if (oProvKeysResult.IsNone() && opts.failIfNotFound) {
      return this.logger.Debug().Msg("failIfNotFound getRawObj").ResultError();
    }
    // const provKeysResult = oProvKeysResult
    if (oProvKeysResult.IsSome() && !oProvKeysResult.unwrap().success) {
      const tsHelp = oProvKeysResult.unwrap();
      if (!tsHelp.success) {
        return this.logger
          .Error()
          .Any({ error: z.formatError(tsHelp.error) })
          .Msg("not LegacyKeyItem")
          .ResultError();
      }
    }
    let loadedMaterial: string | Uint8Array | undefined = undefined;
    let doNotWrite = false;
    if (oProvKeysResult.IsSome()) {
      const provKeysResult = oProvKeysResult.unwrap();
      const cki = await coerceKeyedItemWithVersionUpdate(this, provKeysResult.data);
      if (!cki) {
        return this.logger.Error().Any({ item: provKeysResult.data }).Msg("coerce error").ResultError();
      }
      const v2StorageResult = KeyedV2StorageKeyItemSchema.safeParse(cki);
      if (!v2StorageResult.success) {
        return this.logger
          .Error()
          .Any({ name: this.name, item: provKeysResult.data, error: z.formatError(v2StorageResult.error) })
          .Msg("not V2KeysItems")
          .ResultError();
      }
      // const keyedItem = { ...v2StorageResult.data, modified: cki.modified };

      // const v2KeysItem = await this.toV2KeysItem(provKeysItem);
      // const keys = Object.values(keyedItem.item.keys).length;
      // if (iopts.opts.failIfNotFound && keys === 0) {
      //   return Result.Err(this.logger.Debug().Str("name", this.name).Msg("no keys getNamedKey").AsError());
      // }
      doNotWrite = true;
      const kis = await this.toKeysItem(v2StorageResult.data.item)
        .then((items) =>
          items.map(async ({ keyMaterial, keyWithFingerPrint }, idx) =>
            Promise.resolve({
              keyMaterial,
              result: await this.upsert(keyMaterial, {
                def: keyWithFingerPrint.default,
                modified: cki.modified && idx === items.length - 1,
                doNotWrite,
              }),
            }),
          ),
        )
        .then((items) => Promise.all(items))
        .then((items) => items.filter((i) => isInternalKeyUpsertResult(i)));
      if (kis.length !== 0) {
        const defaultKey = kis.find((i) => i.result.Ok().kfp.default);
        if (defaultKey) {
          loadedMaterial = defaultKey.keyMaterial;
        }
      }
    }
    //   this.lookUp.get(i.fingerPrint).once(() => {
    //     th
    //   });
    // }
    return this.ensureMaterial(
      opts.materialStrOrUint8 ?? loadedMaterial ?? this.keybag.rt.crypto.randomBytes(this.keybag.rt.keyLength),
      { def: true, doNotWrite },
    );

    // if (keys > 0) {
    //   this.logger
    //     .Debug()
    //     .Str("id", id)
    //     .Str("name", this.name)
    //     .Any("fprs", Object.keys(keyedItem.item.keys))
    //     .Msg("fingerPrint getNamedKey");
    //   return InternalKeysByFingerprint.from({ ...this, keysItem: this.keysItem, opts: iopts, modified: keyedItem.modified });
    // } else if (iopts.failIfNotFound) {
    //   return this.logger.Debug().Str("id", id).Str("name", this.name).Msg("failIfNotFound getNamedKey").ResultError();
    // }
    // // lets create a key from the material
    // this.keysItem = { name: this.name, keys: {}, id };
    // const rKbfp = await InternalKeysByFingerprint.from({
    //   ...this,
    //   keysItem: this.keysItem,
    //   opts: {
    //     materialStrOrUint8: iopts.materialStrOrUint8 ?? this.keybag.rt.crypto.randomBytes(this.keybag.rt.keyLength),
    //     def: true,
    //   },
    //   modified: true
    // });
    // if (rKbfp.isErr()) {
    //   return rKbfp;
    // }
    // this.logger
    //   .Debug()
    //   .Str("id", id)
    //   .Str("name", this.name)
    //   .Any("KeyItems", await rKbfp.Ok().asV2StorageKeyItem())
    //   .Msg("createKey getNamedKey-post");
    // return rKbfp;
  }

  static async from(kbo: InternalKeysByFingerprintFromOpts): Promise<Result<InternalKeysByFingerprint>> {
    const kbf = new InternalKeysByFingerprint(kbo.keybag, kbo.name);
    return kbf.load(kbo.opts);
    // retu
    // if (rLoad.isErr()) {
    //   return Result.Err(rLoad);
    // }

    // let modified = !!kbo.modified;
    // // reverse to keep the first key as default

    // for (const [_, ki] of Object.entries(kbo.keysItem.keys).reverse()) {
    //   const result = await kbf.upsertNoStore((await ki.asKeysItem()).key, ki.default);
    //   if (result.isErr()) {
    //     return Result.Err(result);
    //   }
    //   modified ||= result.Ok().modified;
    //   // if (result.Ok().modified) {
    //   //   throw keyBag.logger.Error().Msg("KeyBag: keysByFingerprint: mismatch unexpected").AsError();
    //   // }
    //   const kur = result.Ok();
    //   if (isKeyUpsertResultModified(kur)) {
    //     if (kur.kfp.fingerPrint !== ki.fingerPrint) {
    //       return kbo.keybag.logger
    //         .Error()
    //         .Any("fprs", {
    //           fromStorage: ki.fingerPrint,
    //           calculated: kur.kfp.fingerPrint,
    //         })
    //         .Msg("KeyBag: keysByFingerprint: mismatch")
    //         .ResultError();
    //     }
    //   }
    // }
    // let rKur: Result<KeyUpsertResult> | undefined;
    // if (kbo.opts.materialStrOrUint8) {
    //   // key created if needed
    //   rKur = await kbf.upsertNoStore(kbo.opts.materialStrOrUint8, kbo.opts.def);
    //   if (rKur.isErr()) {
    //     return Result.Err(rKur);
    //   }
    // }
    // if (rKur?.Ok().modified || modified) {
    //   // persit
    //   await kbo.keybag.setRawObj({
    //     id: kbf.name,
    //     clazz: "V2StorageKeyItem",
    //     item: await kbf.asV2StorageKeyItem(),
    //   } satisfies KeyedV2StorageKeyItem);
    // }
    // return Result.Ok(kbf);
  }

  private constructor(keyBag: KeyBag, name: string) {
    this.id = keyBag.rt.sthis.nextId().str;
    this.logger = ensureLogger(keyBag.rt.sthis, `InternalKeysByFingerprint:${name}:${this.id}`);
    this.keybag = keyBag;
    this.name = name;
  }

  async get(fingerPrint?: string | Uint8Array): Promise<KeyWithFingerPrint | undefined> {
    fingerPrint = coerceFingerPrint(this.keybag, fingerPrint) || "*";
    const ret = this.lookup.get(fingerPrint);
    if (!ret) {
      this.keybag.logger
        .Warn()
        .Any({ fprs: Array.from(this.lookup.values()).map((i) => i.fingerPrint), fpr: fingerPrint })
        .Msg("keysByFingerprint:get: not found");
    }
    return ret;
  }
  async upsert(
    materialStrOrUint8: string | Uint8Array,
    { def, doNotWrite, modified }: UpSertOpts = {},
  ): Promise<Result<KeyUpsertResult>> {
    const rKur = await this.upsertNoStore(materialStrOrUint8, def);
    if (rKur.isErr()) {
      return Result.Err(rKur);
    }
    if (!doNotWrite && (rKur.Ok().modified || modified)) {
      await this.keybag.setRawObj({
        id: this.name,
        clazz: "V2StorageKeyItem",
        item: await this.asV2StorageKeyItem(),
      } satisfies KeyedV2StorageKeyItem);
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
    const rKfp = await toKeyWithFingerPrint(this.keybag, material, def);
    if (rKfp.isErr()) {
      return Result.Err(rKfp);
    }

    // critical section
    const kfp = rKfp.Ok();
    const preHash = hashObjectSync(await this.asV2StorageKeyItem());
    let found = this.lookup.get(kfp.fingerPrint);
    if (found) {
      // do not update default if not needed
      if (found.default === def) {
        return Result.Ok({
          modified: false,
          kfp: found,
        });
      }
    } else {
      found = new InternalKeyWithFingerPrint({
        default: def,
        fingerPrint: kfp.fingerPrint,
        key: kfp.key,
        material,
      });
    }
    this.lookup.set(found.fingerPrint, found);
    const keyItems = Array.from(this.lookup.values());
    if (def) {
      for (const i of keyItems) {
        if (i.default && i.fingerPrint !== kfp.fingerPrint) {
          i.setDefault(false);
        }
      }
    }
    if (def || keyItems.length === 0) {
      found.setDefault(true);
      this.lookup.set("*", found);
    }
    const postHash = hashObjectSync(await this.asV2StorageKeyItem());
    return Result.Ok({
      modified: preHash !== postHash,
      kfp: found,
    });
  }

  async asV2StorageKeyItem(): Promise<V2StorageKeyItem> {
    const kis = await Promise.all(
      Array.from(this.lookup.entries())
        .filter(([i]) => i !== "*")
        .map(([_, v]) => v.asKeysItem()),
    );
    return Promise.resolve({
      name: this.name,
      keys: kis.reduce(
        (acc, i) => {
          acc[i.fingerPrint] = i;
          return acc;
        },
        {} as Record<string, KeysItem>,
      ),
    });
  }

  // async extract() {
  //   const ext = new Uint8Array((await this.rt.crypto.exportKey("raw", named.key)) as ArrayBuffer);
  //   return {
  //     key: ext,
  //     keyStr: base58btc.encode(ext),
  //   };
  // }
}
