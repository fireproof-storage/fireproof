/* eslint-disable no-console */
import * as fs from "fs/promises";
import * as path from "path";

// import { glob } from "glob";
import { $, glob } from "zx";
import { command, flag, run, boolean, string, option, restPositionals } from "cmd-ts";

interface CommandArgs {
  readonly verbose: boolean;
  readonly prepare: boolean;
  readonly buildBase: string;
  readonly buildPackageJson: string;
  readonly srcPackageJson: string;
  readonly packagesStr: string[];
}

async function prepare(packages: PackageOptions[], { buildBase }: CommandArgs) {
  await $`rm -rf ${buildBase}`;
  await $`mkdir -p ${buildBase}/patched`;
  await $`cp package.json ${buildBase}/package.json`;

  await Promise.all(
    packages
      .filter((p): p is GitOptions => p.type === "git")
      .map(async ({ name, url, npm }) => {
        await fs.mkdir(`${buildBase}/patched/${name}`, { recursive: true });
        await $`git clone ${url} ${buildBase}/patched/${name}`;
        await $`cd ${buildBase}/patched/${name} && ${npm} install && ${npm} run build && ${npm} pack`;
        await $`cd ${buildBase} && pnpm install -f patched/${name}/*.tgz`;
      }),
  );
  for (const { name: pkg } of packages as NamedOptions[]) {
    await $`cd ${buildBase} && pnpm install ${pkg}`;
    await $`cd ${buildBase} && rm -rf src/${pkg}`;
    await $`cd ${buildBase} && mkdir -p src/${pkg}`;
    await $`cd ${buildBase} && rsync -vaxH node_modules/${pkg}/ src/${pkg}/`;
  }
  const files = (
    await Promise.all(
      packages
        .map(({ name }) => name)
        .map((p) => `${buildBase}/src/${p}/**/*.[jt]s`)
        .map((f) => glob(f)),
    )
  )
    .flat()
    .filter((f) => !f.endsWith(".d.ts"));
  await $`jscodeshift --parser=ts -t=./to-esm-transform.ts ${files}`;
}

function patchVersion(packageJson: Record<string, unknown>) {
  let version = "refs/tags/v0.0.0-smoke";
  if (process.env.GITHUB_REF?.startsWith("refs/tags/v")) {
    version = process.env.GITHUB_REF;
  }
  version = version.split("/").slice(-1)[0].replace(/^v/, "");
  console.log(`Patch version ${version} in package.json`);
  packageJson.version = version;
}

type Exports = Record<string, string | Record<string, string | Record<string, string>>>;
interface PackageJson {
  name: string;
  dependencies: Record<string, string>;
  exports: Exports;
}

function pluginExports(name: string, exports: Exports, srcDir: string, buildBase: string): Exports {
  const result: Exports = {};
  // const base = path.relative(buildBase, srcDir)
  const nested: Record<string, string | Record<string, string>> = {};
  result[`./${name}`] = nested;
  console.log(">>>>>=", name, srcDir);
  // !exports && console.log(">>>>>=", name, srcDir)
  for (const [key, value] of Object.entries(exports)) {
    // const pluggedKey = `./${path.join(name, key)}`;

    if (typeof value === "string") {
      nested[key] = `./${path.join(path.relative(buildBase, srcDir), value)}`;
    } else {
      nested[key] = Object.entries(value).reduce<Record<string, string>>((acc, [k, v]) => {
        acc[k] = `./${path.join(path.relative(buildBase, srcDir), v as string)}`;
        return acc;
      }, {});
    }
  }
  return result;
}

function mergePackageJson(dest: PackageJson, src: PackageJson, srcDir: string, { buildBase }: CommandArgs) {
  dest.dependencies = { ...dest.dependencies, ...src.dependencies };
  dest.exports = {
    ...dest.exports,
    ...pluginExports(src.name, src.exports, srcDir, buildBase),
  };
}

interface PackageOptions {
  readonly type: "npm" | "git";
  readonly name: string;
}

interface NamedOptions extends PackageOptions {
  readonly type: "npm";
  readonly name: string;
}

interface GitOptions extends PackageOptions {
  readonly type: "git";
  readonly url: string;
  readonly npm: string;
}

function toPackageOptions(packages: string): NamedOptions | GitOptions {
  const [name, url, npm] = packages.split(",");
  if (url) {
    return { type: "git", name, url, npm: npm || "pnpm" };
  }
  return { type: "npm", name };
}

async function main() {
  const cmd = command({
    name: "merge-package",
    description: "merge a package.json to build a vendore package.json",
    version: "1.0.0",
    args: {
      verbose: flag({
        long: "verbose",
        type: boolean,
      }),
      prepare: flag({
        long: "prepare",
        type: boolean,
      }),
      buildBase: option({
        long: "build-base",
        type: string,
        description: "build base directory",
        defaultValue: () => "./dist",
        defaultValueIsSerializable: true,
      }),
      buildPackageJson: option({
        long: "dest-package-json",
        type: string,
        description: "build destination",
        defaultValue: () => "./dist/package.json",
        defaultValueIsSerializable: true,
      }),
      srcPackageJson: option({
        long: "src-package-json",
        type: string,
        description: "source package.json",
        defaultValue: () => "./package.json",
        defaultValueIsSerializable: true,
      }),
      packagesStr: restPositionals({
        description:
          "packages to merge, without anything it's pulled from npm, if package,url,npm its pulled from git and installed with npm",
      }),
    },
    handler: async (args) => {
      $.verbose = args.verbose;
      const packages = args.packagesStr.map(toPackageOptions);
      if (args.prepare) {
        await prepare(packages, args);
      }
      await fs.mkdir(path.dirname(args.buildPackageJson), { recursive: true });
      const packageJson = JSON.parse(await fs.readFile(args.srcPackageJson, "utf8")) as PackageJson;
      patchVersion(packageJson as unknown as Record<string, unknown>);
      // await $`pwd ; find "dist/src/@ipld/dag-json" -type f -print`
      for (const packageFile of packages.map((p) => `dist/src/${p.name}/package.json`)) {
        const mPackageJson = JSON.parse(await fs.readFile(packageFile, "utf8")) as PackageJson;
        await fs.unlink(packageFile);
        mergePackageJson(packageJson, mPackageJson, path.dirname(packageFile), args);
      }
      // filter our own packages
      packageJson.dependencies = Object.entries(packageJson.dependencies).reduce<Record<string, string>>((acc, [k]) => {
        if (!packages.find((p) => p.name === k)) {
          acc[k] = packageJson.dependencies[k];
        }
        return acc;
      }, {});
      await fs.writeFile(args.buildPackageJson, JSON.stringify(packageJson, null, 2));
      const projectRoot = path.resolve(path.dirname(args.srcPackageJson));
      const gitignoreSrc = path.resolve(projectRoot, ".gitignore");
      await $`cp ${gitignoreSrc} ${path.join(args.buildBase, ".npmignore")}`;
      // await $`cp ../.gitignore ${args.buildBase}/.npmignore`;
      await $`cd ${args.buildBase} && pnpm pack`;
    },
  });
  await run(cmd, process.argv.slice(2));
}

main().catch((a: unknown) => {
  console.error(a);
  process.exit(1);
});
