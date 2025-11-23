import { Logger, URI, Result, Option } from "@adviser/cement";
import { KeyBagRuntime, KeysByFingerprint } from "./types.js";
import { JWKPrivate } from "./jwk-private.zod.js";
import { DeviceIdKeyBagItem } from "./device-id-keybag-item.zod.js";
import { OpenJWTPayload } from "./jwt-payload.zod.js";
import type { JWK, JWTVerifyOptions, KeyObject } from "jose";
import { KeyedJwtKeyBagItem } from "./keybag-storage.zod.js";

export interface DeviceIdResult {
  readonly deviceId: Option<JWKPrivate>;
  readonly cert: Option<DeviceIdKeyBagItem["cert"]>;
  readonly error?: Error;
}

export interface JWTResult {
  readonly key: string;
  readonly jwt: string;
  readonly claims?: OpenJWTPayload;
}

export interface KeyBagIf {
  readonly logger: Logger;
  readonly rt: KeyBagRuntime;

  hash(): string;

  subtleKey(materialStrOrUint8: string | Uint8Array): Promise<CryptoKey>;

  ensureKeyFromUrl(url: URI, keyFactory: () => string): Promise<Result<URI>>;
  // flush(): Promise<void>;

  getNamedKey(name: string, failIfNotFound?: boolean, material?: string | Uint8Array): Promise<Result<KeysByFingerprint>>;

  setJwt(name: string, jwtStr: string): Promise<Result<KeyedJwtKeyBagItem>>;
  getJwt(name: string, key?: CryptoKey | KeyObject | JWK | Uint8Array, opts?: JWTVerifyOptions): Promise<Result<JWTResult>>;

  delete(name: string): Promise<boolean>;

  getDeviceId(): Promise<DeviceIdResult>;
  setDeviceId(deviceId: JWKPrivate, rIssueCert?: DeviceIdKeyBagItem["cert"]): Promise<DeviceIdResult>;
}
