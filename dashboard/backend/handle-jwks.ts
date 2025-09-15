import { ensureSuperThis, sts } from "@fireproof/core-runtime";
import { exportJWK } from "jose";

export async function handleJWKS<BI extends BodyInit, RI extends ResponseInit, T extends Response>(fac: (bi:BI, init?: RI) => T): Promise<T> {
  const sthis = ensureSuperThis();
  const envPubKey = sthis.env.get("CLOUD_SESSION_TOKEN_PUBLIC")
  if (!envPubKey) {
    return fac(JSON.stringify({
      error: "CLOUD_SESSION_TOKEN_PUBLIC not set",
      keys: [],
    }), { status: 404 });
  }
  const pubKey = await sts.env2jwk(envPubKey, "ES256");
  return fac(
    JSON.stringify({
      keys: [await  exportJWK(pubKey)],
    }),
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}
