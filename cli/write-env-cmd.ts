import { command, option, string, flag, optional, array, multioption } from "cmd-ts";
import * as rt from "@fireproof/core-runtime";
import { SuperThis } from "@fireproof/core-types-base";
import { Result, HandleTriggerCtx, EventoHandler, EventoResultType, Option, param } from "@adviser/cement";
import { type } from "arktype";
import { CliCtx } from "./cli-ctx.js";
import { sendMsg, WrapCmdTSMsg } from "./cmd-evento.js";
import fs from "fs/promises";

// --- Arktype types ---

export const ReqWriteEnv = type({
  type: "'core-cli.write-env'",
});
export type ReqWriteEnv = typeof ReqWriteEnv.infer;

export const ResWriteEnv = type({
  type: "'core-cli.res-write-env'",
  output: "string",
});
export type ResWriteEnv = typeof ResWriteEnv.infer;

export function isResWriteEnv(u: unknown): u is ResWriteEnv {
  return !(ResWriteEnv(u) instanceof type.errors);
}

// --- Utility function (kept as-is) ---

export async function writeEnvFile(
  sthis: SuperThis,
  envFname: string,
  outFname: string | undefined,
  env: string,
  vals: Record<string, string>,
  doNotOverwrite: boolean,
  json: boolean,
) {
  // Prepare output content
  let render: string;
  if (json) {
    render = JSON.stringify(vals, null, 2);
  } else {
    render = Object.entries(vals)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
  }

  // Handle stdout output (portable approach)
  if (outFname === "-") {
    process.stdout.write(render + "\n");
    return "-";
  }

  // Determine output file path
  const fname = outFname ?? sthis.pathOps.join(sthis.pathOps.dirname(envFname), `.dev.vars.${env}`);

  // Check if we should skip writing due to doNotOverwrite flag
  if (
    doNotOverwrite &&
    (await fs
      .stat(fname)
      .then(() => true)
      .catch(() => false))
  ) {
    return fname;
  }

  // Write to file
  await fs.writeFile(fname, render);
  return fname;
}

// --- Evento handler ---

export const writeEnvEvento: EventoHandler<WrapCmdTSMsg<unknown>, ReqWriteEnv, ResWriteEnv> = {
  hash: "core-cli.write-env",
  validate: (ctx) => {
    if (!(ReqWriteEnv(ctx.enRequest) instanceof type.errors)) {
      return Promise.resolve(Result.Ok(Option.Some(ctx.enRequest as ReqWriteEnv)));
    }
    return Promise.resolve(Result.Ok(Option.None()));
  },
  handle: async (ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, ReqWriteEnv, ResWriteEnv>): Promise<Result<EventoResultType>> => {
    const cliCtx = ctx.ctx.getOrThrow<CliCtx>("cliCtx");
    const sthis = cliCtx.sthis;
    const args = ctx.request.cmdTs.raw as {
      wranglerToml: string;
      env: string;
      doNotOverwrite: boolean;
      excludeSecrets: boolean;
      fromEnv: string[];
      out: string | undefined;
      json: boolean;
    };

    let vals: Record<string, string | param> = {};
    if (args.fromEnv.length === 0) {
      vals = {
        [rt.sts.envKeyDefaults.PUBLIC]: param.REQUIRED,
        STORAGE_URL: sthis.env.get("STORAGE_URL") ?? "http://127.0.0.1:9000/testbucket",
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
      return Result.Err(rVal.Err());
    }
    const fname = await writeEnvFile(sthis, args.wranglerToml, args.out, args.env, rVal.Ok(), args.doNotOverwrite, args.json);
    const output = ["-", "stdout"].find((i) => args.out?.includes(i))
      ? fname
      : `Wrote: ${fname} keys:  ${JSON.stringify(Object.keys(rVal.Ok()))}`;

    return sendMsg(ctx, {
      type: "core-cli.res-write-env",
      output,
    } satisfies ResWriteEnv);
  },
};

// --- Slim cmd-ts command ---

export function writeEnvCmd(ctx: CliCtx) {
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
    handler: ctx.cliStream.enqueue(async (_args) => {
      return {
        type: "core-cli.write-env",
      } satisfies ReqWriteEnv;
    }),
  });
}
