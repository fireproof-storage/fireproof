import { dotenv } from "zx";
import { command, run, option, string, flag, optional } from "cmd-ts";
import { ensureSuperThis, rt, SuperThis } from "@fireproof/core";
import { param } from "@adviser/cement";
import fs from "fs/promises";

export async function writeEnvFile(
  sthis: SuperThis,
  envFname: string,
  outFname: string | undefined,
  env: string,
  vals: Record<string, string>,
  doNotOverwrite: boolean,
  json: boolean,
) {
  const fname = sthis.pathOps.join(sthis.pathOps.dirname(envFname), `.dev.vars.${env}`);
  if (
    doNotOverwrite &&
    (await fs
      .stat(fname)
      .then(() => true)
      .catch(() => false))
  ) {
    return fname;
  }
  let render: string;
  if (json) {
    render = JSON.stringify(vals, null, 2);
  } else {
    // console.log("Writing to", fname);
    render = Object.entries(vals)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
  }
  await fs.writeFile(outFname ?? fname, render);
  return fname;
}

(async () => {
  dotenv.config(process.env.FP_ENV ?? ".env");
  const sthis = ensureSuperThis();
  const cmd = command({
    name: "cli-write-env",
    description: "write env file",
    version: "1.0.0",
    args: {
      wranglerToml: option({
        long: "wranglerToml",
        type: string,
        defaultValue: () => "./wrangler.toml",
        defaultValueIsSerializable: true,
      }),
      env: option({
        long: "env",
        type: string,
        defaultValue: () => "test",
        defaultValueIsSerializable: true,
      }),
      doNotOverwrite: flag({
        long: "doNotOverwrite",
      }),
      excludeSecrets: flag({
        long: "excludeSecrets",
      }),
      out: option({
        long: "out",
        type: optional(string),
      }),
      json: flag({
        long: "json",
      }),
    },
    handler: async (args) => {
      const vals = {
        [rt.sts.envKeyDefaults.PUBLIC]: param.REQUIRED,
        STORAGE_URL: "http://localhost:9000/testbucket",
      };

      if (!args.excludeSecrets) {
        vals["ACCESS_KEY_ID"] = "minioadmin";
        vals["SECRET_ACCESS_KEY"] = "minioadmin";
      }

      const rVal = sthis.env.gets(vals);
      if (rVal.isErr()) {
        throw rVal.Err();
      }
      const fname = await writeEnvFile(sthis, args.wranglerToml, args.out, args.env, rVal.Ok(), args.doNotOverwrite, args.json);
      if (!(args.json || args.out)) {
        // eslint-disable-next-line no-console
        console.log("Wrote: ", fname);
      }
    },
  });

  await run(cmd, process.argv.slice(2));
  // eslint-disable-next-line no-console
})().catch(console.error);
