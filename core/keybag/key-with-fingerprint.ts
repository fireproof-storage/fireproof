import { CTCryptoKey, Result } from "@adviser/cement";
import { KeyBagIf, KeyMaterial, KeysItem, KeyWithFingerPrint } from "@fireproof/core-types-base";
import { base58btc } from "multiformats/bases/base58";

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
): Promise<Result<InternalKeyWithFingerPrint>> {
  const key = await keybag.subtleKey(material.key);
  const fpr = base58btc.encode(new Uint8Array(await keybag.rt.crypto.digestSHA256(material.key)));
  return Result.Ok(new InternalKeyWithFingerPrint({
    fingerPrint: fpr, key, material, default: def,
  }));
}

export async function toV2StorageKeyItem(keybag: KeyBagIf, material: KeyMaterial, def: boolean): Promise<KeysItem> {
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

export function coerceFingerPrint(kb: KeyBagIf, fingerPrint?: string | Uint8Array): string | undefined {
  if (fingerPrint instanceof Uint8Array) {
    fingerPrint = base58btc.encode(fingerPrint);
  }
  return fingerPrint;
}

export interface InternalKeyWithFingerPrintOpts {
  readonly default: boolean;
  readonly fingerPrint: string;
  readonly key: CTCryptoKey;
  readonly material: KeyMaterial;
}

export class InternalKeyWithFingerPrint implements KeyWithFingerPrint {
  readonly default: boolean;
  readonly fingerPrint: string;
  readonly key: CTCryptoKey;
  #material: KeyMaterial;

  constructor(opt: InternalKeyWithFingerPrintOpts) {
    this.fingerPrint = opt.fingerPrint;
    this.default = opt.default;
    this.key = opt.key;
    this.#material = opt.material;
  }

  setDefault(def: boolean)  {
    (this as { default: boolean }).default = def;
    return this
  }

  extract(): Promise<KeyMaterial> {
    if (this.key.extractable) {
      return Promise.resolve(this.#material);
    }
    throw new Error("Key is not extractable");
  }

  async asKeysItem(): Promise<KeysItem> {
    return {
      default: this.default,
      fingerPrint: this.fingerPrint,
      key: this.#material.keyStr,
    };
  }
}
