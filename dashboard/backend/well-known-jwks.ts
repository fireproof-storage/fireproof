import { Lazy, toCryptoRuntime } from "@adviser/cement";
import { ensureSuperThis, sts } from "@fireproof/core-runtime";
import { JWKPublicSchema, toJwksAlg } from "@fireproof/core-types-base";
import { isArrayBuffer, isUint8Array } from "util/types";

const getKey = Lazy(async (opts: Record<string, string>) => {
  const sthis = ensureSuperThis();
  const cstPub = opts.CLOUD_SESSION_TOKEN_PUBLIC ?? sthis.env.get("CLOUD_SESSION_TOKEN_PUBLIC");
  if (!cstPub)
    return {
      status: 500,
      value: { error: "no public key: env:CLOUD_SESSION_TOKEN_PUBLIC" },
    };

  const key = await sts.env2jwk(cstPub, "ES256", sthis);
  const jwKey = await toCryptoRuntime().exportKey("jwk", key);
  if (isUint8Array(jwKey) || isArrayBuffer(jwKey)) {
    return {
      status: 500,
      value: { error: "invalid key is not a CTJsonWebKey" },
    };
  }
  const jwPublicKey = JWKPublicSchema.parse({
    use: "sig",
    // kty: ktyFromAlg(key.algorithm.name),
    ...jwKey,
    alg: toJwksAlg(key.algorithm.name, jwKey),
    ext: undefined,
    key_ops: undefined,
    kid: undefined,
  });
  return {
    status: 200,
    value: { keys: [jwPublicKey] },
  };
});

export async function resWellKnownJwks(_req: Request, opts: Record<string, string>): Promise<Response> {
  const r = await getKey(opts);
  return Promise.resolve(
    new Response(JSON.stringify(r.value), {
      status: r.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=300", // 5 minutes
      },
    }),
  );
}
