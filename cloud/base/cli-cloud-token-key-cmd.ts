import { SuperThis } from "@fireproof/core-types";
import * as rt from "@fireproof/core-runtime";
import { command, flag, option, string } from "cmd-ts";
import { exportJWK } from "jose/key/export";

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
            const key = await rt.sts.env2jwk(args.ourToJWK, "ES256", sthis).then((jwk) => jwk);
            // eslint-disable-next-line no-console
            console.log(`${JSON.stringify(await exportJWK(key))}`);
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
