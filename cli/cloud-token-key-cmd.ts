import { JWKPrivate, JWKPrivateSchema, JWKPublic, JWKPublicSchema, SuperThis } from "@fireproof/core-types-base";
import * as rt from "@fireproof/core-runtime";
import { command, flag, option, string } from "cmd-ts";
import { exportJWK } from "jose/key/export";
import { Result, exception2Result } from "@adviser/cement";
import { z } from "zod/v4";

async function ourToJWK(env: string, sthis: SuperThis): Promise<Result<{ keys: (JWKPublic | JWKPrivate)[] }>> {
  const rCryptoKeys = await exception2Result(() => rt.sts.env2jwk(env, undefined, sthis));
  if (rCryptoKeys.isErr()) {
    return Result.Err(rCryptoKeys);
  }
  const cryptoKeys = rCryptoKeys.Ok();

  // Convert each key individually for better error reporting
  const keys: (JWKPrivate | JWKPublic)[] = [];
  for (const key of cryptoKeys) {
    const rKey = await exception2Result(() => exportJWK(key));
    if (rKey.isErr()) {
      return Result.Err(rKey);
    }
    const parsed = z.union([JWKPublicSchema, JWKPrivateSchema]).safeParse(rKey.Ok());
    if (!parsed.success) {
      return Result.Err(`Invalid JWK public key: ${parsed.error.message}`);
    }
    keys.push(parsed.data);
  }

  return Result.Ok({ keys });
}

export function keyCmd(sthis: SuperThis) {
  return command({
    name: "cli-key-cmds",
    description: "handle keys for cloud token generation",
    version: "1.0.0",
    args: {
      generatePair: flag({
        long: "generatePair",
        short: "g",
      }),
      ourToJWK: option({
        long: "ourToJWK",
        short: "o",
        defaultValue: () => "",
        type: string,
      }),
      JWKToour: option({
        long: "JWKToour",
        short: "j",
        defaultValue: () => "",
        type: string,
      }),
    },
    handler: async (args) => {
      switch (true) {
        case !!args.ourToJWK:
          {
            const r = await ourToJWK(args.ourToJWK, sthis);
            if (r.isErr()) {
              // eslint-disable-next-line no-console
              console.error(`Error: ${r.Err()}`);
              process.exit(1);
            }
            // eslint-disable-next-line no-console
            console.log(JSON.stringify(r.Ok(), null, 2));
          }
          break;
        case args.generatePair:
          {
            const key = await rt.sts.SessionTokenService.generateKeyPair("ES256", { extractable: true });
            // eslint-disable-next-line no-console
            console.log(`${rt.sts.envKeyDefaults.PUBLIC}=${key.strings.publicKey}`);
            // eslint-disable-next-line no-console
            console.log(`${rt.sts.envKeyDefaults.SECRET}=${key.strings.privateKey}`);
          }
          break;
      }
    },
  });
}
