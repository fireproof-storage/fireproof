import { ensureSuperThis } from "@fireproof/core";
import { run, subcommands } from "cmd-ts";
import { GenerateKeyPairCmd } from "../cloud/cli-cloud-token-keypair.js";
import { writeEnvCmd } from "../cloud/backend/cf-d1/cli-write-env.js";

import { dotenv } from "zx";
import { preSignedUrlCmd } from "../cloud/cli-pre-signed-url.js";

(async () => {
  dotenv.config(process.env.FP_ENV ?? ".env");
  const sthis = ensureSuperThis();
  const cmd = subcommands({
    name: "fp-cli",
    description: "fireproof cli",
    version: "1.0.0",
    cmds: {
      generateKey: GenerateKeyPairCmd,
      writeEnv: writeEnvCmd(sthis),
      preSigned: preSignedUrlCmd(sthis),
    },
  });

  await run(cmd, process.argv.slice(2));
  // eslint-disable-next-line no-console
})().catch(console.error);
