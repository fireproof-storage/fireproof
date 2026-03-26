/* eslint-disable no-console */
import { command, flag, multioption, option, string, array } from "cmd-ts";
import { $, glob } from "zx";
import { readFile } from "fs/promises";
import { Result, HandleTriggerCtx, EventoHandler, EventoResultType, Option } from "@adviser/cement";
import { type } from "arktype";
import { CliCtx } from "./cli-ctx.js";
import { sendMsg, WrapCmdTSMsg } from "./cmd-evento.js";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

// Find all package.json files recursively using zx glob (respects .gitignore)
async function findPackageJsonFiles(dir: string): Promise<string[]> {
  const files = await glob([`${dir}/**/package.json`, `!${dir}/**/node_modules/**`], {
    gitignore: true,
  });
  return files;
}

// Find packages matching the regex patterns in a package.json
async function findMatchingPackages(packageJsonPath: string, patterns: string[]): Promise<string[]> {
  let pkg: PackageJson;
  try {
    const content = await readFile(packageJsonPath, "utf-8");
    pkg = JSON.parse(content) as PackageJson;
  } catch (e) {
    console.warn(`⚠️  Skipping unreadable/invalid JSON: ${packageJsonPath}`);
    return [];
  }

  const allDeps = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  };

  const matchingPackages = new Set<string>();
  const regexes = patterns.map((p) => {
    try {
      return new RegExp(p);
    } catch {
      throw new Error(`Invalid --pkg regex: ${p}`);
    }
  });

  for (const pkgName of Object.keys(allDeps)) {
    for (const regex of regexes) {
      if (regex.test(pkgName)) {
        matchingPackages.add(pkgName);
        break;
      }
    }
  }

  return Array.from(matchingPackages);
}

export const ReqUpdateDeps = type({
  type: "'core-cli.update-deps'",
});
export type ReqUpdateDeps = typeof ReqUpdateDeps.infer;

export const ResUpdateDeps = type({
  type: "'core-cli.res-update-deps'",
  output: "string",
});
export type ResUpdateDeps = typeof ResUpdateDeps.infer;

export function isResUpdateDeps(u: unknown): u is ResUpdateDeps {
  return !(ResUpdateDeps(u) instanceof type.errors);
}

export const updateDepsEvento: EventoHandler<WrapCmdTSMsg<unknown>, ReqUpdateDeps, ResUpdateDeps> = {
  hash: "core-cli.update-deps",
  validate: (ctx) => {
    if (!(ReqUpdateDeps(ctx.enRequest) instanceof type.errors)) {
      return Promise.resolve(Result.Ok(Option.Some(ctx.enRequest as ReqUpdateDeps)));
    }
    return Promise.resolve(Result.Ok(Option.None()));
  },
  handle: async (ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, ReqUpdateDeps, ResUpdateDeps>): Promise<Result<EventoResultType>> => {
    const args = ctx.request.cmdTs.raw as {
      ver: string;
      pkg: string[];
      currentDir: string;
      dryRun: boolean;
    };

    const { ver, pkg: patterns, currentDir, dryRun } = args;

    $.verbose = true;

    console.log(`\n🔍 Searching for package.json files in: ${currentDir}`);
    console.log(`📋 Package patterns: ${patterns.join(", ")}`);
    console.log(`🔄 Target version: ${ver}`);
    if (dryRun) {
      console.log(`🧪 DRY RUN MODE - No changes will be made`);
    }
    console.log();

    try {
      // Find all package.json files
      const packageJsonFiles = await findPackageJsonFiles(currentDir);
      console.log(`Found ${packageJsonFiles.length} package.json files\n`);

      // Collect all unique package names matching our patterns
      const allMatchingPackages = new Set<string>();

      for (const file of packageJsonFiles) {
        const matches = await findMatchingPackages(file, patterns);
        matches.forEach((pkg) => allMatchingPackages.add(pkg));
      }

      const packagesToUpdate = Array.from(allMatchingPackages).sort();

      if (packagesToUpdate.length === 0) {
        console.log("⚠️  No matching packages found!");
        return sendMsg(ctx, {
          type: "core-cli.res-update-deps",
          output: "No matching packages found",
        } satisfies ResUpdateDeps);
      }

      console.log(`📦 Found ${packagesToUpdate.length} unique packages to update:\n`);
      packagesToUpdate.forEach((pkg) => console.log(`   - ${pkg}`));
      console.log();

      if (dryRun) {
        console.log("🧪 DRY RUN: Would run the following commands:\n");
        for (const pkg of packagesToUpdate) {
          console.log(`   pnpm update -r ${pkg}@${ver}`);
        }
        console.log("\n✨ Dry run complete! Re-run without --dry-run to apply changes.\n");
        return sendMsg(ctx, {
          type: "core-cli.res-update-deps",
          output: `Dry run complete. ${packagesToUpdate.length} package(s) would be updated.`,
        } satisfies ResUpdateDeps);
      }

      // Update each package using pnpm update with -r flag for recursive workspace update
      const failures: { pkg: string; error: string }[] = [];

      for (const pkg of packagesToUpdate) {
        console.log(`\n📦 Updating ${pkg} to ${ver}...`);
        try {
          await $({ cwd: currentDir })`pnpm update -r ${pkg}@${ver}`;
          console.log(`   ✅ Updated ${pkg}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          failures.push({ pkg, error: errorMessage });
          console.log(`   ❌ Failed to update ${pkg}`);
          console.log(`      Error: ${errorMessage}`);
        }
      }

      if (failures.length > 0) {
        console.log("\n❌ Update failed!\n");
        console.log(`Failed to update ${failures.length} package(s):\n`);
        failures.forEach(({ pkg, error }) => {
          console.log(`   - ${pkg}`);
          console.log(`     ${error}\n`);
        });
        return Result.Err(`Failed to update ${failures.length} package(s)`);
      }

      console.log("\n✨ Update complete!\n");
      console.log("📋 Next steps:");
      console.log("  1. Review changes: git diff");
      console.log("  2. Run checks: pnpm check");
      console.log("  3. Run tests: pnpm test:all");

      return sendMsg(ctx, {
        type: "core-cli.res-update-deps",
        output: `Updated ${packagesToUpdate.length} package(s) to version ${ver}`,
      } satisfies ResUpdateDeps);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("\n❌ Error updating dependencies:", errorMessage);
      return Result.Err(`Error updating dependencies: ${errorMessage}`);
    }
  },
};

export function updateDepsCmd(ctx: CliCtx) {
  const cmd = command({
    name: "updateDeps",
    description: "Update all matching dependencies to a specified version across the monorepo",
    version: "1.0.0",
    args: {
      ver: option({
        type: string,
        long: "ver",
        short: "V",
        description: "The version to update to (e.g., 0.24.3 or 0.24.2-dev-clerk)",
      }),
      pkg: multioption({
        type: array(string),
        long: "pkg",
        short: "p",
        description: "Package name regex pattern to match (can be specified multiple times)",
        defaultValue: () => ["use-fireproof", "@fireproof/.*"],
        defaultValueIsSerializable: true,
      }),
      currentDir: option({
        type: string,
        long: "currentDir",
        short: "C",
        description: "Directory to search for package.json files",
        defaultValue: () => process.cwd(),
        defaultValueIsSerializable: true,
      }),
      dryRun: flag({
        long: "dry-run",
        short: "d",
        description: "Show what would be updated without making changes",
      }),
    },
    handler: ctx.cliStream.enqueue(async (_args) => {
      return {
        type: "core-cli.update-deps",
      } satisfies ReqUpdateDeps;
    }),
  });
  return cmd;
}
