/* eslint-disable no-console */
import fs from "fs/promises";
import process from "process";
import path from "path";
import { $ } from "zx";

async function copyFilesToDist(destDir: string) {
  for (const file of ["./.gitignore", "./README.md", "./LICENSE.md"]) {
    await fs.copyFile(file, path.join(destDir, file));
  }
}

async function patchVersion(packageJson: Record<string, unknown>) {
  let version = "refs/tags/v0.0.0-smoke";
  if (process.env.GITHUB_REF && process.env.GITHUB_REF.startsWith("refs/tags/v")) {
    version = process.env.GITHUB_REF;
  }
  version = version.split("/").slice(-1)[0].replace(/^v/, "");
  console.log(`Patch version ${version} in package.json`);
  packageJson.version = version;
}

async function createDenoJson(destDir: string, packageJson: Record<string, unknown>) {
  const denoJson = {
    imports: {
      "@fireproof/core": "./index.js",
    },
  };
  const pdeps = packageJson.dependencies as Record<string, string>;
  for (const dep of Object.keys(pdeps)) {
    denoJson.imports[dep] = `npm:${dep}@${pdeps[dep]}`;
  }
  const denoJsonFile = path.join(destDir, "deno.json");
  await fs.writeFile(denoJsonFile, JSON.stringify(denoJson, null, 2));
}

async function main() {
  $.verbose = true;
  const buildDest = process.argv[process.argv.length - 1];
  if (!(buildDest.startsWith("dist/") || buildDest.startsWith("./dist/"))) {
    console.error("Usage: tsx version-copy-package.ts dist/<path>/template-package.json");
    process.exit(1);
  }
  const destDir = path.dirname(buildDest);
  if (!(await fs.stat(destDir)).isDirectory) {
    console.error(`Directory ${destDir} does not exist`);
    process.exit(1);
  }
  await copyFilesToDist(destDir);
  const mainPackageJson = JSON.parse(await fs.readFile("package.json", "utf8"));
  const templateFile = path.basename(buildDest);
  const destPackageJson = JSON.parse(await fs.readFile(templateFile, "utf-8"));
  // copy version from package.json
  for (const destDeps of Object.keys(destPackageJson.dependencies)) {
    if (!mainPackageJson.dependencies[destDeps]) {
      console.error(`Dependency ${destDeps} not found in main package.json`);
    } else {
      destPackageJson.dependencies[destDeps] = mainPackageJson.dependencies[destDeps];
    }
  }
  patchVersion(destPackageJson);

  await createDenoJson(destDir, destPackageJson);

  const destPackageJsonFile = path.join(destDir, "package.json");
  await fs.writeFile(destPackageJsonFile, JSON.stringify(destPackageJson, null, 2));
  console.log(`Copied ${templateFile} to ${destDir} with version ${destPackageJson.version}`);
  await $`cd ${destDir} && pnpm pack`.pipe(process.stdout);
}

main().catch(console.error);
