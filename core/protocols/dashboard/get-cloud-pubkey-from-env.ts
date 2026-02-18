import { isArrayBuffer, isUint8Array, Result } from "@adviser/cement";
import { ensureSuperThis, sts } from "@fireproof/core-runtime";
import { JWKPublic, JWKPublicSchema, SuperThis, toJwksAlg } from "@fireproof/core-types-base";
import { exportJWK } from "jose";

export async function getCloudPubkeyFromEnv(
  cloudToken?: string,
  sthis: SuperThis = ensureSuperThis(),
): Promise<Result<{ keys: JWKPublic[] }>> {
  const cstPub = cloudToken ?? sthis.env.get("CLOUD_SESSION_TOKEN_PUBLIC");
  if (!cstPub) {
    return Result.Err("no public key: env:CLOUD_SESSION_TOKEN_PUBLIC");
  }
  const cryptoKeys = await sts.env2jwk(cstPub, undefined, sthis);
  const keys: JWKPublic[] = [];
  for (const key of cryptoKeys) {
    const jwKey = await exportJWK(key);
    if (isUint8Array(jwKey) || isArrayBuffer(jwKey)) {
      return Result.Err("invalid key: jwk is ArrayBuffer or Uint8Array");
    }
    const rAlg = toJwksAlg(jwKey);
    if (rAlg.isErr()) {
      return Result.Err(rAlg);
    }
    const rJwtPublicKey = JWKPublicSchema.safeParse({
      use: "sig",
      // kty: ktyFromAlg(key.algorithm.name),
      ...jwKey,
      alg: rAlg.Ok(),
      ext: undefined,
      key_ops: undefined,
      kid: undefined,
    });
    if (!rJwtPublicKey.success) {
      return Result.Err(rJwtPublicKey.error);
    }
    keys.push(rJwtPublicKey.data);
  }
  return Result.Ok({ keys });
}
