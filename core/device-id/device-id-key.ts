import { Result } from "@adviser/cement";
import { JWKPrivate, JWKPrivateSchema, JWKPublic, JWKPublicSchema } from "@fireproof/core-types-base";
import { GenerateKeyPairOptions, generateKeyPair, exportJWK, calculateJwkThumbprint } from "jose";
import { sts } from "@fireproof/core-runtime";

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
    if (!parsed.success) {
      return Result.Err(`Invalid JWK: ${parsed.error.message}`);
    }
    const j = parsed.data;
    const rKey = await sts.importJWK(j, undefined, opts);
    if (rKey.isErr()) {
      return Result.Err(rKey);
    }
    return Result.Ok(new DeviceIdKey(rKey.Ok().key));
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
    const { success, data, error } = JWKPublicSchema.safeParse(privateJWK);
    if (!success || !data) {
      throw new Error(`Invalid public JWK: ${error.message}`);
    }
    return data;
  }
}
