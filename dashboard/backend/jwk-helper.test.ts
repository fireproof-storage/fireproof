import { generateKeyPair } from "jose/key/generate/keypair";
import { env2jwk, jwk2env } from "./jwk-helper.ts";
import { exportJWK } from "jose";

describe("jwk-helper", async () => {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  it("ping - pong", async () => {
    expect(await exportJWK(await env2jwk(await jwk2env(publicKey)))).toEqual(await exportJWK(publicKey));
    expect(await exportJWK(await env2jwk(await jwk2env(privateKey)))).toEqual(await exportJWK(privateKey));
  });
});
