import { array, command, flag, multioption, option, string } from "cmd-ts";
import fs from "fs-extra";
import { glob } from "zx";
import { Result, HandleTriggerCtx, EventoHandler, EventoResultType, Option } from "@adviser/cement";
import { type } from "arktype";
import { CliCtx } from "./cli-ctx.js";
import { sendMsg, sendProgress, WrapCmdTSMsg } from "./cmd-evento.js";

// --- Set Dependencies ---

export const ReqSetDependencies = type({
  type: "'core-cli.set-dependencies'",
});
export type ReqSetDependencies = typeof ReqSetDependencies.infer;

export const ResSetDependencies = type({
  type: "'core-cli.res-set-dependencies'",
  output: "string",
});
export type ResSetDependencies = typeof ResSetDependencies.infer;

export function isResSetDependencies(u: unknown): u is ResSetDependencies {
  return !(ResSetDependencies(u) instanceof type.errors);
}

export const setDependenciesEvento: EventoHandler<WrapCmdTSMsg<unknown>, ReqSetDependencies, ResSetDependencies> = {
  hash: "core-cli.set-dependencies",
  validate: (ctx) => {
    if (!(ReqSetDependencies(ctx.enRequest) instanceof type.errors)) {
      return Promise.resolve(Result.Ok(Option.Some(ctx.enRequest as ReqSetDependencies)));
    }
    return Promise.resolve(Result.Ok(Option.None()));
  },
  handle: async (
    ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, ReqSetDependencies, ResSetDependencies>,
  ): Promise<Result<EventoResultType>> => {
    const args = ctx.request.cmdTs.raw as {
      packageJsons: string[];
      depName: string;
      depVersion: string;
      devDependency: boolean;
      peerDependency: boolean;
    };

    const packagesJsonFiles = await glob(args.packageJsons, {
      gitignore: true,
      dot: false,
      ignore: ["node_modules/**", "**/node_modules/**", "dist/**", "build/**", ".next/**", "coverage/**"],
      onlyFiles: true,
      absolute: false,
      caseSensitiveMatch: false,
    });
    await sendProgress(ctx, "info", `Found ${packagesJsonFiles.length} package.json files to patch.`);
    for (const packageJsonPath of packagesJsonFiles) {
      const packageJson = await fs.readJSON(packageJsonPath);
      let ref: Record<string, string>;
      if (args.devDependency) {
        ref = packageJson.devDependencies || {};
        packageJson.devDependencies = ref;
        await sendProgress(ctx, "info", `Setting devDependency ${args.depName} to "${args.depVersion}" in ${packageJsonPath}`);
      } else if (args.peerDependency) {
        ref = packageJson.peerDependencies || {};
        packageJson.peerDependencies = ref;
        await sendProgress(ctx, "info", `Setting peerDependency ${args.depName} to "${args.depVersion}" in ${packageJsonPath}`);
      } else {
        ref = packageJson.dependencies || {};
        packageJson.dependencies = ref;
        await sendProgress(ctx, "info", `Setting dependency ${args.depName} to "${args.depVersion}" in ${packageJsonPath}`);
      }
      if (!args.depVersion) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete ref[args.depName];
      } else {
        ref[args.depName] = args.depVersion;
      }
      await fs.writeJSONSync(packageJsonPath, packageJson, { spaces: 2 });
    }

    return sendMsg(ctx, {
      type: "core-cli.res-set-dependencies",
      output: `Patched ${packagesJsonFiles.length} package.json files.`,
    } satisfies ResSetDependencies);
  },
};

export function setDependenciesCmd(ctx: CliCtx) {
  return command({
    name: "fireproof set dependencies",
    description: "helps to set dependencies in package.json files",
    version: "1.0.0",
    args: {
      packageJsons: multioption({
        long: "packageJsons",
        short: "p",
        type: array(string),
        defaultValue: () => ["**/package.json"],
        defaultValueIsSerializable: true,
        description: "List of package.json files to patch, defaults to ['**/package.json'].",
      }),
      depName: option({
        long: "depName",
        short: "n",
        type: string,
        description: "The dependency name to set in package.json files.",
      }),
      depVersion: option({
        long: "depVersion",
        short: "v",
        type: string,
        defaultValue: () => "",
        description: "The version of the dependency to set in package.json files.",
      }),
      devDependency: flag({
        long: "devDependency",
        short: "D",
        description: "If set, the dependency will be added to devDependencies instead of dependencies.",
      }),
      peerDependency: flag({
        long: "peerDependency",
        short: "P",
        description: "If set, the dependency will be added to peerDependencies instead of dependencies.",
      }),
    },
    handler: ctx.cliStream.enqueue(async (_args) => {
      return {
        type: "core-cli.set-dependencies",
      } satisfies ReqSetDependencies;
    }),
  });
}

// --- Set Scripts ---

export const ReqSetScripts = type({
  type: "'core-cli.set-scripts'",
});
export type ReqSetScripts = typeof ReqSetScripts.infer;

export const ResSetScripts = type({
  type: "'core-cli.res-set-scripts'",
  output: "string",
});
export type ResSetScripts = typeof ResSetScripts.infer;

export function isResSetScripts(u: unknown): u is ResSetScripts {
  return !(ResSetScripts(u) instanceof type.errors);
}

export const setScriptsEvento: EventoHandler<WrapCmdTSMsg<unknown>, ReqSetScripts, ResSetScripts> = {
  hash: "core-cli.set-scripts",
  validate: (ctx) => {
    if (!(ReqSetScripts(ctx.enRequest) instanceof type.errors)) {
      return Promise.resolve(Result.Ok(Option.Some(ctx.enRequest as ReqSetScripts)));
    }
    return Promise.resolve(Result.Ok(Option.None()));
  },
  handle: async (ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, ReqSetScripts, ResSetScripts>): Promise<Result<EventoResultType>> => {
    const args = ctx.request.cmdTs.raw as {
      packageJsons: string[];
      scriptName: string;
      scriptAction: string;
      scriptDelete: boolean;
    };

    const packagesJsonFiles = await glob(args.packageJsons, {
      gitignore: true,
      dot: false,
      ignore: ["node_modules/**", "**/node_modules/**", "dist/**", "build/**", ".next/**", "coverage/**"],
      onlyFiles: true,
      absolute: false,
      caseSensitiveMatch: false,
    });
    await sendProgress(ctx, "info", `Found ${packagesJsonFiles.length} package.json files to patch.`);
    for (const packageJsonPath of packagesJsonFiles) {
      const packageJson = await fs.readJSON(packageJsonPath);
      if (args.scriptDelete || !args.scriptAction) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete packageJson.scripts[args.scriptName];
        await sendProgress(ctx, "info", `Deleting script ${args.scriptName} from ${packageJsonPath}`);
      } else {
        packageJson.scripts[args.scriptName] = args.scriptAction;
        await sendProgress(ctx, "info", `Setting script ${args.scriptName} to "${args.scriptAction}" in ${packageJsonPath}`);
      }
      await fs.writeJSONSync(packageJsonPath, packageJson, { spaces: 2 });
    }

    return sendMsg(ctx, {
      type: "core-cli.res-set-scripts",
      output: `Patched ${packagesJsonFiles.length} package.json files.`,
    } satisfies ResSetScripts);
  },
};

export function setScriptsCmd(ctx: CliCtx) {
  return command({
    name: "fireproof build cli",
    description: "helps to build fp",
    version: "1.0.0",
    args: {
      packageJsons: multioption({
        long: "packageJsons",
        short: "p",
        type: array(string),
        defaultValue: () => ["**/package.json"],
        defaultValueIsSerializable: true,
        description: "List of package.json files to patch, defaults to ['**/package.json'].",
      }),
      scriptName: option({
        long: "scriptName",
        short: "s",
        type: string,
        description: "The script name to set in package.json files.",
      }),
      scriptAction: option({
        long: "scriptAction",
        short: "a",
        type: string,
        defaultValue: () => "",
        description: "The script action to set in package.json files.",
      }),
      scriptDelete: flag({
        long: "scriptDelete",
        short: "d",
        description: "If set, the script will be deleted instead of set.",
      }),
    },
    handler: ctx.cliStream.enqueue(async (_args) => {
      return {
        type: "core-cli.set-scripts",
      } satisfies ReqSetScripts;
    }),
  });
}
