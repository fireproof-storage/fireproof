/* eslint-disable no-console */
import { array, command, flag, multioption, option, string } from "cmd-ts";
import fs from "fs-extra";
import path from "node:path";
import { findUp } from "find-up";
import { cd, $ } from "zx";
import { SuperThis } from "@fireproof/core-types-base";

function getEnvVersion(version = "refs/tags/v0.0.0-smoke") {
  if (process.env.GITHUB_REF && process.env.GITHUB_REF.startsWith("refs/tags/v")) {
    version = process.env.GITHUB_REF;
  }
  return version.split("/").slice(-1)[0].replace(/^v/, "");
}

async function getVersion(fpVersion: string) {
  if (!process.env.GITHUB_REF) {
    let top = await findUp("tsconfig.dist.json");
    if (!top) {
      top = process.cwd();
    }
    const fpVersionFile = path.join(path.dirname(top), fpVersion);
    if (fs.existsSync(fpVersionFile)) {
      return (await fs.readFile(fpVersionFile, "utf-8")).trim();
    }
    const gitHead = (await $`git rev-parse --short HEAD`).stdout.trim();
    const dateTick = (await $`date +%s`).stdout.trim();
    return getEnvVersion(`refs/tags/v0.0.0-smoke-${gitHead}-${dateTick}`);
  }
  return getEnvVersion(`refs/tags/dummy`);
}

function patchDeps(dep: Record<string, string>, version: string) {
  if (typeof dep !== "object" || !dep) {
    return;
  }
  for (const i of Object.keys(dep)) {
    const val = dep[i];
    if (val.startsWith("workspace:")) {
      dep[i] = version;
    }
  }
  return dep;
}

async function patchPackageJson(packageJsonPath: string, version: string) {
  const packageJson = await fs.readJSON(packageJsonPath);
  packageJson.version = version;
  delete packageJson.scripts["pack"];
  delete packageJson.scripts["publish"];
  packageJson.dependencies = patchDeps(packageJson.dependencies, version);
  packageJson.devDependencies = patchDeps(packageJson.devDependencies, version);
  await fs.writeJSONSync(packageJsonPath, packageJson, { spaces: 2 });
}

async function updateTsconfig(srcTsConfig: string, dstTsConfig: string) {
  const tsconfig = await fs.readJSONSync(srcTsConfig);
  tsconfig.extends = [await findUp("tsconfig.dist.json")];
  tsconfig.compilerOptions = {
    noEmit: false,
    outDir: "./",
  };
  tsconfig.include = tsconfig.include || [];
  tsconfig.include.push("**/*");
  tsconfig.exclude = tsconfig.exclude || [];
  tsconfig.exclude.push("node_modules", "dist", ".git", ".vscode");

  await fs.writeJSONSync(dstTsConfig, tsconfig, { spaces: 2 });
  // {
  // "extends": "../../tsconfig.json",
  // "compilerOptions": {
  //   "outDir": "./dist"
  // }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function buildCmd(sthis: SuperThis) {
  const cmd = command({
    name: "fireproof build cli",
    description: "helps to build fp",
    version: "1.0.0",
    args: {
      prepareVersion: flag({
        long: "prepare-version",
        short: "p",
        description: "Prepare the version for the build, defaults to the current git tag or a generated version.",
      }),
      fpVersion: option({
        long: "fp-version",
        short: "f",
        defaultValue: () => "./fp-version.txt",
        defaultValueIsSerializable: true,
        type: string,
        description: "Path to the file containing the version, defaults to './fp-version.txt'.",
      }),
      version: option({
        long: "version",
        short: "v",
        defaultValue: () => "",
        type: string,
        description: "The version of the build, defaults to the current git tag or a generated version.",
      }),
      srcDir: option({
        long: "srcDir",
        short: "s",
        type: string,
        defaultValue: () => "./",
        defaultValueIsSerializable: true,
      }),
      dstDir: option({
        long: "dstDir",
        short: "d",
        defaultValue: () => "./dist",
        defaultValueIsSerializable: true,
        type: string,
      }),
      excludedNames: multioption({
        long: "excludedNames",
        short: "e",
        type: array(string),
        defaultValue: () => ["node_modules/", "dist/", ".git/", ".vscode/", "__screenshots__/"],
        defaultValueIsSerializable: true,
      }),
      noCleanDst: flag({
        long: "noCleanDst",
        short: "c",
      }),
      noTsconfig: flag({
        long: "noTsconfig",
        short: "t",
        description: "Do not update tsconfig.json in the destination directory.",
      }),
      noBuild: flag({
        long: "noBuild",
        short: "b",
        description: "Do not run the build command after copying files.",
      }),
      doPack: flag({
        long: "doPack",
        short: "P",
        description: "Create a package for distribution.",
      }),
      packDestDir: option({
        long: "packDestDir",
        short: "o",
        type: string,
        defaultValue: () => "",
      }),
      npmrc: option({
        long: "npmrc",
        short: "n",
        type: string,
        defaultValue: () => "",
        description: "Path to the npmrc file to use for packing, defaults to './dist/npmrc-smoke'.",
      }),
      registry: option({
        long: "registry",
        short: "r",
        type: string,
        defaultValue: () => "",
        description: "The npm registry to use for publishing, defaults to 'https://registry.npmjs.org/'.",
      }),
      pubTags: multioption({
        long: "pubTags",
        short: "t",
        type: array(string),
        defaultValue: () => [],
        defaultValueIsSerializable: true,
        description: "Tags to use for publishing the package, defaults to ['latest'].",
      }),
    },
    handler: async (args) => {
      const top = await findUp("tsconfig.dist.json");
      if (!top) {
        throw new Error("Could not find tsconfig.dist.json in the project root.");
      }
      if (args.fpVersion) {
        args.fpVersion = path.join(args.dstDir, args.fpVersion);
      }
      if (!args.version) {
        args.version = await getVersion(args.fpVersion);
      }
      if (args.prepareVersion) {
        await fs.mkdirp(args.dstDir);
        const fpVersionFile = path.join(args.dstDir, "fp-version.txt");
        args.version = await getVersion(args.fpVersion);
        await fs.writeFile(fpVersionFile, args.version);
        console.log(`Using version: ${args.version}`);
        return;
      }
      if (args.srcDir === args.dstDir) {
        throw new Error("Source and destination directories cannot be the same.");
      }

      // args.srcDir = path.resolve(args.srcDir);

      const tmpDest = await fs.mkdtemp("../fp-dist-");
      await fs.copy(args.srcDir, tmpDest, {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        filter: (src: string, dst: string) => {
          if (src.startsWith(args.dstDir)) {
            return false; // Skip copying if the source is within the destination directory
          }
          // const basename = path.basename(src);

          // Exclude by full name (for directories or specific files)
          if (args.excludedNames.find((name) => src.includes(name))) {
            return false;
          }
          // Include everything else
          return true;
        },
      });
      if (!args.noCleanDst) {
        await fs.rm(args.dstDir, { recursive: true, force: true });
        await fs.move(tmpDest, args.dstDir);
      }
      if (!args.noTsconfig) {
        await updateTsconfig(path.join(args.srcDir, "tsconfig.json"), path.join(args.dstDir, "tsconfig.json"));
      }
      $.verbose = true;
      cd(args.dstDir);

      await patchPackageJson("package.json", args.version);
      // await $`pnpm version ${args.version}`;

      if (!args.noBuild) {
        await $`pnpm run build`;
      }
      if (args.doPack) {
        if (!args.packDestDir) {
          args.packDestDir = path.join(path.dirname(top), "dist");
          await fs.mkdirp(args.packDestDir);
        }
        if (args.packDestDir) {
          await fs.copyFile(path.join(path.dirname(args.packDestDir), ".gitignore"), ".gitignore");
          await fs.copyFile(path.join(path.dirname(args.packDestDir), ".npmignore"), ".npmignore");
          await $`pnpm pack --out "${args.packDestDir}/%s.tgz"`;
        }
      } else {
        if (!args.registry) {
          args.registry = "https://registry.npmjs.org/";
        }
        if (!args.npmrc) {
          args.npmrc = path.join(path.join(path.dirname(top), "dist"), "npmrc-smoke");
        }
        if (fs.existsSync(args.npmrc)) {
          console.log(`Using npmrc: ${args.npmrc}, destination: ${args.dstDir}`);
          await fs.copyFile(args.npmrc, ".npmrc");
        }
        const registry = ["--registry", args.registry];
        const tagsOpts = args.pubTags.map((tag) => `--tag ${tag}`).join(" ");
        await $`${["pnpm", "publish", "--access", "public", ...registry, "--no-git-checks", ...tagsOpts]}`;
        // pnpm publish --access public --no-git-checks ${tagsOpts}
      }
    },
  });
  return cmd;
}
