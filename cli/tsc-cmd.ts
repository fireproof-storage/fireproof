import { command, flag } from "cmd-ts";
import { SuperThis } from "@fireproof/core-types-base";
// import { findUp } from "find-up";
import { $, quotePowerShell } from "zx";

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
  // console.log("args[", cmd, "]");

  // eslint-disable-next-line no-console
  console.log(`Using typescript: ${cmd} on ${isPowerShell() ? "PowerShell" : "Unix shell"}`);
  if (isPowerShell()) {
    $.quote = quotePowerShell;
  }

  $.verbose = false;
  const p = $({ stdio: ["inherit", "inherit", "inherit"] })`${cmd}`;
  await p;
  // $.verbose = true;
  // await $`${cmd}`
}

export function tscCmd(sthis: SuperThis) {
  const cmd = command({
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

    handler: async (args) => {
      return handleTsc(args as unknown as string[], sthis);
    },
  });
  return cmd;
}
