import { ensureSuperThis } from "@fireproof/core-runtime";
import { run, subcommands } from "cmd-ts";

import { dotenv } from "zx";
import { buildCmd } from "./build-cmd.js";
import { setDependenciesCmd, setScriptsCmd } from "./set-scripts-cmd.js";
import { handleTsc, tscCmd } from "./tsc-cmd.js";
import { writeEnvCmd } from "./write-env.js";
import { keyCmd } from "./cloud-token-key-cmd.js";
import { preSignedUrlCmd } from "./pre-signed-url.js";
import { dependabotCmd } from "./dependabot-cmd.js";
import { testContainerCmd } from "./test-container-cmd.js";

(async () => {
  dotenv.config(process.env.FP_ENV ?? ".env");
  const sthis = ensureSuperThis();

  // console.log("tsc", process.argv);
  if (process.argv[2] === "tsc") {
    return handleTsc(process.argv.slice(3), sthis);
  }

  const cmd = subcommands({
    name: "core-cli",
    description: "fireproof/core-cli",
    version: "1.0.0",
    cmds: {
      tsc: tscCmd(sthis),
      key: keyCmd(sthis),
      writeEnv: writeEnvCmd(sthis),
      preSigned: preSignedUrlCmd(sthis),
      build: buildCmd(sthis),
      setScripts: setScriptsCmd(sthis),
      setDependencies: setDependenciesCmd(sthis),
      dependabot: dependabotCmd(sthis),
      testContainer: testContainerCmd(sthis),
    },
  });

  await run(cmd, process.argv.slice(2));
  // eslint-disable-next-line no-console
})().catch(console.error);
