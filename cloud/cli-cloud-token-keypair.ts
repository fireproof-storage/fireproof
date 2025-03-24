import { rt } from "@fireproof/core";
import { command } from "cmd-ts";

export const GenerateKeyPairCmd = command({
  name: "generate-keypair",
  description: "Generate a keypair",
  version: "1.0.0",
  args: {},
  handler: async () => {
    const key = await rt.sts.SessionTokenService.generateKeyPair("ES256", { extractable: true });
    // eslint-disable-next-line no-console
    console.log(`${rt.sts.envKeyDefaults.PUBLIC}=${key.strings.publicKey}`);
    // eslint-disable-next-line no-console
    console.log(`${rt.sts.envKeyDefaults.SECRET}=${key.strings.privateKey}`);
  },
});
