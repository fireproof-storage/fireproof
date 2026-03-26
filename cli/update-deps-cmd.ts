import { command, flag, multioption, option, string, array } from "cmd-ts";
import { $, glob } from "zx";
import { readFile } from "fs/promises";
import { Result, HandleTriggerCtx, EventoHandler, EventoResultType, Option } from "@adviser/cement";
import { type } from "arktype";
import { CliCtx } from "./cli-ctx.js";
import { sendMsg, sendProgress, WrapCmdTSMsg } from "./cmd-evento.js";

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
async function findMatchingPackages(
  ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, ReqUpdateDeps, ResUpdateDeps>,
  packageJsonPath: string,
  patterns: string[],
): Promise<string[]> {
  let pkg: PackageJson;
  try {
    const content = await readFile(packageJsonPath, "utf-8");
    pkg = JSON.parse(content) as PackageJson;
  } catch (e) {
    await sendProgress(ctx, "warn", `⚠️  Skipping unreadable/invalid JSON: ${packageJsonPath}`);
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

    await sendProgress(ctx, "info", `\n🔍 Searching for package.json files in: ${currentDir}`);
    await sendProgress(ctx, "info", `📋 Package patterns: ${patterns.join(", ")}`);
    await sendProgress(ctx, "info", `🔄 Target version: ${ver}`);
    if (dryRun) {
      await sendProgress(ctx, "info", `🧪 DRY RUN MODE - No changes will be made`);
    }
    await sendProgress(ctx, "info", "");

    try {
      // Find all package.json files
      const packageJsonFiles = await findPackageJsonFiles(currentDir);
      await sendProgress(ctx, "info", `Found ${packageJsonFiles.length} package.json files\n`);

      // Collect all unique package names matching our patterns
      const allMatchingPackages = new Set<string>();

      for (const file of packageJsonFiles) {
        const matches = await findMatchingPackages(ctx, file, patterns);
        matches.forEach((pkg) => allMatchingPackages.add(pkg));
      }

      const packagesToUpdate = Array.from(allMatchingPackages).sort();

      if (packagesToUpdate.length === 0) {
        await sendProgress(ctx, "warn", "⚠️  No matching packages found!");
        return sendMsg(ctx, {
          type: "core-cli.res-update-deps",
          output: "No matching packages found",
        } satisfies ResUpdateDeps);
      }

      await sendProgress(ctx, "info", `📦 Found ${packagesToUpdate.length} unique packages to update:\n`);
      for (const pkg of packagesToUpdate) {
        await sendProgress(ctx, "info", `   - ${pkg}`);
      }
      await sendProgress(ctx, "info", "");

      if (dryRun) {
        await sendProgress(ctx, "info", "🧪 DRY RUN: Would run the following commands:\n");
        for (const pkg of packagesToUpdate) {
          await sendProgress(ctx, "info", `   pnpm update -r ${pkg}@${ver}`);
        }
        await sendProgress(ctx, "info", "\n✨ Dry run complete! Re-run without --dry-run to apply changes.\n");
        return sendMsg(ctx, {
          type: "core-cli.res-update-deps",
          output: `Dry run complete. ${packagesToUpdate.length} package(s) would be updated.`,
        } satisfies ResUpdateDeps);
      }

      // Update each package using pnpm update with -r flag for recursive workspace update
      const failures: { pkg: string; error: string }[] = [];

      for (const pkg of packagesToUpdate) {
        await sendProgress(ctx, "info", `\n📦 Updating ${pkg} to ${ver}...`);
        try {
          await $({ cwd: currentDir })`pnpm update -r ${pkg}@${ver}`;
          await sendProgress(ctx, "info", `   ✅ Updated ${pkg}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          failures.push({ pkg, error: errorMessage });
          await sendProgress(ctx, "error", `   ❌ Failed to update ${pkg}`);
          await sendProgress(ctx, "error", `      Error: ${errorMessage}`);
        }
      }

      if (failures.length > 0) {
        await sendProgress(ctx, "error", "\n❌ Update failed!\n");
        await sendProgress(ctx, "error", `Failed to update ${failures.length} package(s):\n`);
        for (const { pkg, error } of failures) {
          await sendProgress(ctx, "error", `   - ${pkg}`);
          await sendProgress(ctx, "error", `     ${error}\n`);
        }
        return Result.Err(`Failed to update ${failures.length} package(s)`);
      }

      await sendProgress(ctx, "info", "\n✨ Update complete!\n");
      await sendProgress(ctx, "info", "📋 Next steps:");
      await sendProgress(ctx, "info", "  1. Review changes: git diff");
      await sendProgress(ctx, "info", "  2. Run checks: pnpm check");
      await sendProgress(ctx, "info", "  3. Run tests: pnpm test:all");

      return sendMsg(ctx, {
        type: "core-cli.res-update-deps",
        output: `Updated ${packagesToUpdate.length} package(s) to version ${ver}`,
      } satisfies ResUpdateDeps);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await sendProgress(ctx, "error", `\n❌ Error updating dependencies: ${errorMessage}`);
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
