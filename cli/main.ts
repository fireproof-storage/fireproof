import { ensureSuperThis } from "@fireproof/core-runtime";
import { run, subcommands } from "cmd-ts";
import { keyCmd, preSignedUrlCmd } from "@fireproof/cloud-base";
import { writeEnvCmd } from "@fireproof/cloud-backend-cf-d1";

import { dotenv } from "zx";

(async () => {
  dotenv.config(process.env.FP_ENV ?? ".env");
  const sthis = ensureSuperThis();
  const cmd = subcommands({
    name: "fp-cli",
    description: "fireproof cli",
    version: "1.0.0",
    cmds: {
      key: keyCmd(sthis),
      writeEnv: writeEnvCmd(sthis),
      preSigned: preSignedUrlCmd(sthis),
    },
  });

  await run(cmd, process.argv.slice(2));
  // eslint-disable-next-line no-console
})().catch(console.error);
