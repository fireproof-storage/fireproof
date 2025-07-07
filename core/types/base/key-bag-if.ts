import { Logger, URI, Result } from "@adviser/cement";
import { KeysByFingerprint } from "../blockstore/types.js";
import { KeyBagRuntime } from "./types.js";

export interface KeyBagIf {
  readonly logger: Logger;
  readonly rt: KeyBagRuntime;

  subtleKey(materialStrOrUint8: string | Uint8Array): Promise<CryptoKey>;

  ensureKeyFromUrl(url: URI, keyFactory: () => string): Promise<Result<URI>>;
  flush(): Promise<void>;

  getNamedKey(name: string, failIfNotFound?: boolean, material?: string | Uint8Array): Promise<Result<KeysByFingerprint>>;
}
