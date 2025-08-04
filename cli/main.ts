import { ensureSuperThis } from "@fireproof/core-runtime";
import { run, subcommands } from "cmd-ts";
import { keyCmd, preSignedUrlCmd } from "@fireproof/cloud-base";
import { writeEnvCmd } from "@fireproof/cloud-backend-cf-d1";

import { dotenv } from "zx";
import { buildCmd } from "./build-cmd.js";
import { setDependenciesCmd, setScriptsCmd } from "./set-scripts-cmd.js";
import { handleTsc, tscCmd } from "./tsc-cmd.js";

(async () => {
  dotenv.config(process.env.FP_ENV ?? ".env");
  const sthis = ensureSuperThis();

  // console.log("tsc", process.argv);
  if (process.argv[2] === "tsc") {
    return handleTsc(process.argv.slice(3), sthis);
  }

  const cmd = subcommands({
    name: "fp-cli",
    description: "fireproof cli",
    version: "1.0.0",
    cmds: {
      tsc: tscCmd(sthis),
      key: keyCmd(sthis),
      writeEnv: writeEnvCmd(sthis),
      preSigned: preSignedUrlCmd(sthis),
      build: buildCmd(sthis),
      setScripts: setScriptsCmd(sthis),
      setDependencies: setDependenciesCmd(sthis),
    },
  });

  await run(cmd, process.argv.slice(2));
  // eslint-disable-next-line no-console
})().catch(console.error);
