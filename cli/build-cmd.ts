/* eslint-disable no-console */
import { array, command, flag, multioption, option, string } from "cmd-ts";
import fs from "fs-extra";
import path from "node:path";
import { findUp } from "find-up";
import { cd, $ } from "zx";
import { SuperThis } from "@fireproof/core-types-base";
import { SemVer } from "semver";
import { exception2Result } from "@adviser/cement";
import { VersionPinner } from "./version-pinner.js";

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
  const gitHeadRes = await $`git rev-parse --short HEAD`.nothrow();
  if (gitHeadRes.exitCode !== 0) {
    process.exit(gitHeadRes.exitCode);
  }
  const gitHead = gitHeadRes.stdout.trim();
  const dateTickRes = await $`date +%s`.nothrow();
  if (dateTickRes.exitCode !== 0) {
    process.exit(dateTickRes.exitCode);
  }
  const dateTick = dateTickRes.stdout.trim();
  return getEnvVersion(`refs/tags/v0.0.0-smoke-${gitHead}-${dateTick}`, xenv);
}

export class Version {
  #version: string;
  #versionPrefix: string;

  constructor(version: string, versionPrefix: string) {
    this.#version = version;
    this.#versionPrefix = versionPrefix;
  }

  get version(): string {
    return this.#version;
  }

  get versionPrefix(): string {
    return this.#versionPrefix;
  }

  get prefixedVersion(): string {
    if (!this.#versionPrefix) {
      return this.#version;
    }
    return `${this.#versionPrefix}${this.#version}`;
  }
}

export interface PackageJson {
  name: string;
  private?: "true" | string | boolean;
  license: string;
  version: string;
  scripts: Record<string, string>;
  exports: Record<string, string | Record<string, string>>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export async function patchPackageJson(
  packageJsonPath: string,
  version: Version,
  changeScope?: string,
  mock: {
    readJSON: typeof fs.readJson;
  } = { readJSON: fs.readJson },
): Promise<{
  patchedPackageJson: PackageJson;
  originalPackageJson: PackageJson;
}> {
  const originalPackageJson = await mock.readJSON(packageJsonPath);
  const patchedPackageJson = await mock.readJSON(packageJsonPath);
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
  patchedPackageJson.version = version.version;
  delete patchedPackageJson.scripts["pack"];
  delete patchedPackageJson.scripts["publish"];

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

  // console.log("tsconfig", tsconfig);
  await fs.writeJSONSync(dstTsConfig, tsconfig, { spaces: 2 });
  // {
  // "extends": "../../tsconfig.json",
  // "compilerOptions": {
  //   "outDir": "./dist"
  // }
}

export function sanitizeNpmrc(srcNpmRc: string) {
  // enable-pre-post-scripts=true
  // registry=http://localhost:4873
  // @fireproof:registry=http://localhost:4873
  // //localhost:4873:_authToken="Zjk5MjVhZTg4ZTlkNzQ3MWJkMzllMWM0MzVlNjlmMGQ6NGQ5YzIxMDhkMmZjODc2MDQwYTBiZjc4MjM0OGI0N2Y5ZDBhN2UwNGFm"
  return srcNpmRc
    .split("\n")
    .map((line) => line.trim())
    .map((line) => {
      const [lhsUnsplitted, rhs] = line.split(/=(.*)$/);
      let lhs = lhsUnsplitted.trim();
      let lhsArg = "";
      if (/:[^0-9]+[^:]*$/.test(lhs)) {
        const olhs = lhs;
        lhs = lhs.replace(/:[^0-9]+[^:]*$/, "");
        lhsArg = olhs.slice(lhs.length);
        if (lhs.startsWith("//")) {
          lhs = "http:" + lhs;
        }
      }
      // eslint-disable-next-line no-restricted-globals
      const rLhsAsURI = exception2Result(() => new URL(lhs));
      if (rLhsAsURI.isOk()) {
        const url = rLhsAsURI.Ok();
        const urlStr = url.toString();
        const rLhs = urlStr.replace(/^[^:]+:/, "").replace(/\/*$/, "/");
        return `${rLhs}${lhsArg}=${rhs}`;
      } else {
        lhs = lhs + lhsArg;
      }
      // eslint-disable-next-line no-restricted-globals
      const rRhsAsURI = exception2Result(() => new URL(rhs));
      if (rRhsAsURI.isOk()) {
        const url = rRhsAsURI.Ok();
        const rRhs = url.toString().replace(/\/*$/, "/");
        return `${lhs}=${rRhs}`;
      } else {
        return line;
      }
    })
    .join("\n");
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
interface JsrConfig {
  name: string;
  version: string;
  license: string;
  nodeModulesDir: string;
  unstable: string[];
  lint: {
    rules: {
      tags: string[];
      exclude: string[];
    };
  };
  exports: Record<string, string>;
  imports: Record<string, string>;
  publish: {
    include: string[];
  };
}

function isPrivate(p: PackageJson) {
  return (
    p.private &&
    ((typeof p.private === "boolean" && p.private) || (typeof p.private === "string" && p.private.toLocaleLowerCase() === "true"))
  );
}

export async function buildJsrConf(
  pj: { originalPackageJson: PackageJson; patchedPackageJson: PackageJson },
  version: string,
): Promise<Partial<JsrConfig>> {
  if (isPrivate(pj.originalPackageJson)) {
    return {};
  }
  const jsrConf: JsrConfig = {
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
      noPinned: flag({
        long: "no-pinned",
        description: "Do not pin dependencies in package.json (pinning is enabled by default).",
      }),
      lockfile: option({
        long: "lockfile",
        short: "L",
        type: string,
        defaultValue: () => "",
        description: "Path to the pnpm-lock.yaml file to use for pinning versions, defaults to auto-discovery.",
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
      npm: option({
        long: "npm",
        type: string,
        defaultValue: () => "pnpm",
        defaultValueIsSerializable: true,
        description: "Package manager to use (pnpm, npm, yarn, bun), defaults to 'pnpm'.",
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

      const version = new Version(args.version, args.versionPrefix);

      if (args.prepareVersion) {
        await fs.mkdirp(args.dstDir);
        const fpVersionFile = path.join(args.dstDir, "fp-version.txt");
        const rawVersion = await getVersion(args.fpVersion);
        const vx = new Version(rawVersion, args.versionPrefix);
        await fs.writeFile(fpVersionFile, vx.version);
        console.log(`Using version: ${vx.version}`);
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

      let packageJson = await patchPackageJson("package.json", version, args.changeScope);
      if (!args.noPinned) {
        console.log(
          "Prepared package.json with pinning for",
          packageJson.patchedPackageJson.name,
          "version",
          packageJson.patchedPackageJson.version,
        );
        const lockfilePath = args.lockfile || path.join(path.dirname(top), "pnpm-lock.yaml");
        const pinner = await VersionPinner.create({ lockfilePath });
        packageJson = {
          ...packageJson,
          patchedPackageJson: pinner.pinVersions(packageJson.patchedPackageJson, {
            workspaceVersion: version.prefixedVersion,
          }),
        };
      }
      await fs.writeJSON("package.json", packageJson.patchedPackageJson, { spaces: 2 });
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
        const res = await $`${args.npm} run build`.nothrow();
        if (res.exitCode !== 0) {
          process.exit(res.exitCode);
        }
      }
      for (const f of ["package.json", "README.md", "LICENSE.md"]) {
        await fs.copyFile(f, path.join("../npm", f));
      }

      if (args.publishJsr) {
        const jsrConf = await buildJsrConf(packageJson, version.prefixedVersion);
        await fs.writeJSON("jsr.json", jsrConf, { spaces: 2 });
        if (!isPrivate(packageJson.originalPackageJson)) {
          const res = await $`${args.npm} exec deno publish --allow-dirty ${args.doPack ? "--dry-run" : ""}`.nothrow();
          if (res.exitCode !== 0) {
            console.log(`Failed to pack the package.`);
            process.exit(res.exitCode);
          }
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
          const res = await $`${args.npm} pack --out "${args.packDestDir}/%s.tgz"`.nothrow();
          if (res.exitCode !== 0) {
            console.error(`Failed to pack the package.`);
            process.exit(res.exitCode);
          }
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
          const niceNpmrc = sanitizeNpmrc(await fs.readFile(args.npmrc, "utf-8"));
          await fs.writeFile(".npmrc", niceNpmrc);
          // await fs.copyFile(args.npmrc, ".npmrc");
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
        $.verbose = true;
        const res = await $`${[args.npm, "publish", "--access", "public", ...registry, "--no-git-checks", ...tagsOpts]}`.nothrow();
        if (res.exitCode !== 0) {
          console.error(`Failed to publish the package.`, JSON.stringify(process.env, null, 2));
          process.exit(res.exitCode);
        }
      }
    },
  });
  return cmd;
}
