import { exportJWK, importJWK } from "jose";
import { base58btc } from "multiformats/bases/base58";

export async function jwk2env(jwk: CryptoKey): Promise<string> {
  const txtEncoder = new TextEncoder();
  const inPubKey = await exportJWK(jwk);
  return base58btc.encode(txtEncoder.encode(JSON.stringify(inPubKey)));
}

export async function env2jwk(env: string): Promise<CryptoKey> {
  const txtDecoder = new TextDecoder();
  const inJWT = JSON.parse(txtDecoder.decode(base58btc.decode(env)));
  return importJWK(inJWT, "ES256", { extractable: true }) as Promise<CryptoKey>;
}
