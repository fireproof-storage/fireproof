import { command, flag } from "cmd-ts";
import { SuperThis } from "@fireproof/core-types-base";
import { findUp } from "find-up";
import { $ } from "zx";

export async function handleTsc(args: string[], sthis: SuperThis) {
  const top = await findUp("tsconfig.dist.json");
  if (!top) {
    throw new Error("Could not find tsconfig.dist.json in the project root.");
  }
  const tsc = sthis.env.get("FP_TSC") ?? "tsc";
  // const rargs = process.argv.slice(2);
  const cmd = [tsc, ...args];
  // console.log("args[", cmd, "]");

  $.verbose = false;
  const p = $({ stdio: ["inherit", "inherit", "inherit"] })`${cmd}`;
  await p;
  // $.verbose = true;
  // await $`${cmd}`
}

export function tscCmd(sthis: SuperThis) {
  const cmd = command({
    name: "fireproof tsc",
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
      handleTsc(args as unknown as string[], sthis);
    },
  });
  return cmd;
}
