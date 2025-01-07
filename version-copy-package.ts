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

function getVersion() {
  let version = "refs/tags/v0.0.0-smoke";
  if (process.env.GITHUB_REF?.startsWith("refs/tags/v")) {
    version = process.env.GITHUB_REF;
  }
  return version.split("/").slice(-1)[0].replace(/^v/, "");
}

function patchVersion(packageJson: PackageJson) {
  const version = getVersion();
  console.log(`Patch version ${version} in package.json`);
  packageJson.version = version;
}

async function createDenoJson(destDir: string, packageJson: PackageJson) {
  const denoJson = {
    imports: {
      "@fireproof/core": "./index.js",
    } as Record<string, string>,
  };
  const pdeps = packageJson.dependencies;
  for (const dep of Object.keys(pdeps)) {
    denoJson.imports[dep] = `npm:${dep}@${pdeps[dep]}`;
  }
  const denoJsonFile = path.join(destDir, "deno.json");
  await fs.writeFile(denoJsonFile, JSON.stringify(denoJson, null, 2));
}

function transferVersionsFromPackageJson(srcDeps: Record<string, string>, destDeps: Record<string, string>) {
  for (const dep of Object.keys(destDeps)) {
    if (!srcDeps[dep]) {
      console.error(`Dependency ${dep} not found in main package.json`);
    } else {
      destDeps[dep] = srcDeps[dep];
    }
  }
}

interface PackageJson {
  version: string;
  dependencies: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

async function main() {
  $.verbose = true;
  const buildDest = process.argv[process.argv.length - 1];
  if (!(buildDest.startsWith("dist/") || buildDest.startsWith("./dist/"))) {
    console.error("Usage: tsx version-copy-package.ts dist/<path>/template-package.json");
    process.exit(1);
  }
  const destDir = path.dirname(buildDest);
  const stat = await fs.stat(destDir);
  if (!stat.isDirectory()) {
    console.error(`Directory ${destDir} does not exist`);
    process.exit(1);
  }
  await copyFilesToDist(destDir);
  const mainPackageJson = JSON.parse(await fs.readFile("package.json", "utf8")) as PackageJson;
  const templateFile = path.basename(buildDest);
  const destPackageJson = JSON.parse(await fs.readFile(templateFile, "utf-8")) as PackageJson;
  // copy version from package.json
  const withCoreVersion = {
    "@fireproof/core": `^${getVersion()}`,
    ...mainPackageJson.dependencies,
  } as Record<string, string>;
  transferVersionsFromPackageJson(withCoreVersion, destPackageJson.dependencies);
  transferVersionsFromPackageJson(withCoreVersion, destPackageJson.peerDependencies ?? {});

  patchVersion(destPackageJson);

  await createDenoJson(destDir, destPackageJson);

  const destPackageJsonFile = path.join(destDir, "package.json");
  await fs.writeFile(destPackageJsonFile, JSON.stringify(destPackageJson, null, 2));
  console.log(`Copied ${templateFile} to ${destDir} with version ${destPackageJson.version}`);
  await $`cd ${destDir} && pnpm pack`.pipe(process.stdout);
}

main().catch(console.error);
