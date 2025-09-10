import { Result } from "@adviser/cement";
import { hashObjectAsync } from "@fireproof/core-runtime";
import { JWKPrivate, JWKPrivateSchema, JWKPublic, JWKPublicSchema } from "@fireproof/core-types-base";
import { GenerateKeyPairOptions, generateKeyPair, importJWK, exportJWK, calculateJwkThumbprint } from "jose";

export class DeviceIdKey {
  #privateKey: CryptoKey;

  static async create(
    opts: GenerateKeyPairOptions = {
      extractable: true,
    },
  ) {
    const pair = await generateKeyPair("ES256", opts);
    return new DeviceIdKey(pair.privateKey);
  }

  static async createFromJWK(
    jwk: JWKPrivate,
    opts: GenerateKeyPairOptions = {
      extractable: true,
    },
  ): Promise<Result<DeviceIdKey>> {
    const parsed = JWKPrivateSchema.safeParse(jwk);
    if (parsed.success && (parsed.data.kty !== "EC" || parsed.data.crv !== "P-256" || !("d" in parsed.data))) {
      return Result.Err("Invalid JWK for ES256");
    }
    const pair = await importJWK(jwk, "ES256", opts);
    if (pair instanceof Uint8Array) {
      return Result.Err("Invalid JWK");
    }
    return Result.Ok(new DeviceIdKey(pair));
  }

  private constructor(pair: CryptoKey) {
    this.#privateKey = pair;
  }

  async fingerPrint() {
    return calculateJwkThumbprint(await this.exportPrivateJWK(), "sha256");
    // return hashObjectAsync(await this.exportPrivateJWK());
  }

  async exportPrivateJWK(): Promise<JWKPrivate> {
    const jwk = await exportJWK(this.#privateKey);
    const { success, data } = JWKPrivateSchema.safeParse(jwk);
    if (!success || !data) {
      throw new Error("Invalid JWK");
    }
    return data;
  }

  async publicKey(): Promise<JWKPublic> {
    const privateJWK = await exportJWK(this.#privateKey);
    const { success, data } = JWKPublicSchema.safeParse(privateJWK);
    if (!success || !data) {
      throw new Error("Invalid JWK");
    }
    return data;
  }
}
