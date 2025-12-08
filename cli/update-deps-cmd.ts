/* eslint-disable no-console */
import { command, flag, multioption, option, string, array } from "cmd-ts";
import { $, glob } from "zx";
import { readFile } from "fs/promises";
import { SuperThis } from "@fireproof/core-types-base";

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
  const content = await readFile(packageJsonPath, "utf-8");
  const pkg: PackageJson = JSON.parse(content);

  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  const matchingPackages = new Set<string>();
  const regexes = patterns.map((p) => new RegExp(p));

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function updateDepsCmd(sthis: SuperThis) {
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
    handler: async ({ ver, pkg: patterns, currentDir, dryRun }) => {
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
          return;
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
          return;
        }

        // Update each package using pnpm update with -r flag for recursive workspace update
        for (const pkg of packagesToUpdate) {
          console.log(`\n📦 Updating ${pkg} to ${ver}...`);
          try {
            await $`cd ${currentDir} && pnpm update -r ${pkg}@${ver}`;
            console.log(`   ✅ Updated ${pkg}`);
          } catch (error) {
            console.log(`   ⚠️  Failed to update ${pkg} (it may not be installed everywhere)`);
          }
        }

        console.log("\n✨ Update complete!\n");
        console.log("📋 Next steps:");
        console.log("  1. Review changes: git diff");
        console.log("  2. Run checks: pnpm check");
        console.log("  3. Run tests: pnpm test:all");
      } catch (error) {
        console.error("\n❌ Error updating dependencies:", error);
        process.exit(1);
      }
    },
  });
  return cmd;
}
