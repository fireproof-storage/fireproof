import { command, flag } from "cmd-ts";
import { SuperThis } from "@fireproof/core-types-base";
// import { findUp } from "find-up";
import { $, quotePowerShell } from "zx";
import { Result, HandleTriggerCtx, EventoHandler, EventoResultType, Option } from "@adviser/cement";
import { type } from "arktype";
import { CliCtx } from "../cli-ctx.js";
import { sendMsg, WrapCmdTSMsg } from "../cmd-evento.js";

function isPowerShell() {
  // PowerShell sets these environment variables
  const psModulePath = process.env.PSModulePath;
  const psExecutionPolicyPreference = process.env.PSExecutionPolicyPreference;

  // Check for PowerShell-specific env vars
  return !!(psModulePath || psExecutionPolicyPreference);
}

export async function handleTsc(args: string[], sthis: SuperThis) {
  // const top = await findUp("tsconfig.dist.json");
  // if (!top) {
  //   throw new Error("Could not find tsconfig.dist.json in the project root.");
  // }
  const tsc = sthis.env.get("FP_TSC") ?? "tsgo";
  // const rargs = process.argv.slice(2);
  const cmd = [tsc, ...args];
  // eslint-disable-next-line no-console
  console.log(`Using typescript: ${cmd} on ${isPowerShell() ? "PowerShell" : "UnixShell"}`);
  if (isPowerShell()) {
    $.quote = quotePowerShell;
  }

  $.verbose = false;
  const p = $({ stdio: ["inherit", "inherit", "inherit"] })`${cmd}`;
  await p.catch((err) => {
    process.exit(err.exitCode);
  });
}

export const ReqTsc = type({
  type: "'core-cli.tsc'",
  help: "boolean",
});
export type ReqTsc = typeof ReqTsc.infer;

export const ResTsc = type({
  type: "'core-cli.res-tsc'",
  output: "string",
});
export type ResTsc = typeof ResTsc.infer;

export function isResTsc(u: unknown): u is ResTsc {
  return !(ResTsc(u) instanceof type.errors);
}

export const tscEvento: EventoHandler<WrapCmdTSMsg<unknown>, ReqTsc, ResTsc> = {
  hash: "core-cli.tsc",
  validate: (ctx) => {
    if (!(ReqTsc(ctx.enRequest) instanceof type.errors)) {
      return Promise.resolve(Result.Ok(Option.Some(ctx.enRequest as ReqTsc)));
    }
    return Promise.resolve(Result.Ok(Option.None()));
  },
  handle: async (ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, ReqTsc, ResTsc>): Promise<Result<EventoResultType>> => {
    const cliCtx = ctx.ctx.getOrThrow<CliCtx>("cliCtx");
    const args = ctx.validated;
    const tscArgs = args.help ? ["--help"] : [];
    const sthis = cliCtx.sthis;
    const tsc = sthis.env.get("FP_TSC") ?? "tsgo";
    const cmd = [tsc, ...tscArgs];
    if (isPowerShell()) {
      $.quote = quotePowerShell;
    }
    $.verbose = false;
    const p = await $({ stdio: ["inherit", "inherit", "inherit"] })`${cmd}`.nothrow();
    if (p.exitCode !== 0) {
      return Result.Err(`tsc failed with exit code ${p.exitCode}`);
    }
    return sendMsg(ctx, {
      type: "core-cli.res-tsc",
      output: "tsc completed",
    } satisfies ResTsc);
  },
};

export function tscCmd(ctx: CliCtx) {
  return command({
    name: "tsc or tsgo",
    description: "tsc evolution tsgo",
    args: {
      help: flag({
        long: "help",
        short: "h",
        defaultValue: () => false,
        description: "Show help.",
      }),
    },
    handler: ctx.cliStream.enqueue((args) => {
      return {
        type: "core-cli.tsc",
        ...args,
      };
    }),
  });
}
