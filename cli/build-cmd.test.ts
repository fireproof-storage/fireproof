import { PackageJson, Version, buildJsrConf, getVersion, patchPackageJson } from "./build-cmd.js";
import { expect, it } from "vitest";

const mock = {
  readJSON: (): Promise<PackageJson> => {
    return Promise.resolve({
      name: "@fireproof/core-cli",
      version: "0.0.0",
      description: "Live ledger for the web.",
      type: "module",
      keywords: ["ledger", "JSON", "document", "IPLD", "CID", "IPFS"],
      contributors: ["J Chris Anderson", "Alan Shaw", "Travis Vachon", "Mikeal Rogers", "Meno Abels"],
      author: "J Chris Anderson",
      license: "AFL-2.0",
      scripts: {
        build: "core-cli tsc",
        pack: "core-cli build --doPack",
        publish: "core-cli build",
      },
      dependencies: {
        "@fireproof/vendor": "workspace:0.0.0",
        "cmd-ts": "^0.13.0",
      },
      devDependencies: {
        "@fireproof/core-cli": "workspace:0.0.0",
        vitest: "^3.2.4",
      },
      exports: {
        ".": "./index.js",
      },
    });
  },
};

it("getVersion emptyString", async () => {
  expect(await getVersion("", { xenv: {} })).toContain("0.0.0-smoke");
});

it("should only use prefix version in dependencies", async () => {
  const version = new Version("0.0.0-smoke", "^");
  const { patchedPackageJson } = await patchPackageJson("package.json", version, undefined, mock);
  expect(patchedPackageJson.version).toBe("0.0.0-smoke");
  expect(patchedPackageJson.dependencies).toHaveProperty("@fireproof/vendor", "^0.0.0-smoke");
});

it("should only use prefix version in dependencies", async () => {
  const version = new Version("0.0.0-smoke", "^");
  const { patchedPackageJson } = await patchPackageJson("package.json", version, undefined, mock);
  expect(patchedPackageJson.version).toBe("0.0.0-smoke");
  expect(patchedPackageJson.dependencies).toHaveProperty("@fireproof/vendor", "^0.0.0-smoke");
});

it("should only use prefix version in dependencies", async () => {
  const version = new Version("0.0.0-smoke", "^");
  const { patchedPackageJson } = await patchPackageJson("package.json", version, undefined, mock);
  const originalPackageJson = await mock.readJSON();
  const jsrConf = buildJsrConf({ originalPackageJson, patchedPackageJson }, version.prefixedVersion);
  expect(jsrConf.version).toBe("0.0.0-smoke");
  expect(jsrConf.imports).toHaveProperty("@fireproof/vendor", "jsr:@fireproof/vendor@^0.0.0-smoke");
});

it("ILLEGAL Version", async () => {
  expect(
    await getVersion(undefined, {
      xenv: { GITHUB_REF: "a/b/cdkdkdkdk" },
    }),
  ).toContain("0.0.0-smoke-");
});

it("ILLEGAL Version with gitref", async () => {
  expect(
    await getVersion("wo", {
      xenv: { GITHUB_REF: "a/b/cdkdkdkdk" },
      xfs: {
        existsSync: () => false,
        readFile: (_x: string, _y = "utf-8") => Promise.resolve(""),
      },
    }),
  ).toContain("0.0.0-smoke-");
});

it("GITHUB_REF set and file", async () => {
  expect(
    await getVersion("wurst", {
      xenv: { GITHUB_REF: "a/b/cdkdkdkdk" },
      xfs: {
        existsSync: () => true,
        readFile: (_x: string, _y = "utf-8") => Promise.resolve("v0.0.48-smoke"),
      },
    }),
  ).toBe("0.0.48-smoke");
});

it("GITHUB_REF set and not exist file", async () => {
  expect(
    await getVersion("wurst", {
      xenv: { GITHUB_REF: "a/b/c0.0.45-xx" },
      xfs: {
        existsSync: () => false,
        readFile: (_x: string, _y = "utf-8") => Promise.resolve("v0.0.48-smoke"),
      },
    }),
  ).toBe("0.0.45-xx");
});

it("getVersion file with v", async () => {
  expect(
    await getVersion("wurst", {
      xfs: {
        existsSync: () => true,
        readFile: (_x: string, _y = "utf-8") => Promise.resolve("v0.0.48-smoke"),
      },
      xenv: {},
    }),
  ).toContain("0.0.48-smoke");
});

it("getVersion file without ", async () => {
  expect(
    await getVersion("wurst", {
      xfs: {
        existsSync: () => true,
        readFile: (_x: string, _y = "utf-8") => Promise.resolve("0.0.48-smoke"),
      },
      xenv: {},
    }),
  ).toContain("0.0.48-smoke");
});

it("getVersion file with scope", async () => {
  expect(
    await getVersion("wurst", {
      xfs: {
        existsSync: () => true,
        readFile: (_x: string, _y = "utf-8") => Promise.resolve("wost@0.0.48-smoke"),
      },
      xenv: {},
    }),
  ).toContain("0.0.48-smoke");
});

it("getVersion file with scope and v", async () => {
  expect(
    await getVersion("wurst", {
      xfs: {
        existsSync: () => true,
        readFile: (_x: string, _y = "utf-8") => Promise.resolve("wost@v0.0.48-smoke"),
      },
      xenv: {},
    }),
  ).toContain("0.0.48-smoke");
});

it("getVersion file with ref", async () => {
  expect(
    await getVersion("wurst", {
      xfs: {
        existsSync: () => true,
        readFile: (_x: string, _y = "utf-8") => Promise.resolve("d/d/wost@0.0.48-smoke"),
      },
      xenv: {},
    }),
  ).toContain("0.0.48-smoke");
});

it("getVersion with v", async () => {
  expect(await getVersion(undefined, { xenv: { GITHUB_REF: "v0.0.8-smoke" } })).toContain("0.0.8-smoke");
});

it("getVersion with scope and v", async () => {
  expect(await getVersion(undefined, { xenv: { GITHUB_REF: "blub@v0.0.8-smoke" } })).toContain("0.0.8-smoke");
});

it("getVersion with scope and no v", async () => {
  expect(await getVersion(undefined, { xenv: { GITHUB_REF: "blub@0.0.8-smoke" } })).toContain("0.0.8-smoke");
});

it("getVersion without", async () => {
  expect(await getVersion(undefined, { xenv: { GITHUB_REF: "0.0.9-smoke" } })).toContain("0.0.9-smoke");
});

it("getVersion ref without", async () => {
  expect(await getVersion(undefined, { xenv: { GITHUB_REF: "v0.0.9-smoke" } })).toContain("0.0.9-smoke");
});

it("getVersion ref with v", async () => {
  expect(await getVersion(undefined, { xenv: { GITHUB_REF: "a/ref/v0.0.8-smoke" } })).toContain("0.0.8-smoke");
});

it("getVersion ref with scope and v", async () => {
  expect(await getVersion(undefined, { xenv: { GITHUB_REF: "a/ref/blub@v0.0.8-smoke" } })).toContain("0.0.8-smoke");
});

it("getVersion ref with scope and no v", async () => {
  expect(await getVersion(undefined, { xenv: { GITHUB_REF: "a/ref/blub@0.0.8-smoke" } })).toContain("0.0.8-smoke");
});

it("getVersion ref without", async () => {
  expect(await getVersion(undefined, { xenv: { GITHUB_REF: "a/ref/0.0.9-smoke" } })).toContain("0.0.9-smoke");
});
