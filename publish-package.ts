import { $ } from "zx";
import { SemVer } from "semver";
import fs from "fs";
import path from "path";

async function main() {
  $.verbose = true;
  const packageJsonFile = process.argv[process.argv.length - 1];
  if (!fs.existsSync(packageJsonFile)) {
    console.error(`File ${packageJsonFile} does not exist`);
    process.exit(1);
  }
  const tags: string[] = [];
  let refVersion;
  if (process.env.GITHUB_REF && process.env.GITHUB_REF.startsWith("refs/tags/v")) {
    refVersion = process.env.GITHUB_REF;
  }
  if (!refVersion) {
    console.error(`No version found in GITHUB_REF(${process.env.GITHUB_REF}) we will not publish`);
    process.exit(1);
  }
  const version = refVersion.replace(/^.*\/v/, "");
  console.log(`Version: ${version} ${refVersion}`);
  const semVer = new SemVer(version);
  if (semVer.prerelease.find((i) => i.includes("dev"))) {
    tags.push("dev");
  }
  console.log(`Publishing package: ${packageJsonFile} version ${version} with tags ${tags.join(", ")}`);
  const tagsOpts = tags.map((i) => ["--tag", i]).flat();
  await $`cd ${path.dirname(packageJsonFile)} && pnpm publish --access public --no-git-checks ${tagsOpts}`.pipe(process.stdout);
}

main().catch(console.error);
