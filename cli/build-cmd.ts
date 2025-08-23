/* eslint-disable no-console */
import { array, command, flag, multioption, option, string } from "cmd-ts";
import fs from "fs-extra";
import path from "node:path";
import { findUp } from "find-up";
import { cd, $ } from "zx";
import { SuperThis } from "@fireproof/core-types-base";
import { SemVer } from "semver";

const reVersionAlphaStart = /^[a-z](\d+\.\d+\.\d+.*)$/;
// const reVersionOptionalAlphaStart = /^[a-z]?(\d+\.\d+\.\d+.*)$/;
const reScopedVersion = /^[^@]+@(.*)$/;
const reEndVersion = /.*\/([^/]+)$/;

function getEnvVersion(version = "refs/tags/v0.0.0-smoke", xenv = process.env) {
  let wversion = version;
  if (xenv.GITHUB_REF) {
    wversion = xenv.GITHUB_REF;
  }
  if (reEndVersion.test(wversion)) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    wversion = wversion.match(reEndVersion)![1];
  }
  const calculatedVersion = wversion.replace(reScopedVersion, "$1").replace(reVersionAlphaStart, "$1");
  try {
    new SemVer(calculatedVersion);
    return calculatedVersion;
  } catch (e) {
    return getEnvVersion(version, {});
  }
}

interface Mock {
  xfs: {
    existsSync: (path: string) => boolean;
    readFile: (path: string, encoding: string) => Promise<string>;
  };
  xenv: Record<string, string>;
}

export async function getVersion(
  fpVersionFname?: string,
  { xfs, xenv }: Partial<Mock> = {
    xfs: {
      existsSync: fs.existsSync,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      readFile: fs.readFile as any,
    },
    xenv: process.env as Record<string, string>,
  },
) {
  let top = await findUp("tsconfig.dist.json");
  if (!top) {
    top = process.cwd();
  }
  if (fpVersionFname && xfs) {
    const fpVersionFile = path.join(path.dirname(top), fpVersionFname);
    if (xfs.existsSync(fpVersionFile)) {
      return getEnvVersion((await xfs.readFile(fpVersionFile, "utf-8")).trim(), {});
    }
  }
  const gitHead = (await $`git rev-parse --short HEAD`).stdout.trim();
  const dateTick = (await $`date +%s`).stdout.trim();
  return getEnvVersion(`refs/tags/v0.0.0-smoke-${gitHead}-${dateTick}`, xenv);
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

interface PackageJson {
  name: string;
  private?: "true";
  license: string;
  version: string;
  scripts: Record<string, string>;
  exports: Record<string, string | Record<string, string>>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

async function patchPackageJson(
  packageJsonPath: string,
  version: string,
  changeScope?: string,
): Promise<{
  patchedPackageJson: PackageJson;
  originalPackageJson: PackageJson;
}> {
  const originalPackageJson = await fs.readJSON(packageJsonPath);
  const patchedPackageJson = await fs.readJSON(packageJsonPath);
  // ugly double read but this is easier than deep copying
  if (changeScope) {
    changeScope = changeScope.replace(/^@/, "");
    if (originalPackageJson.name.startsWith(`@`)) {
      patchedPackageJson.name = patchedPackageJson.name.replace(/^@[^/]+\//, `@${changeScope}/`);
    } else {
      patchedPackageJson.name = `@${changeScope}/${patchedPackageJson.name}`;
    }
  }
  // patchedPackageJson.name = changeScope ? : patchedPackageJson.name;
  patchedPackageJson.version = version;
  delete patchedPackageJson.scripts["pack"];
  delete patchedPackageJson.scripts["publish"];
  patchedPackageJson.dependencies = patchDeps(patchedPackageJson.dependencies, version);
  patchedPackageJson.devDependencies = patchDeps(patchedPackageJson.devDependencies, version);
  await fs.writeJSONSync(packageJsonPath, patchedPackageJson, { spaces: 2 });
  return { patchedPackageJson, originalPackageJson };
}

async function updateTsconfig(srcTsConfig: string, dstTsConfig: string) {
  const tsconfig = await fs.readJSONSync(srcTsConfig);
  tsconfig.extends = [await findUp("tsconfig.dist.json")];
  tsconfig.compilerOptions = {
    ...tsconfig.compilerOptions,
    noEmit: false,
    outDir: "../npm/",
  };
  tsconfig.include = tsconfig.include || [];
  tsconfig.include.push("**/*");
  tsconfig.exclude = tsconfig.exclude || [];
  tsconfig.exclude.push("node_modules", "dist", ".git", ".vscode");

  console.log("tsconfig", tsconfig);
  await fs.writeJSONSync(dstTsConfig, tsconfig, { spaces: 2 });
  // {
  // "extends": "../../tsconfig.json",
  // "compilerOptions": {
  //   "outDir": "./dist"
  // }
}
function toDenoExports(exports: Record<string, string | Record<string, string>>) {
  return Object.entries(exports ?? {}).reduce(
    (acc, [k, v]) => {
      if (typeof v === "string") {
        acc[k] = v.replace(/\.(js|mjs|cjs)$/, ".ts").replace(/\.(jsx|mjsx|cjsx)$/, ".tsx");
      } else {
        const x = Object.entries(v).reduce((acc, [_, v]) => {
          if (acc === "") {
            if (v.match(/\.(js|mjs|cjs|)$/)) {
              return v.replace(/\.(js|mjs|cjs)$/, ".ts");
            }
          }
          return acc;
        }, "");
        if (x !== "") {
          acc[k] = x;
        }
      }
      return acc;
    },
    { ".": "./index.ts" } as Record<string, string>,
  );
}

function toDenoDeps(deps: Record<string, string>, version: string) {
  return Object.entries(deps).reduce(
    (acc, [k, v]) => {
      if (v.startsWith("workspace:")) {
        acc[k] = `jsr:${k}@${version}`;
        return acc;
      }
      if (k.startsWith("@adviser/cement")) {
        acc[k] = `jsr:${k}@${v.replace("npm:", "")}`;
        return acc;
      }
      acc[k] = `npm:${k}@${v.replace("npm:", "")}`;
      return acc;
    },
    {} as Record<string, string>,
  );
}

async function buildJsrConf(pj: { originalPackageJson: PackageJson; patchedPackageJson: PackageJson }, version: string) {
  if (pj.originalPackageJson.private?.toLowerCase() === "true") {
    return;
  }
  const jsrConf = {
    name: pj.patchedPackageJson.name,
    version: pj.patchedPackageJson.version,
    license: pj.patchedPackageJson.license,
    nodeModulesDir: "auto",
    unstable: ["sloppy-imports"],
    lint: {
      rules: {
        tags: ["recommended"],
        exclude: ["no-sloppy-imports"],
      },
    },
    exports: toDenoExports(pj.originalPackageJson.exports),
    imports: toDenoDeps(pj.originalPackageJson.dependencies, version),
    publish: {
      include: ["**/*.ts", "**/*.tsx", "README.md", "LICENSE"],
    },
  };
  await fs.writeJSON("jsr.json", jsrConf, { spaces: 2 });
  return jsrConf;
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
      licenseFile: option({
        long: "licenseFile",
        short: "l",
        type: string,
        defaultValue: () => "LICENSE.md",
        description: "Path to the license file to use for packing, defaults to './LICENSE'.",
      }),
      readmeFile: option({
        long: "readmeFile",
        short: "m",
        type: string,
        defaultValue: () => "README.md",
        description: "Path to the readme file to use for packing, defaults to './README.md'.",
      }),
      registry: option({
        long: "registry",
        short: "r",
        type: string,
        defaultValue: () => "",
        description: "The npm registry to use for publishing, defaults to 'https://registry.npmjs.org/'.",
      }),
      publishJsr: flag({
        long: "publishJsr",
        short: "j",
        defaultValue: () => false,
        description: "Do not publish the jsr package.",
      }),
      changeScope: option({
        long: "changeScope",
        short: "s",
        type: string,
        defaultValue: () => "",
        description: "Change the scope of the package.",
      }),
      versionPrefix: option({
        long: "versionPrefix",
        short: "x",
        type: string,
        defaultValue: () => "",
        description: "Prefix to use for the version.",
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
      const licenseFile = await findUp(args.licenseFile);
      if (licenseFile) {
        await fs.copyFile(licenseFile, path.join(tmpDest, path.basename(args.licenseFile)));
      }
      const readmeFile = await findUp(args.readmeFile);
      if (readmeFile) {
        await fs.copyFile(readmeFile, path.join(tmpDest, path.basename(args.readmeFile)));
      }

      await fs.copy(args.srcDir, tmpDest, {
        filter: (src: string, _dst: string) => {
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
      const jsrDstDir = path.join(args.dstDir, "jsr");
      const npmDstDir = path.join(args.dstDir, "npm");
      if (!args.noCleanDst) {
        await fs.rm(args.dstDir, { recursive: true, force: true });
      }
      //await fs.mkdirp(jsrDstDir);
      await fs.mkdirp(npmDstDir);
      await fs.move(tmpDest, jsrDstDir);

      if (!args.noTsconfig) {
        await updateTsconfig(path.join(args.srcDir, "tsconfig.json"), path.join(jsrDstDir, "tsconfig.json"));
      }
      $.verbose = true;
      cd(jsrDstDir);

      const packageJson = await patchPackageJson("package.json", args.version, args.changeScope);
      // await $`pnpm version ${args.version}`;

      fs.copy(".", "../npm", {
        filter: (src: string, _dst: string) => {
          if (src.endsWith(".ts") || src.endsWith(".tsx")) {
            return false;
          }
          return true;
        },
      });
      if (!args.noBuild) {
        await $`pnpm run build`;
      }
      for (const f of ["package.json", "README.md", "LICENSE.md"]) {
        await fs.copyFile(f, path.join("../npm", f));
      }

      if (args.publishJsr) {
        const jsrConf = await buildJsrConf(packageJson, args.version);
        if (jsrConf) {
          await $`pnpm exec deno publish --allow-dirty ${args.doPack ? "--dry-run" : ""}`;
        }
      }

      //await fs.copy(jsrDstDir, npmDstDir);
      cd("../npm");
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
          // await $`cat .npmrc`;
          // await $`env | grep -e npm_config -e NPM_CONFIG -e PNPM_CONFIG`;
        }
        const tags = args.pubTags;
        try {
          const semVer = new SemVer(args.version);
          if (semVer.prerelease.find((i) => typeof i === "string" && i.includes("dev"))) {
            tags.push("dev");
          }
        } catch (e) {
          console.warn(`Warn parsing version ${args.version}:`, e);
        }

        const registry = ["--registry", args.registry];
        const tagsOpts = tags.map((tag) => ["--tag", tag]).flat();
        await $`${["pnpm", "publish", "--access", "public", ...registry, "--no-git-checks", ...tagsOpts]}`;
        // pnpm publish --access public --no-git-checks ${tagsOpts}
      }
    },
  });
  return cmd;
}
