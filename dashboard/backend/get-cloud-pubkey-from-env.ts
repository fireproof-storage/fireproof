import { Result, toCryptoRuntime } from "@adviser/cement";
import { ensureSuperThis, sts } from "@fireproof/core-runtime";
import { JWKPublic, JWKPublicSchema, SuperThis, toJwksAlg } from "@fireproof/core-types-base";
import { isArrayBuffer, isUint8Array } from "util/types";

export async function getCloudPubkeyFromEnv(cloudToken?: string, sthis: SuperThis = ensureSuperThis()): Promise<Result<JWKPublic>> {
  const cstPub = cloudToken ?? sthis.env.get("CLOUD_SESSION_TOKEN_PUBLIC");
  if (!cstPub) {
    return Result.Err("no public key: env:CLOUD_SESSION_TOKEN_PUBLIC");
  }
  const key = await sts.env2jwk(cstPub, "ES256", sthis);
  const jwKey = await toCryptoRuntime().exportKey("jwk", key);
  if (isUint8Array(jwKey) || isArrayBuffer(jwKey)) {
    return Result.Err("invalid key: jwk is ArrayBuffer or Uint8Array");
  }
  const rJwtPublicKey = JWKPublicSchema.safeParse({
    use: "sig",
    // kty: ktyFromAlg(key.algorithm.name),
    ...jwKey,
    alg: toJwksAlg(key.algorithm.name, jwKey),
    ext: undefined,
    key_ops: undefined,
    kid: undefined,
  });
  if (!rJwtPublicKey.success) {
    return Result.Err(rJwtPublicKey.error);
  }
  return Result.Ok(rJwtPublicKey.data);
}
