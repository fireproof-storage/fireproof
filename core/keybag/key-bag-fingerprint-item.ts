import { ResolveOnce, Result } from "@adviser/cement";
import { KeysByFingerprint } from "@fireproof/core-types-base";
import { InternalKeysByFingerprint } from "./internal-keys-by-fingerprint.js";
import { KeyBag } from "./key-bag.js";

interface keyBagFingerprintItemGetOpts {
  readonly failIfNotFound: boolean;
  readonly materialStrOrUint8?: string | Uint8Array;
  readonly def?: boolean;
}

export class InternalKeyBagFingerprintItem {
  readonly name: string;
  readonly keybag: KeyBag;
  readonly keysByFingerprint = new ResolveOnce<Result<InternalKeysByFingerprint>>();

  constructor(keybag: KeyBag, name: string) {
    this.keybag = keybag;
    this.name = name;
  }

  async getNamedKey(opts: keyBagFingerprintItemGetOpts): Promise<Result<KeysByFingerprint>> {
    return this.keysByFingerprint
      .once(async () => {
        return InternalKeysByFingerprint.from({ keybag: this.keybag, opts, name: this.name });
      })
      .then((r) => {
        if (r.isErr()) {
          this.keysByFingerprint.reset();
          return r;
        }
        return r.Ok().ensureMaterial(opts.materialStrOrUint8);
      });
  }
}
