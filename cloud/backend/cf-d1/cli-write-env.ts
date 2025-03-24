import { command, option, string, flag, optional, array, multioption } from "cmd-ts";
import { rt, SuperThis } from "@fireproof/core";
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
  if (outFname === "-") {
    outFname = "/dev/stdout";
  }
  const fname = outFname ?? sthis.pathOps.join(sthis.pathOps.dirname(envFname), `.dev.vars.${env}`);
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

export function writeEnvCmd(sthis: SuperThis) {
  return command({
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
      fromEnv: multioption({
        long: "fromEnv",
        type: array(string),
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
      let vals: Record<string, string | param> = {};
      if (args.fromEnv.length === 0) {
        vals = {
          [rt.sts.envKeyDefaults.PUBLIC]: param.REQUIRED,
          STORAGE_URL: "http://localhost:9000/testbucket",
          FP_STORAGE_URL: param.OPTIONAL,
        };

        if (!args.excludeSecrets) {
          vals["ACCESS_KEY_ID"] = "minioadmin";
          vals["SECRET_ACCESS_KEY"] = "minioadmin";
        }
      } else {
        Array.from(new Set(args.fromEnv))
          .sort()
          .reduce((acc, i) => {
            const [k, v] = i.split("=");
            if (v === undefined) {
              acc[k] = param.REQUIRED;
            } else {
              acc[k] = v;
            }
            return acc;
          }, vals);
      }

      const rVal = sthis.env.gets(vals);
      if (rVal.isErr()) {
        throw rVal.Err();
      }
      const fname = await writeEnvFile(sthis, args.wranglerToml, args.out, args.env, rVal.Ok(), args.doNotOverwrite, args.json);
      if (!["-", "stdout"].find((i) => args.out?.includes(i))) {
        // eslint-disable-next-line no-console
        console.log(`Wrote: ${fname} keys:  ${JSON.stringify(Object.keys(rVal.Ok()))}`);
      }
    },
  });
}
